const express = require('express');
const mongoose = require('mongoose');

const Profile = require('../models/Profile');
const Like = require('../models/Like');
const Match = require('../models/Match');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { toPublicProfileJSON } = require('../utils/profileSerializers');
const { canonicalPair, isMutualLike } = require('../utils/matchUtils');
const { createNotification } = require('../utils/notificationUtils');
const { getBlockedUserIds } = require('../utils/blockUtils');
const { checkAndAwardBadges } = require('../utils/badgeUtils');
const {
  tryConsumeDailyLike,
  tryConsumePriorityLike,
  getActiveBoostedUserIds,
} = require('../utils/entitlementUtils');
const { DATING_INTENTIONS, MIN_AGE } = require('../constants/profileOptions');
const {
  SWIPE_ACTIONS,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  MAX_DISTANCE_KM_CAP,
  MAX_AGE_PREF_CAP,
  DEFAULT_MAX_AGE_PREF,
  RANKING_POOL_SIZE,
} = require('../constants/discoveryOptions');
const { getEffectivePreferences, dobRangeForAgeRange } = require('../utils/matchPreferenceUtils');
const { isWithinDistance } = require('../utils/geoUtils');
const { computeCompatibility } = require('../utils/compatibilityUtils');
const { computeRankScore, getRankingWeights } = require('../utils/discoveryRankingUtils');

const router = express.Router();

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toLikeJSON(like) {
  return {
    id: like._id,
    fromUserId: like.fromUser,
    toUserId: like.toUser,
    action: like.action,
    // Task #16 — Priority Like (V2 scope). Always `false` for a 'pass' or an
    // ordinary like — see backend/models/Like.js's field comment.
    priority: !!like.priority,
    createdAt: like.createdAt,
  };
}

function toMatchJSON(match) {
  return {
    id: match._id,
    users: match.users,
    matchedAt: match.matchedAt,
  };
}

// Creates a Match if `toUserId` already liked `fromUserId` back (i.e. the
// like just recorded completed a mutual like). Safe against a concurrent
// duplicate: the compound unique index on (userA, userB) is the real source
// of truth — a race that loses is treated as "the match already exists",
// not an error.
async function createMatchIfMutual(fromUserId, toUserId) {
  const reciprocal = await Like.findOne({ fromUser: toUserId, toUser: fromUserId });
  if (!isMutualLike(reciprocal)) return null;

  const [userA, userB] = canonicalPair(fromUserId, toUserId);
  try {
    return await Match.create({ userA, userB, unmatched: false });
  } catch (err) {
    if (err.code === 11000) {
      // Another concurrent swipe (or a retried request) already created the
      // match for this pair — return the existing one instead of erroring.
      return Match.findOne({ userA, userB });
    }
    throw err;
  }
}

// GET /api/discovery/feed (protected) — paginated candidate profiles for the
// caller. Excludes self, users already liked/passed, users already matched,
// blocked/blocked-by users, suspended users, and (Task #14) incognito
// users. Applies the caller's persisted match preferences (location/age/
// dating-intention/verified-only — see docs/DATABASE_SCHEMA.md's
// `profiles.preferences` section), optionally overridden one-off for this
// single request via `?maxDistanceKm=`/`?minAge=`/`?maxAge=`/
// `?verifiedOnly=` query params (never persisted — "search wider" UX). The
// legacy ad-hoc `?datingIntention=`/`?city=` query params from Task #4 are
// preserved unchanged for backward compatibility.
//
// TWO DISTINCT LAYERS (Task #19 — weighted ranking, built on top of Task
// #14's eligibility filtering): (1) ELIGIBILITY — the MongoDB `filter` built
// below, a hard yes/no gate; a candidate that fails it is never fetched at
// all. (2) RANKING — backend/utils/discoveryRankingUtils.js's
// computeRankScore(), applied only to candidates that already passed (1),
// purely to decide ORDER (compatibility/distance-closeness/profile-trust/
// recent-activity, weighted). Ranking can never surface an ineligible
// candidate and can never drop an eligible one — see the pool-fetch comment
// further down for exactly where each layer runs. Task #16 (Profile Boost +
// Priority Like, V2) adds two more RANKING-layer (not eligibility-layer)
// bonuses on top of that same weighted score — see
// discoveryRankingUtils.js's BOOST_RANK_BONUS/PRIORITY_LIKE_RANK_BONUS and
// the bulk boosted/priority-liker queries further down — a boosted or
// priority-liking candidate can rank higher, but a Boost/Priority Like can
// never make an ineligible candidate appear either; it only nudges the
// ORDER within the same eligibility-filtered pool.
//
// CRITICAL correctness rule (Task #14 audit finding — see PROJECT_STATE.md):
// gender and age matching are both BIDIRECTIONAL. Previously this feed had
// NO gender filtering at all (any gender was shown to any gender) and NO
// age-preference filtering. See backend/utils/matchPreferenceUtils.js for
// the documented rule this query implements, and
// backend/__verify_match_preferences.js (standalone, deleted before commit)
// for the fixture-based proof.
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const myProfile = await Profile.findOne({ user: req.user.id });
    if (!myProfile) {
      return res.status(404).json({ message: 'Create your profile before browsing discovery' });
    }

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_FEED_LIMIT;
    limit = Math.min(limit, MAX_FEED_LIMIT);

    // --- Task #14: one-off query-param overrides (never persisted) ---
    const overrides = {};
    if (req.query.maxDistanceKm !== undefined) {
      const v = Number(req.query.maxDistanceKm);
      if (!Number.isFinite(v) || v < 1 || v > MAX_DISTANCE_KM_CAP) {
        return res
          .status(400)
          .json({ message: `maxDistanceKm must be between 1 and ${MAX_DISTANCE_KM_CAP}` });
      }
      overrides.maxDistanceKm = v;
    }
    if (req.query.minAge !== undefined) {
      const v = Number(req.query.minAge);
      if (!Number.isInteger(v) || v < MIN_AGE || v > MAX_AGE_PREF_CAP) {
        return res
          .status(400)
          .json({ message: `minAge must be a whole number between ${MIN_AGE} and ${MAX_AGE_PREF_CAP}` });
      }
      overrides.minAge = v;
    }
    if (req.query.maxAge !== undefined) {
      const v = Number(req.query.maxAge);
      if (!Number.isInteger(v) || v < MIN_AGE || v > MAX_AGE_PREF_CAP) {
        return res
          .status(400)
          .json({ message: `maxAge must be a whole number between ${MIN_AGE} and ${MAX_AGE_PREF_CAP}` });
      }
      overrides.maxAge = v;
    }
    if (req.query.verifiedOnly !== undefined) {
      overrides.verifiedOnly = String(req.query.verifiedOnly).toLowerCase() === 'true';
    }
    if (overrides.minAge !== undefined && overrides.maxAge !== undefined && overrides.maxAge < overrides.minAge) {
      return res.status(400).json({ message: 'maxAge must be greater than or equal to minAge' });
    }

    const myEffectivePrefs = getEffectivePreferences(myProfile, overrides, MIN_AGE);
    // Virtual, derived from dateOfBirth — profile creation already requires
    // dateOfBirth (see the isCreate check below in routes/profile.js), so
    // this should never be null in practice; defensively fall back to the
    // MIN_AGE floor rather than let a null flow into the $expr comparison
    // below and silently match nothing.
    const myAge = myProfile.age ?? MIN_AGE;

    // Only show profiles complete enough to be worth showing (has the bare
    // minimum from profile creation: name, DOB, gender), never incognito
    // users (Task #14 — Private/Incognito browsing).
    const filter = {
      displayName: { $nin: [null, ''] },
      dateOfBirth: { $ne: null },
      gender: { $ne: null },
      'privacySettings.incognito': { $ne: true },
    };

    // --- CRITICAL: bidirectional gender matching (Task #14 audit fix) ---
    // (a) candidate's gender must be something I want to see — an empty/
    // unset interestedIn or one containing 'everyone' is permissive (no
    // filter), matching backend/utils/matchPreferenceUtils.js#wantsGender().
    if (
      Array.isArray(myProfile.interestedIn) &&
      myProfile.interestedIn.length > 0 &&
      !myProfile.interestedIn.includes('everyone')
    ) {
      filter.gender = { $in: myProfile.interestedIn };
    }
    // (b) I must be something the candidate wants to see — same permissive
    // rule for their (possibly empty/unset) interestedIn.
    filter.$or = [
      { interestedIn: { $in: [myProfile.gender, 'everyone'] } },
      { interestedIn: { $exists: false } },
      { interestedIn: { $size: 0 } },
    ];

    // --- CRITICAL: bidirectional age matching (Task #14) ---
    // (a) candidate's age must fall within MY preferred range — translated
    // into an indexable dateOfBirth range (see dobRangeForAgeRange()) rather
    // than filtered in application code.
    const { minDob, maxDob } = dobRangeForAgeRange(myEffectivePrefs.minAge, myEffectivePrefs.maxAge);
    filter.dateOfBirth = { $gte: minDob, $lte: maxDob };
    // (b) MY age must fall within the CANDIDATE's preferred range — this
    // varies per candidate document, so it needs $expr. $ifNull covers
    // profiles saved before this Task #14 migration that have no
    // `preferences` sub-document persisted yet (Mongoose schema defaults
    // don't apply inside a raw $expr — it runs against the stored document,
    // not a hydrated Mongoose document).
    filter.$expr = {
      $and: [
        { $lte: [{ $ifNull: ['$preferences.minAge', MIN_AGE] }, myAge] },
        { $gte: [{ $ifNull: ['$preferences.maxAge', DEFAULT_MAX_AGE_PREF] }, myAge] },
      ],
    };

    // --- Dating intention: one-off query override takes precedence over
    // the stored preference (unchanged Task #4 behavior); otherwise fall
    // back to the persisted preferences.datingIntentions list (Task #14). ---
    if (req.query.datingIntention !== undefined) {
      const intention = String(req.query.datingIntention).trim();
      if (!DATING_INTENTIONS.includes(intention)) {
        return res
          .status(400)
          .json({ message: `datingIntention must be one of: ${DATING_INTENTIONS.join(', ')}` });
      }
      filter.datingIntention = intention;
    } else if (myEffectivePrefs.datingIntentions.length > 0) {
      filter.datingIntention = { $in: myEffectivePrefs.datingIntentions };
    }

    if (req.query.city !== undefined && String(req.query.city).trim()) {
      const city = String(req.query.city).trim();
      filter.city = new RegExp(`^${escapeRegExp(city)}$`, 'i');
    }

    // Exclude: self, anyone already swiped on (like or pass, either
    // decision means "don't show again"), anyone already matched with, and
    // — Task #10 (Safety — Report/Block, see docs/ROADMAP.md's Phase 8) —
    // anyone involved in a block with the caller in EITHER direction: users
    // the caller has blocked, and users who have blocked the caller. This
    // was the discovery.js `TODO(Report/Block...)` referenced by
    // docs/API_DOCUMENTATION.md/TODO.md — now implemented via the shared
    // backend/utils/blockUtils.js#getBlockedUserIds() helper so this exact
    // bidirectional rule is applied identically in the matches list too
    // (backend/routes/matches.js).
    // Task #11 (Admin panel, see docs/ROADMAP.md's Phase 9): also exclude
    // any suspended user from discovery entirely — in both directions,
    // matching the "don't show me, don't show them to anyone" spirit of the
    // blocked-user exclusion above (a suspended user is blocked at login
    // too — see backend/routes/auth.js — so this is mostly defense-in-depth
    // for a still-valid, not-yet-expired token from before the suspension).
    const [alreadySwipedIds, myMatches, blockedIds, suspendedIds, verifiedUserIds] = await Promise.all([
      Like.find({ fromUser: req.user.id }).distinct('toUser'),
      Match.find({ users: req.user.id, unmatched: false }).select('users'),
      getBlockedUserIds(req.user.id),
      User.find({ accountStatus: 'SUSPENDED' }).distinct('_id'),
      // Task #14 — preferences.verifiedOnly: "only show profiles the caller
      // wants to SEE that are photo-verified" (Task #9's photoVerified
      // boolean). Only queried when actually needed.
      myEffectivePrefs.verifiedOnly
        ? User.find({ 'photoVerification.status': 'VERIFIED' }).distinct('_id')
        : Promise.resolve(null),
    ]);
    const matchedIds = myMatches.map((m) =>
      m.users.find((u) => u.toString() !== req.user.id)
    );

    const excludedIds = new Set(
      [req.user.id, ...alreadySwipedIds, ...matchedIds, ...blockedIds, ...suspendedIds].map(String)
    );
    filter.user =
      verifiedUserIds !== null
        ? { $in: verifiedUserIds, $nin: [...excludedIds] }
        : { $nin: [...excludedIds] };

    // --- Task #19: bounded candidate pool for ranking. ---
    // CRITICAL — this is still the same `filter` built above from every one
    // of Task #14's hard eligibility rules (bidirectional gender/age,
    // distance cap, dating-intention, verified-only, incognito, blocks,
    // already-swiped/matched, suspended) — ranking never widens or bypasses
    // that filter, it only decides the ORDER of what the filter already
    // allowed through. We deliberately do NOT fetch "everyone" here: only
    // RANKING_POOL_SIZE already-eligible candidates are pulled per request
    // (a natural `createdAt`-desc DB order, cheap and indexed) and THAT
    // bounded set is what gets scored — see
    // backend/utils/discoveryRankingUtils.js's top comment and
    // backend/constants/discoveryOptions.js#RANKING_POOL_SIZE. Pagination
    // (`page`/`limit`) is applied AFTER scoring+sorting, in application
    // code, not as a second DB query per page — so every page for a given
    // request session is drawn from (and ranked within) the same pool.
    // **Known, documented trade-off (same shape as Task #14's distance-page
    // trade-off below):** once `page * limit` exceeds RANKING_POOL_SIZE,
    // `hasMore` becomes `false` even if more eligible candidates exist
    // further into the collection — a "search wider"-style re-request (a
    // fresh page-1 call, which re-draws a fresh top-RANKING_POOL_SIZE pool)
    // is the workaround, exactly like the distance-filter trade-off already
    // documented in docs/API_DOCUMENTATION.md's Discovery section.
    const pool = await Profile.find(filter).sort({ createdAt: -1 }).limit(RANKING_POOL_SIZE);

    // --- Task #14: distance filtering (application layer, not a Mongo geo
    // query — see docs/DATABASE_SCHEMA.md's `preferences` section and
    // MOCK_FEATURES.md for exactly why: most profiles only have an
    // *approximate* city-center coordinate rather than a real geocoded one,
    // and this rule must gracefully include (never crash/exclude-by-default)
    // any profile — mine or the candidate's — that has no coordinate at
    // all yet. This now runs over the whole pool (before ranking/pagination,
    // not after a DB-level skip/limit as it did pre-Task #19) so the
    // distance signal below has a real distanceKm for every scored
    // candidate wherever one is resolvable. ---
    const myCoords = myProfile.location?.coordinates || null;
    const distanceById = new Map();
    const eligiblePool = pool.filter((p) => {
      const candidateCoords = p.location?.coordinates || null;
      const { withinDistance, distanceKm } = isWithinDistance(
        myCoords,
        candidateCoords,
        myEffectivePrefs.maxDistanceKm
      );
      if (withinDistance) distanceById.set(String(p.user), distanceKm);
      return withinDistance;
    });

    // Task #9 — Verification: bulk-fetch verification badges (+ Task #19's
    // `lastLoginAt` activity signal) for the whole pool in one query rather
    // than N+1, same batching pattern as backend/routes/matches.js's
    // otherUser profile lookup.
    const candidateUsers = await User.find({
      _id: { $in: eligiblePool.map((p) => p.user) },
    }).select('mobileVerification.status photoVerification.status lastLoginAt');
    const userById = new Map(candidateUsers.map((u) => [String(u._id), u]));

    // --- Task #16: Profile Boost + Priority Like ranking bonuses. Both are
    // ONE bulk query each against the already-bounded pool's user ids (never
    // N+1) — see backend/utils/discoveryRankingUtils.js's top comment above
    // BOOST_RANK_BONUS/PRIORITY_LIKE_RANK_BONUS for the full mechanism/
    // magnitude writeup. ---
    const poolUserIds = eligiblePool.map((p) => p.user);
    // Shared "now" for both the boost/priority-like lookups below and
    // Task #19's activity-signal scoring further down — one timestamp for
    // the whole request, not re-read per candidate.
    const now = new Date();
    // (a) Profile Boost — a candidate with any currently-active (non-expired)
    // Boost document ranks higher for EVERY viewer, not just this one.
    const boostedUserIdsPromise = getActiveBoostedUserIds(poolUserIds, now);
    // (b) Priority Like — "has this candidate sent ME (the viewer) a
    // priority like I haven't yet swiped on" — TARGETED to this one viewer,
    // not a global boost. Every candidate still in `eligiblePool` has, by
    // construction, never been swiped on by the viewer yet (already-swiped
    // users are excluded from `filter.user` above), so this query only needs
    // `fromUser` (in the pool) + `toUser` (me) + `action: 'like'` +
    // `priority: true` — a single indexed lookup, not a second pass over
    // "everyone who ever priority-liked me".
    const pendingPriorityLikerIdsPromise = Like.find({
      fromUser: { $in: poolUserIds },
      toUser: req.user.id,
      action: 'like',
      priority: true,
    }).distinct('fromUser');
    const [boostedUserIds, pendingPriorityLikerIdsRaw] = await Promise.all([
      boostedUserIdsPromise,
      pendingPriorityLikerIdsPromise,
    ]);
    const pendingPriorityLikerIds = new Set(pendingPriorityLikerIdsRaw.map(String));

    // --- Task #19: score + sort the pool. ---
    // `computeCompatibility()` is Task #15's existing Why-You-Match scorer,
    // reused directly (not re-derived) both as the ranking's heaviest signal
    // AND as the response's own `compatibility` field below — computed
    // exactly once per candidate either way. See
    // backend/utils/discoveryRankingUtils.js for the full weighting/
    // normalization writeup. `now` is the shared timestamp declared above,
    // ahead of the boost/priority-like queries.
    const rankingWeights = getRankingWeights();
    const scoredPool = eligiblePool.map((p) => {
      const candidateUser = userById.get(String(p.user));
      const compatibility = computeCompatibility(myProfile, p);
      const distanceKm = distanceById.has(String(p.user)) ? distanceById.get(String(p.user)) : null;
      const candidateIdStr = String(p.user);
      const { rankScore } = computeRankScore(
        {
          compatibilityScore: compatibility.score,
          distanceKm,
          maxDistanceKm: myEffectivePrefs.maxDistanceKm,
          profileCompletionPercentage: p.profileCompletionPercentage,
          mobileVerified: candidateUser?.mobileVerification?.status === 'VERIFIED',
          photoVerified: candidateUser?.photoVerification?.status === 'VERIFIED',
          lastLoginAt: candidateUser?.lastLoginAt || null,
          now,
          // Task #16 — see the bulk queries above; both are plain O(1) Set
          // lookups here, no further DB access per candidate.
          isBoosted: boostedUserIds.has(candidateIdStr),
          hasPendingPriorityLike: pendingPriorityLikerIds.has(candidateIdStr),
        },
        rankingWeights
      );
      return { profile: p, candidateUser, compatibility, distanceKm, rankScore };
    });
    // Sort by rankScore descending; `createdAt` desc (the pool's own fetch
    // order, still present via Array.prototype.sort's stability) breaks ties
    // deterministically rather than reshuffling equal scores every request.
    scoredPool.sort((a, b) => b.rankScore - a.rankScore);

    // --- Pagination window over the already-sorted, already-scored pool. ---
    const windowStart = (page - 1) * limit;
    const windowSlice = scoredPool.slice(windowStart, windowStart + limit + 1);
    const hasMore = windowSlice.length > limit;
    const pageScored = windowSlice.slice(0, limit);

    return res.json({
      profiles: pageScored.map(({ profile, candidateUser, compatibility, distanceKm }) => ({
        ...toPublicProfileJSON(profile, candidateUser),
        // Task #14 — surfaced for the frontend; null when either side's
        // coordinates are unknown (see isWithinDistance() above), never a
        // guessed/fabricated number.
        distanceKm,
        // Task #19 — response transparency: the same Why-You-Match
        // `{ score, reasons }` Task #15 already surfaces on Matches, now
        // also on Discovery cards, since ranking is now driven by it and
        // computing it here is already-paid-for (see above) — never an
        // extra query. `reasons` is `[]`/`score` is `0` for a genuine
        // non-match, never fabricated, same as everywhere else this
        // function is used (backend/utils/compatibilityUtils.js).
        compatibility,
      })),
      page,
      hasMore,
      appliedPreferences: myEffectivePrefs,
    });
  } catch (err) {
    console.error('Discovery feed error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/discovery/swipe (protected) — body { toUserId, action }.
// Records a like/pass, and if it completes a mutual like, creates a Match.
router.post('/swipe', requireAuth, async (req, res) => {
  try {
    const { toUserId, action, priority } = req.body || {};

    if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({ message: 'toUserId must be a valid user id' });
    }
    if (!SWIPE_ACTIONS.includes(action)) {
      return res.status(400).json({ message: `action must be one of: ${SWIPE_ACTIONS.join(', ')}` });
    }
    if (String(toUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot swipe on yourself' });
    }
    // Task #16 — Priority Like (V2 scope, "Super Like" equivalent): optional
    // `priority: true` in the body, only meaningful alongside `action:
    // 'like'` — a 'pass' can never be priority (there's nothing to
    // prioritize). Reject a malformed/misapplied combination outright
    // (400) rather than silently downgrading it to a normal swipe, per the
    // task's own "never silently downgrade" instruction.
    if (priority !== undefined && typeof priority !== 'boolean') {
      return res.status(400).json({ message: 'priority must be a boolean' });
    }
    const wantsPriority = priority === true;
    if (wantsPriority && action !== 'like') {
      return res.status(400).json({ message: 'priority can only be set on a "like" swipe' });
    }

    // Profile-must-exist checks (same pattern as backend/routes/profile.js):
    // both sides need a profile for a swipe to be meaningful. Note: 18+ is
    // already a hard requirement enforced at profile creation/update time
    // (see backend/routes/profile.js), so it doesn't need re-checking here.
    const [myProfile, targetProfile] = await Promise.all([
      Profile.findOne({ user: req.user.id }),
      Profile.findOne({ user: toUserId }),
    ]);
    if (!myProfile) {
      return res.status(404).json({ message: 'Create your profile before swiping' });
    }
    if (!targetProfile) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existing = await Like.findOne({ fromUser: req.user.id, toUser: toUserId });
    if (existing) {
      if (existing.action === action) {
        // Idempotent repeat of the same swipe — not an error, just return
        // the current state (including any match that already resulted).
        const [userA, userB] = canonicalPair(req.user.id, toUserId);
        const match = await Match.findOne({ userA, userB, unmatched: false });
        return res.status(200).json({
          like: toLikeJSON(existing),
          alreadySwiped: true,
          matchCreated: false,
          match: match ? toMatchJSON(match) : null,
        });
      }
      // Swiped the other way before — don't silently flip it; the client
      // should treat this as "already decided", not retry with a new action.
      return res.status(409).json({
        message: `You already swiped '${existing.action}' on this user`,
        like: toLikeJSON(existing),
      });
    }

    // Task #12 — Subscription scaffolding: server-side entitlement
    // enforcement demo. Only NEW 'like' swipes consume the free-tier daily
    // quota (a 'pass' is free; an idempotent repeat of an already-recorded
    // swipe already returned above and never reaches here). Checked BEFORE
    // Like.create() so a blocked swipe is never persisted. hasFeature()
    // (via tryConsumeDailyLike) always re-reads the caller's subscription
    // from the database — never trusts any client-submitted "isPremium"
    // claim. See docs/BUSINESS_PLAN.md for the chosen limit.
    if (action === 'like') {
      const limitCheck = await tryConsumeDailyLike(req.user.id);
      if (!limitCheck.allowed) {
        return res.status(429).json({
          message: `You've reached today's free like limit (${limitCheck.limit}/day). Upgrade to CG_PLUS for unlimited likes.`,
          upgradeRequired: true,
          dailyLikeLimit: limitCheck.limit,
        });
      }
    }

    // Task #16 — Priority Like entitlement: a SEPARATE, non-resetting credit
    // from the daily like quota just consumed above — a priority like is an
    // upgrade layered ON TOP of an ordinary like (it still counts against
    // the daily free-like quota, same as any other like; unlimited-likes
    // plan holders bypass that quota exactly as before), not a replacement
    // for it. Checked/consumed AFTER the daily-quota check (so a caller who
    // was going to hit the daily limit anyway gets that more fundamental
    // 429 first) but still BEFORE Like.create() — a rejected priority
    // request must never partially record anything. Deliberately a distinct
    // status code (402, not 429) from the daily-quota limit above: running
    // out of a spent, non-resetting credit is a genuinely different
    // situation from hitting a quota that resets tomorrow — "come back
    // tomorrow" is real advice for the 429 case and false advice for this
    // one, so collapsing them into the same status/copy would mislead the
    // caller about when the block lifts.
    if (wantsPriority) {
      const priorityCheck = await tryConsumePriorityLike(req.user.id);
      if (!priorityCheck.allowed) {
        return res.status(402).json({
          message: "You're out of Priority Likes. Upgrade your plan for more.",
          upgradeRequired: true,
          priorityLikesRemaining: priorityCheck.remaining,
        });
      }
    }

    let like;
    try {
      like = await Like.create({
        fromUser: req.user.id,
        toUser: toUserId,
        action,
        priority: wantsPriority,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Race: a concurrent request recorded this swipe first.
        const raced = await Like.findOne({ fromUser: req.user.id, toUser: toUserId });
        return res.status(409).json({
          message: `You already swiped '${raced.action}' on this user`,
          like: toLikeJSON(raced),
        });
      }
      throw err;
    }

    let match = null;
    if (action === 'like') {
      match = await createMatchIfMutual(req.user.id, toUserId);
    }

    // Task #20 — Achievements/Badges (V2 scope): a mutual match is one of
    // this feature's natural award points (FIRST_MATCH/MATCHES_10/
    // MATCHES_50 — see backend/constants/badgeOptions.js). Checked for BOTH
    // participants — a match is symmetric, either side may be the one
    // crossing a threshold. Isolated in its own try/catch (badge-checking
    // must never turn a successful swipe into a 500); each side's badge
    // notification (if any) is created independently inside
    // checkAndAwardBadges() itself.
    if (match) {
      try {
        const io = req.app.get('io');
        await Promise.all([
          checkAndAwardBadges(req.user.id, 'match', io),
          checkAndAwardBadges(toUserId, 'match', io),
        ]);
      } catch (badgeErr) {
        console.error('Badge check error (swipe/match):', badgeErr);
      }
    }

    // Notification creation (Task #6, see docs/ROADMAP.md Phase 6).
    // Deliberately isolated in its own try/catch so a notification failure
    // (e.g. a preference-lookup hiccup) can never turn a successful swipe
    // into a 500 — the swipe itself has already been recorded above.
    try {
      const io = req.app.get('io');
      if (match) {
        // Mutual match — notify both participants, each learning the
        // *other* person's identity. Not premium-gated: a match already
        // reveals both sides to each other by definition, unlike a
        // one-sided 'like' below.
        await Promise.all([
          createNotification({
            recipientId: req.user.id,
            type: 'match',
            payload: {
              matchId: String(match._id),
              fromUserId: String(toUserId),
              fromUserName: targetProfile?.displayName || null,
            },
            io,
          }),
          createNotification({
            recipientId: toUserId,
            type: 'match',
            payload: {
              matchId: String(match._id),
              fromUserId: String(req.user.id),
              fromUserName: myProfile?.displayName || null,
            },
            io,
          }),
        ]);
      } else if (action === 'like') {
        // Not yet mutual — notify the recipient that *someone* liked them,
        // but never reveal who: "see who liked you" is listed as a
        // premium-tier reveal in docs/BUSINESS_PLAN.md, so this payload
        // deliberately carries no identifying fields. The frontend renders
        // a generic "Someone liked your profile" message from `type` alone.
        // Task #16 — Priority Like (V2 scope): a `priority: true` payload
        // flag is the ONE exception to "no identifying fields" — it's not
        // identifying (it never says WHO), only distinguishing (it says
        // "this like was a Priority Like"), which is exactly the DISTINCT
        // notification copy the task asked for ("Someone sent you a
        // Priority Like!" vs. the generic "Someone liked your profile") —
        // same `type: 'like'` (reusing the existing type/preference-gate
        // rather than inventing a new notification type + a new
        // `likeNotifications`-adjacent preference toggle for what is still
        // fundamentally a like event), distinguished by payload alone, the
        // same way `type: 'message'`'s payload already varies per message
        // without needing its own type per message kind. A priority like
        // that ALSO completes a mutual match takes the `match` branch above
        // instead — a match notification already reveals full identity, so
        // there's nothing left for a separate "it was a priority like" flag
        // to add in that case (same reasoning an ordinary like's
        // notification is already superseded by the match notification
        // today).
        await createNotification({
          recipientId: toUserId,
          type: 'like',
          payload: wantsPriority ? { priority: true } : {},
          io,
        });
      }
    } catch (notifyErr) {
      console.error('Notification creation error (swipe):', notifyErr);
    }

    return res.status(201).json({
      like: toLikeJSON(like),
      matchCreated: !!match,
      match: match ? toMatchJSON(match) : null,
    });
  } catch (err) {
    console.error('Swipe error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
