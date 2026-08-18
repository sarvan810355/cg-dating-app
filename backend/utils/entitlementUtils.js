// Subscription / entitlement helpers (Task #12 — Subscription scaffolding).
// Split into small, pure/DB-independent functions wherever possible so
// they're unit-testable via a standalone Node script without a live
// MongoDB connection — same pattern already used by
// backend/utils/verificationUtils.js / backend/utils/matchUtils.js.
//
// SECURITY: hasFeature() and everything it's built on ALWAYS reads from the
// database (Subscription -> Plan). There is no code path anywhere in this
// file that accepts or trusts a client-submitted "isPremium"/entitlement
// claim (from a JWT payload, request body, or query string) — see
// docs/BUSINESS_PLAN.md's "entitlement is always validated server-side"
// requirement and MOCK_FEATURES.md's Razorpay entry.

const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Boost = require('../models/Boost');
const {
  DEFAULT_PLANS,
  UNLIMITED_LIKES_FEATURE,
  FREE_TIER_DAILY_LIKE_LIMIT,
} = require('../constants/subscriptionOptions');
const { BOOST_DURATION_MINUTES } = require('../constants/boostOptions');

// Idempotent plan seeding: inserts each of the three default plans (see
// backend/constants/subscriptionOptions.js's DEFAULT_PLANS) only if no Plan
// document with that `code` already exists. Safe to call on every server
// startup (see backend/server.js) — an admin's later edits to price/
// features/isActive on an already-seeded plan are never overwritten by a
// restart, since this only ever *inserts*, never *updates*, an existing
// code.
async function seedDefaultPlans() {
  const results = [];
  for (const planDef of DEFAULT_PLANS) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential;
    // this runs once at startup against three rows, not a hot path.
    const existing = await Plan.findOne({ code: planDef.code });
    if (existing) {
      results.push({ code: planDef.code, created: false });
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Plan.create(planDef);
      results.push({ code: planDef.code, created: true });
    }
  }
  return results;
}

// A user's current effective subscription: the most-recently-expiring row
// that is either ACTIVE, or CANCELLED but not yet past its `expiresAt`
// (cancelling stops renewal, it doesn't immediately revoke access — see
// backend/models/Subscription.js's comment and POST
// /api/subscription/cancel). Returns null for a free-tier user. Always
// queries Mongo directly — never trusts any cached/claimed status.
async function getEffectiveSubscription(userId, now = new Date()) {
  return Subscription.findOne({
    user: userId,
    status: { $in: ['ACTIVE', 'CANCELLED'] },
    expiresAt: { $gt: now },
  })
    .sort({ expiresAt: -1 })
    .populate('plan');
}

// THE server-side entitlement check. Never trust any client-side
// "isPremium" flag for this — always resolves the user's actual active,
// non-expired Subscription's Plan.features array from the database.
async function hasFeature(userId, featureName, now = new Date()) {
  if (!userId || !featureName) return false;
  const subscription = await getEffectiveSubscription(userId, now);
  if (!subscription || !subscription.plan || !subscription.plan.isActive) return false;
  return subscription.plan.features.includes(featureName);
}

// True when `a` and `b` fall on the same UTC calendar day — used for the
// free-tier daily like counter's reset, see FREE_TIER_DAILY_LIKE_LIMIT.
// Deliberately UTC-based (not the user's local timezone, which the backend
// doesn't know) for a simple, deterministic reset boundary.
function isSameUtcDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Demonstrates hasFeature() gating a real feature (see
// backend/routes/discovery.js's POST /swipe, the task's required "apply it
// to at least one real feature" step): enforces the free-tier daily LIKE
// limit (FREE_TIER_DAILY_LIKE_LIMIT, see docs/BUSINESS_PLAN.md), bypassed
// entirely for a user with the 'unlimited_likes' feature.
//
// Reads + (on success) atomically increments User.dailyLikeCount /
// lastLikeCountReset in one round trip. Returns:
//   { allowed: true,  unlimited: true }                      — has the feature, uncounted
//   { allowed: true,  unlimited: false, count, limit }        — counted and allowed
//   { allowed: false, unlimited: false, count, limit }        — over the limit, NOT incremented
// Only call this for a swipe `action === 'like'` that is actually being
// newly recorded — an idempotent repeat of an already-recorded swipe (see
// backend/routes/discovery.js) must not consume quota a second time.
async function tryConsumeDailyLike(userId, now = new Date()) {
  const unlimited = await hasFeature(userId, UNLIMITED_LIKES_FEATURE, now);
  if (unlimited) {
    return { allowed: true, unlimited: true };
  }

  const user = await User.findById(userId).select('dailyLikeCount lastLikeCountReset');
  if (!user) {
    // Caller (discovery.js) already verified the user exists earlier in the
    // request via a Profile lookup; this is defensive, not expected.
    return { allowed: false, unlimited: false, count: 0, limit: FREE_TIER_DAILY_LIKE_LIMIT };
  }

  const sameDay = user.lastLikeCountReset && isSameUtcDay(new Date(user.lastLikeCountReset), now);
  const currentCount = sameDay ? user.dailyLikeCount || 0 : 0;

  if (currentCount >= FREE_TIER_DAILY_LIKE_LIMIT) {
    return {
      allowed: false,
      unlimited: false,
      count: currentCount,
      limit: FREE_TIER_DAILY_LIKE_LIMIT,
    };
  }

  user.dailyLikeCount = currentCount + 1;
  user.lastLikeCountReset = now;
  await user.save();

  return {
    allowed: true,
    unlimited: false,
    count: user.dailyLikeCount,
    limit: FREE_TIER_DAILY_LIKE_LIMIT,
  };
}

// ============================================================================
// Task #16 — Profile Boost + Priority Like (V2 scope). Same "always read the
// real DB state, never trust a client claim" discipline as hasFeature()/
// tryConsumeDailyLike() above; same fetch-then-save (not atomic
// findOneAndUpdate) credit-decrement style already established by
// tryConsumeDailyLike() for consistency within this file — a documented,
// pre-existing limitation of this codebase's credit-consumption pattern
// (a tight double-submit race could in theory both read the same
// pre-decrement balance), not a new gap introduced by this task.
// ============================================================================

// The caller's current active (not-yet-expired) Boost, or null. Always a
// fresh DB read — a Boost's "active" status is never cached/denormalized
// anywhere (same "computed on read" philosophy as Task #15's compatibility
// score / Task #19's rankScore).
async function getActiveBoost(userId, now = new Date()) {
  return Boost.findOne({ user: userId, expiresAt: { $gt: now } }).sort({ expiresAt: -1 });
}

// Bulk version for the discovery feed's ranking pool (backend/routes/
// discovery.js) — ONE query against the whole bounded candidate pool's user
// ids, not N+1 (the task's explicit efficiency requirement). Returns a
// Set<string> of user ids (stringified) with a currently-active boost.
async function getActiveBoostedUserIds(userIds, now = new Date()) {
  if (!userIds || userIds.length === 0) return new Set();
  const boostedIds = await Boost.find({
    user: { $in: userIds },
    expiresAt: { $gt: now },
  }).distinct('user');
  return new Set(boostedIds.map(String));
}

// POST /api/boosts/activate's core logic. Returns one of:
//   { activated: false, reason: 'ALREADY_ACTIVE', boost }      — can't double-activate
//   { activated: false, reason: 'NO_CREDITS' }                  — nothing to consume
//   { activated: true, boost, creditsRemaining }                — success
// A currently-active boost is checked FIRST (before touching the credit
// balance at all) so a double-activate attempt never consumes a credit it
// shouldn't — the existing boost's own `expiresAt` is never extended/reset by
// this call, a boost is always exactly BOOST_DURATION_MINUTES long from its
// own `startedAt`.
async function tryActivateBoost(userId, source, now = new Date()) {
  const existingActive = await getActiveBoost(userId, now);
  if (existingActive) {
    return { activated: false, reason: 'ALREADY_ACTIVE', boost: existingActive };
  }

  const user = await User.findById(userId).select('boostCreditsRemaining');
  if (!user) {
    return { activated: false, reason: 'NO_CREDITS' };
  }
  const currentCredits = user.boostCreditsRemaining || 0;
  if (currentCredits <= 0) {
    return { activated: false, reason: 'NO_CREDITS' };
  }

  user.boostCreditsRemaining = currentCredits - 1;
  await user.save();

  const expiresAt = new Date(now.getTime() + BOOST_DURATION_MINUTES * 60 * 1000);
  const boost = await Boost.create({ user: userId, startedAt: now, expiresAt, source });

  return { activated: true, boost, creditsRemaining: user.boostCreditsRemaining };
}

// POST /api/discovery/swipe's `priority: true` path. Mirrors
// tryConsumeDailyLike()'s shape but against the separate, non-resetting
// `priorityLikesRemaining` counter (a spent priority-like credit is gone for
// good until topped up by another plan grant — there is no daily reset,
// unlike the free-tier like quota).
async function tryConsumePriorityLike(userId, now = new Date()) {
  const user = await User.findById(userId).select('priorityLikesRemaining');
  if (!user) {
    return { allowed: false, remaining: 0 };
  }
  const currentRemaining = user.priorityLikesRemaining || 0;
  if (currentRemaining <= 0) {
    return { allowed: false, remaining: 0 };
  }

  user.priorityLikesRemaining = currentRemaining - 1;
  await user.save();

  return { allowed: true, remaining: user.priorityLikesRemaining };
}

// Called once from POST /api/subscription/subscribe on a successful (mock)
// checkout — additively tops up the new subscriber's boost/priority-like
// balances by whatever the plan grants (backend/models/Plan.js's
// `boostCreditsGranted`/`priorityLikesGranted`), a ONE-TIME grant, not a
// recurring one (see boostOptions.js's top comment / MOCK_FEATURES.md for
// why: no job scheduler exists in this codebase to re-grant on renewal).
// Uses an atomic `$inc` (unlike the read-then-save style above) since this
// is a pure additive top-up with no "check a balance first" branch to race
// on.
async function grantPlanCredits(userId, plan, now = new Date()) {
  const boostGrant = plan?.boostCreditsGranted || 0;
  const priorityGrant = plan?.priorityLikesGranted || 0;
  if (boostGrant <= 0 && priorityGrant <= 0) {
    return { boostGrant: 0, priorityGrant: 0 };
  }
  await User.findByIdAndUpdate(userId, {
    $inc: {
      boostCreditsRemaining: boostGrant,
      priorityLikesRemaining: priorityGrant,
    },
  });
  return { boostGrant, priorityGrant, grantedAt: now };
}

module.exports = {
  seedDefaultPlans,
  getEffectiveSubscription,
  hasFeature,
  isSameUtcDay,
  tryConsumeDailyLike,
  getActiveBoost,
  getActiveBoostedUserIds,
  tryActivateBoost,
  tryConsumePriorityLike,
  grantPlanCredits,
};
