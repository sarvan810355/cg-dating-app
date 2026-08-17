const express = require('express');
const mongoose = require('mongoose');

const Match = require('../models/Match');
const Profile = require('../models/Profile');
const Message = require('../models/Message');
const { requireAuth } = require('../middleware/auth');
const { isParticipant, otherParticipant } = require('../utils/matchUtils');
const { createNotification } = require('../utils/notificationUtils');
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
// participants, (d) it hasn't been unmatched. Returns either
// `{ match }` or `{ status, message }` for the route to short-circuit on.
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

    const matches = await Match.find({ users: req.user.id, unmatched: false })
      .sort({ matchedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = matches.length > limit;
    const pageMatches = matches.slice(0, limit);

    const otherUserIds = pageMatches.map((m) =>
      m.users.find((u) => u.toString() !== req.user.id).toString()
    );
    const profiles = await Profile.find({ user: { $in: otherUserIds } });
    const profileByUser = new Map(profiles.map((p) => [p.user.toString(), p]));

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
        },
      };
    });

    return res.json({ matches: result, page, hasMore });
  } catch (err) {
    console.error('List matches error:', err);
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
