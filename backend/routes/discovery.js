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
const { tryConsumeDailyLike } = require('../utils/entitlementUtils');
const { DATING_INTENTIONS } = require('../constants/profileOptions');
const {
  SWIPE_ACTIONS,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
} = require('../constants/discoveryOptions');

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
// caller: excludes self, users already liked/passed, and users already
// matched. Optional `datingIntention` / `city` filters.
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

    // Only show profiles complete enough to be worth showing (has the bare
    // minimum from profile creation: name, DOB, gender).
    const filter = {
      displayName: { $nin: [null, ''] },
      dateOfBirth: { $ne: null },
      gender: { $ne: null },
    };

    if (req.query.datingIntention !== undefined) {
      const intention = String(req.query.datingIntention).trim();
      if (!DATING_INTENTIONS.includes(intention)) {
        return res
          .status(400)
          .json({ message: `datingIntention must be one of: ${DATING_INTENTIONS.join(', ')}` });
      }
      filter.datingIntention = intention;
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
    const [alreadySwipedIds, myMatches, blockedIds, suspendedIds] = await Promise.all([
      Like.find({ fromUser: req.user.id }).distinct('toUser'),
      Match.find({ users: req.user.id, unmatched: false }).select('users'),
      getBlockedUserIds(req.user.id),
      User.find({ accountStatus: 'SUSPENDED' }).distinct('_id'),
    ]);
    const matchedIds = myMatches.map((m) =>
      m.users.find((u) => u.toString() !== req.user.id)
    );

    const excludedIds = new Set(
      [req.user.id, ...alreadySwipedIds, ...matchedIds, ...blockedIds, ...suspendedIds].map(String)
    );
    filter.user = { $nin: [...excludedIds] };

    // Fetch one extra row to know whether there's a next page without a
    // separate count query.
    const candidates = await Profile.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = candidates.length > limit;
    const pageCandidates = candidates.slice(0, limit);

    // Task #9 — Verification: bulk-fetch verification badges for this
    // page's candidates in one query rather than N+1, same batching pattern
    // as backend/routes/matches.js's otherUser profile lookup.
    const candidateUsers = await User.find({
      _id: { $in: pageCandidates.map((p) => p.user) },
    }).select('mobileVerification.status photoVerification.status');
    const userById = new Map(candidateUsers.map((u) => [String(u._id), u]));

    return res.json({
      profiles: pageCandidates.map((p) => toPublicProfileJSON(p, userById.get(String(p.user)))),
      page,
      hasMore,
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
    const { toUserId, action } = req.body || {};

    if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({ message: 'toUserId must be a valid user id' });
    }
    if (!SWIPE_ACTIONS.includes(action)) {
      return res.status(400).json({ message: `action must be one of: ${SWIPE_ACTIONS.join(', ')}` });
    }
    if (String(toUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot swipe on yourself' });
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

    let like;
    try {
      like = await Like.create({ fromUser: req.user.id, toUser: toUserId, action });
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
        await createNotification({
          recipientId: toUserId,
          type: 'like',
          payload: {},
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
