const express = require('express');
const mongoose = require('mongoose');

const Match = require('../models/Match');
const Profile = require('../models/Profile');
const Message = require('../models/Message');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { isParticipant, otherParticipant } = require('../utils/matchUtils');
const { createNotification } = require('../utils/notificationUtils');
const { toPublicVerificationBadges } = require('../utils/verificationUtils');
const { getBlockedUserIds, isBlockedEitherWay } = require('../utils/blockUtils');
const { computeCompatibility } = require('../utils/compatibilityUtils');
const { generateIcebreakers } = require('../utils/icebreakerUtils');
const { roomName, isUserInRoom } = require('../socket');
const { DEFAULT_MATCHES_LIMIT, MAX_MATCHES_LIMIT } = require('../constants/discoveryOptions');
const {
  MAX_MESSAGE_LENGTH,
  DEFAULT_MESSAGES_LIMIT,
  MAX_MESSAGES_LIMIT,
} = require('../constants/chatOptions');

const router = express.Router();

// Shared by all three message routes below: loads the match and checks
// (a) it's a valid id, (b) it exists, (c) the caller is one of its two
// participants, (d) it hasn't been unmatched, (e) — Task #10 (Safety —
// Report/Block, see docs/ROADMAP.md's Phase 8) — neither participant has
// blocked the other. Returns either `{ match }` or `{ status, message }` for
// the route to short-circuit on.
//
// Design decision (documented per the Task #10 spec's request): blocking
// does NOT delete or mutate the underlying Match document (unlike unmatch,
// which sets `unmatched`/`unmatchedAt`/`unmatchedBy`) — a block is a
// separate, one-directional relationship that can be undone independently
// of the match itself (see backend/models/Block.js). Its effect on this
// match is therefore enforced here, at read/write time, returning `403`
// (same status/shape as the existing "not a participant" and "unmatched"
// checks above) rather than a distinct error — from the caller's
// perspective this conversation simply isn't accessible, whether that's
// because they were never a participant, they unmatched, or a block is now
// in effect. `GET /api/matches` additionally hides such matches from the
// list entirely (see the route below) rather than showing a match card that
// 403s when opened — the 403 here remains as defense-in-depth for anyone
// who already has the matchId (e.g. a still-open chat tab, a socket
// already joined to the room) at the moment a block takes effect.
async function loadAuthorizedMatch(matchId, userId) {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return { status: 400, message: 'matchId must be a valid id' };
  }
  const match = await Match.findById(matchId);
  if (!match) {
    return { status: 404, message: 'Match not found' };
  }
  if (!isParticipant(match, userId)) {
    return { status: 403, message: 'You are not a participant in this match' };
  }
  if (match.unmatched) {
    return {
      status: 403,
      message: 'This match has ended — you can no longer send messages here',
    };
  }
  const other = otherParticipant(match, userId);
  if (await isBlockedEitherWay(userId, other)) {
    return {
      status: 403,
      message: 'This conversation is not available',
    };
  }
  return { match };
}

function toMessageJSON(msg) {
  return {
    id: msg._id,
    matchId: msg.match,
    senderId: msg.sender,
    recipientId: msg.recipient,
    text: msg.text,
    createdAt: msg.createdAt,
    readAt: msg.readAt,
  };
}

// GET /api/matches (protected) — the caller's active (not-unmatched)
// matches, newest first, with the other participant's basic profile info
// (for a match list card) attached.
router.get('/', requireAuth, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_MATCHES_LIMIT;
    limit = Math.min(limit, MAX_MATCHES_LIMIT);

    // Task #10 (Safety — Report/Block, see docs/ROADMAP.md's Phase 8):
    // hide any match where the caller and the other participant have
    // blocked each other, in EITHER direction, from this list entirely —
    // the design decision documented on loadAuthorizedMatch() above. The
    // underlying Match document is untouched (blocking is independent of
    // unmatch); this is a query-time filter only, using the same
    // getBlockedUserIds() set the discovery feed uses so both surfaces stay
    // consistent with a single source of truth for "who is blocked".
    const blockedIds = await getBlockedUserIds(req.user.id);
    const matchFilter = { users: req.user.id, unmatched: false };
    if (blockedIds.size > 0) {
      // `$all` keeps the "caller is a participant" condition; `$nin`
      // excludes any match whose participant array contains a blocked id
      // (i.e. the *other* participant — the caller's own id can never be in
      // `blockedIds`, since blocking yourself is rejected at creation time).
      matchFilter.users = { $all: [req.user.id], $nin: [...blockedIds] };
    }

    const matches = await Match.find(matchFilter)
      .sort({ matchedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = matches.length > limit;
    const pageMatches = matches.slice(0, limit);

    const otherUserIds = pageMatches.map((m) =>
      m.users.find((u) => u.toString() !== req.user.id).toString()
    );
    // Task #9 — Verification: bulk-fetch verification badges alongside
    // profiles, same batching approach used for the profiles lookup itself.
    // Task #15 — Smart Icebreakers + Why-You-Match: also fetch the caller's
    // own profile once (not per-match) so each match's `compatibility` can
    // be computed against it without an extra query per row.
    const [profiles, verificationUsers, myProfile] = await Promise.all([
      Profile.find({ user: { $in: otherUserIds } }),
      User.find({ _id: { $in: otherUserIds } }).select(
        'mobileVerification.status photoVerification.status'
      ),
      Profile.findOne({ user: req.user.id }),
    ]);
    const profileByUser = new Map(profiles.map((p) => [p.user.toString(), p]));
    const verificationByUser = new Map(verificationUsers.map((u) => [String(u._id), u]));

    const result = pageMatches.map((m) => {
      const otherUserId = m.users.find((u) => u.toString() !== req.user.id).toString();
      const p = profileByUser.get(otherUserId);
      const primaryPhoto = p?.photos?.find((ph) => ph.isPrimary)?.url || p?.photos?.[0]?.url || null;
      return {
        id: m._id,
        matchedAt: m.matchedAt,
        otherUser: {
          userId: otherUserId,
          displayName: p?.displayName || null,
          age: p ? p.age : null,
          city: p?.city || null,
          district: p?.district || null,
          datingIntention: p?.datingIntention || null,
          photo: primaryPhoto,
          ...toPublicVerificationBadges(verificationByUser.get(otherUserId)),
        },
        // Task #15 — Smart Icebreakers + Why-You-Match (V2, user-requested).
        // Deterministic profile-comparison heuristic, NOT a real AI/LLM call
        // — see backend/utils/compatibilityUtils.js's top comment and
        // MOCK_FEATURES.md. `{ score: 0, reasons: [] }` if either side has no
        // profile (shouldn't normally happen for an existing match, but this
        // is always an enrichment on top of an already-real match, never a
        // hard requirement to view one).
        compatibility: computeCompatibility(myProfile, p),
      };
    });

    return res.json({ matches: result, page, hasMore });
  } catch (err) {
    console.error('List matches error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/matches/:matchId/compatibility (protected, participant-only) —
// Task #15 (Smart Icebreakers + Why-You-Match, V2, user-requested). "Why You
// Match": the same deterministic compatibility heuristic already embedded
// in each row of GET /api/matches above, exposed as its own endpoint too so
// a screen that only has a matchId (e.g. Chat.jsx, or MatchModal right after
// a swipe) can fetch it without re-paging through the matches list. NOT a
// real AI/LLM call — see backend/utils/compatibilityUtils.js's top comment
// and MOCK_FEATURES.md. Reuses the exact same loadAuthorizedMatch()
// participant/unmatch/block gate as the message routes above.
router.get('/:matchId/compatibility', requireAuth, async (req, res) => {
  try {
    const auth = await loadAuthorizedMatch(req.params.matchId, req.user.id);
    if (auth.status) return res.status(auth.status).json({ message: auth.message });
    const { match } = auth;
    const otherId = otherParticipant(match, req.user.id);

    const [myProfile, otherProfile] = await Promise.all([
      Profile.findOne({ user: req.user.id }),
      Profile.findOne({ user: otherId }),
    ]);

    return res.json({
      matchId: match._id,
      compatibility: computeCompatibility(myProfile, otherProfile),
    });
  } catch (err) {
    console.error('Match compatibility error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/matches/:matchId/icebreakers (protected, participant-only) —
// Task #15 (Smart Icebreakers + Why-You-Match, V2, user-requested). Returns
// a pool of 3-6 deterministic, template-based conversation starters built
// from real overlaps between the two participants' profiles (falling back
// to a small set of generic-but-decent starters when there isn't enough
// overlap to personalize from — never "Hi"/"Hello"). NOT a real AI/LLM call
// — see backend/utils/icebreakerUtils.js's top comment and
// MOCK_FEATURES.md. "Generate another" (frontend/src/pages/Chat.jsx) cycles
// through the returned pool locally rather than re-calling this endpoint —
// the pool is already fully deterministic for a given pair, so a re-call
// would only ever return the same list.
router.get('/:matchId/icebreakers', requireAuth, async (req, res) => {
  try {
    const auth = await loadAuthorizedMatch(req.params.matchId, req.user.id);
    if (auth.status) return res.status(auth.status).json({ message: auth.message });
    const { match } = auth;
    const otherId = otherParticipant(match, req.user.id);

    const [myProfile, otherProfile] = await Promise.all([
      Profile.findOne({ user: req.user.id }),
      Profile.findOne({ user: otherId }),
    ]);

    return res.json({
      matchId: match._id,
      icebreakers: generateIcebreakers(myProfile, otherProfile),
    });
  } catch (err) {
    console.error('Match icebreakers error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/matches/:matchId/messages (protected) — paginated chat history
// for a match, **newest-first**, cursor-paginated via `before` (a message
// id — fetch the page immediately older than that message). Newest-first +
// cursor was chosen over offset pagination because it's the natural fit for
// "load the latest messages, then load-older-on-scroll-up" (infinite
// scroll), and — unlike offset pagination — stays correct even as new
// messages keep arriving while the user scrolls back through history.
router.get('/:matchId/messages', requireAuth, async (req, res) => {
  try {
    const auth = await loadAuthorizedMatch(req.params.matchId, req.user.id);
    if (auth.status) return res.status(auth.status).json({ message: auth.message });
    const { match } = auth;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_MESSAGES_LIMIT;
    limit = Math.min(limit, MAX_MESSAGES_LIMIT);

    const filter = { match: match._id };
    if (req.query.before !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(req.query.before)) {
        return res.status(400).json({ message: 'before must be a valid message id' });
      }
      const cursorMessage = await Message.findById(req.query.before);
      // An unknown/already-deleted cursor is treated as "no cursor" rather
      // than an error — same defensive spirit as discovery/matches pagination.
      if (cursorMessage) {
        filter.createdAt = { $lt: cursorMessage.createdAt };
      }
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const pageMessages = messages.slice(0, limit);

    return res.json({
      messages: pageMessages.map(toMessageJSON),
      hasMore,
    });
  } catch (err) {
    console.error('List messages error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/matches/:matchId/messages (protected) — body { text }. Sends a
// text message. REST is the single write path for messages (see
// backend/socket.js's design note); on success the message is broadcast in
// real time to the match's Socket.IO room as `message:new`.
router.post('/:matchId/messages', requireAuth, async (req, res) => {
  try {
    const auth = await loadAuthorizedMatch(req.params.matchId, req.user.id);
    if (auth.status) return res.status(auth.status).json({ message: auth.message });
    const { match } = auth;

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ message: 'Message text is required' });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res
        .status(400)
        .json({ message: `Message text cannot exceed ${MAX_MESSAGE_LENGTH} characters` });
    }

    // Always derived server-side from the match, never taken from the
    // client — you can only ever message the other participant of a match
    // you're authorized in (which also means you can never message
    // yourself: a Match's two users are, by construction, distinct).
    const recipientId = otherParticipant(match, req.user.id);

    const [saved, senderProfile] = await Promise.all([
      Message.create({
        match: match._id,
        sender: req.user.id,
        recipient: recipientId,
        text,
      }),
      Profile.findOne({ user: req.user.id }).select('displayName'),
    ]);

    const json = toMessageJSON(saved);

    const io = req.app.get('io');
    if (io) {
      io.to(roomName(match._id)).emit('message:new', json);
    }

    // Notification creation (Task #6, see docs/ROADMAP.md Phase 6).
    // Isolated in its own try/catch so a notification hiccup can never turn
    // a successful, already-persisted-and-broadcast message send into a
    // 500. Skipped entirely when the recipient is actively connected to
    // this match's Socket.IO room (i.e. has this chat open right now) — per
    // the Task #6 spec, that avoids redundant noise on top of the
    // `message:new` live delivery they're already seeing.
    try {
      const recipientInRoom = io ? isUserInRoom(io, roomName(match._id), recipientId) : false;
      if (!recipientInRoom) {
        await createNotification({
          recipientId,
          type: 'message',
          payload: {
            matchId: String(match._id),
            fromUserId: String(req.user.id),
            fromUserName: senderProfile?.displayName || null,
            messageId: String(saved._id),
            preview: text.length > 140 ? `${text.slice(0, 140)}…` : text,
          },
          io,
        });
      }
    } catch (notifyErr) {
      console.error('Notification creation error (message):', notifyErr);
    }

    return res.status(201).json({ message: json });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/matches/:matchId/messages/read (protected) — marks every
// message addressed *to* the caller in this match as read (readAt = now).
// Broadcasts `message:read` to the room so the sender's UI can flip its
// checkmarks live; the write itself still only ever happens here (REST),
// not from a socket event, for the same single-write-path reason as sending.
router.patch('/:matchId/messages/read', requireAuth, async (req, res) => {
  try {
    const auth = await loadAuthorizedMatch(req.params.matchId, req.user.id);
    if (auth.status) return res.status(auth.status).json({ message: auth.message });
    const { match } = auth;

    const readAt = new Date();
    const result = await Message.updateMany(
      { match: match._id, recipient: req.user.id, readAt: null },
      { $set: { readAt } }
    );

    if (result.modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to(roomName(match._id)).emit('message:read', {
          matchId: String(match._id),
          readBy: req.user.id,
          readAt,
        });
      }
    }

    return res.json({ matchId: match._id, readCount: result.modifiedCount, readAt });
  } catch (err) {
    console.error('Mark messages read error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
