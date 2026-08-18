// Referral program helpers (Task #17 — Invite & Earn, V2 scope; see
// docs/BUSINESS_PLAN.md's Growth Strategy and TODO.md's V2 section). Split
// into small, mostly-DB-independent functions so they're unit-testable via
// a standalone Node script without a live MongoDB connection — same pattern
// already used by backend/utils/matchUtils.js / entitlementUtils.js.

const crypto = require('crypto');

const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { MS_PER_DAY } = require('../constants/subscriptionOptions');
const {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_RE,
  REFERRAL_CODE_GENERATION_MAX_ATTEMPTS,
  REFERRAL_REWARD_PLAN_CODE,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_PAYMENT_PROVIDER,
} = require('../constants/referralOptions');

// A single random referral code — uppercase, fixed length, drawn from
// REFERRAL_CODE_ALPHABET (ambiguous characters like 0/O/1/I already
// excluded there). Uses crypto.randomInt (not Math.random) for the same
// "don't use a predictable PRNG for anything identifier-like" reasoning
// already applied to OTP generation (backend/utils/verificationUtils.js).
function generateReferralCode() {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_CODE_ALPHABET[crypto.randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

// Generates a referral code guaranteed unique against the `users` collection
// at generation time, retrying on collision (see
// backend/constants/referralOptions.js's REFERRAL_CODE_GENERATION_MAX_ATTEMPTS
// for why this is defense-in-depth, not an expected hot path — the code
// space is ~34 billion). The schema's `unique: true` index on
// `User.referralCode` remains the final race-safe guard: if two concurrent
// signups somehow generate the same code, the loser's `User.create()` call
// in the signup route will throw a duplicate-key error, which the route
// handles by retrying signup with a freshly generated code (see
// backend/routes/auth.js).
async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < REFERRAL_CODE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateReferralCode();
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential;
    // this only loops on an actual collision, which is expected to never
    // happen in practice.
    const exists = await User.exists({ referralCode: candidate });
    if (!exists) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique referral code — please try again');
}

// Format check only (charset + length) — does NOT check existence. Used by
// the signup route to distinguish "clearly malformed input" from "a
// well-formed code that just doesn't resolve to anyone" for logging
// purposes; both cases result in the same lenient behavior (see
// backend/routes/auth.js's signup route comment for the documented
// UX choice).
function isValidReferralCodeFormat(code) {
  return typeof code === 'string' && REFERRAL_CODE_RE.test(code);
}

// Normalizes caller input the same way the signup route does before
// looking it up / storing it: trim + uppercase. Exported so the route and
// any future caller apply identical normalization.
function normalizeReferralCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : code;
}

// Grants one referral reward: a new short-lived CG_PLUS Subscription
// document for `userId` (see backend/constants/referralOptions.js for the
// exact plan/duration chosen and why). Does NOT touch any existing
// subscription the user may already have — this is simply a new row, same
// "one document per checkout" pattern backend/models/Subscription.js
// already uses; backend/utils/entitlementUtils.js#getEffectiveSubscription()
// naturally picks whichever of a user's rows expires furthest in the
// future, so a reward never shortens an existing longer subscription.
// Returns the created Subscription, or null if the CG_PLUS plan isn't
// currently seeded/active (defensive — should always exist per
// backend/utils/entitlementUtils.js#seedDefaultPlans(), called at server
// startup).
async function grantReferralReward(userId, { days = REFERRAL_REWARD_DAYS, now = new Date() } = {}) {
  const plan = await Plan.findOne({ code: REFERRAL_REWARD_PLAN_CODE, isActive: true });
  if (!plan) {
    console.warn(
      `Referral reward skipped for user ${userId}: plan ${REFERRAL_REWARD_PLAN_CODE} not found/active`
    );
    return null;
  }

  const expiresAt = new Date(now.getTime() + days * MS_PER_DAY);

  return Subscription.create({
    user: userId,
    plan: plan._id,
    status: 'ACTIVE',
    startedAt: now,
    expiresAt,
    paymentProvider: REFERRAL_REWARD_PAYMENT_PROVIDER,
    paymentReference: `referral_reward_${crypto.randomBytes(10).toString('hex')}`,
  });
}

// Grants the reward to both sides of a completed referral (referrer +
// brand-new referee). Each grant is isolated in its own try/catch so one
// side failing (e.g. a transient DB hiccup) doesn't lose the other, and —
// critically — neither failure is ever allowed to fail the signup request
// itself; same "isolate side-effect from the main success path" pattern
// already used by backend/utils/notificationUtils.js's callers. Returns
// { referrerReward, refereeReward } (either may be null on failure).
async function grantMutualReferralReward(referrerUserId, refereeUserId, opts = {}) {
  let referrerReward = null;
  let refereeReward = null;

  try {
    referrerReward = await grantReferralReward(referrerUserId, opts);
  } catch (err) {
    console.error(`Referral reward grant failed for referrer ${referrerUserId}:`, err.message);
  }

  try {
    refereeReward = await grantReferralReward(refereeUserId, opts);
  } catch (err) {
    console.error(`Referral reward grant failed for referee ${refereeUserId}:`, err.message);
  }

  return { referrerReward, refereeReward };
}

module.exports = {
  generateReferralCode,
  generateUniqueReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
  grantReferralReward,
  grantMutualReferralReward,
};
