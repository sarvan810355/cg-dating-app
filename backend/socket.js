const { Server } = require('socket.io');
const mongoose = require('mongoose');

const { verifyToken } = require('./middleware/auth');
const Match = require('./models/Match');
const { isParticipant } = require('./utils/matchUtils');

// Room naming: one room per match, shared with backend/routes/matches.js
// (the message routes emit into this same room after a REST write) so the
// two files can never drift on the room-name convention.
function roomName(matchId) {
  return `match:${matchId}`;
}

// A second, per-user room every socket auto-joins on connect (see
// io.on('connection', ...) below) — this is the room
// backend/utils/notificationUtils.js emits `notification:new` into. Kept
// separate from the per-match room so a notification (which can happen
// while the recipient is anywhere in the app, not just inside a specific
// chat) always has somewhere to be delivered live, without every screen
// needing to individually join a match room first (Task #6).
function userRoomName(userId) {
  return `user:${userId}`;
}

// Whether any currently-connected socket for `userId` is joined to `room`
// (e.g. a match's room) — used by backend/routes/matches.js to decide
// whether to skip creating a redundant 'message' notification for a
// recipient who is actively viewing that chat right now (Task #6). Reuses
// the same io instance's room/socket bookkeeping Socket.IO already
// maintains; no separate presence tracking needed.
function isUserInRoom(io, room, userId) {
  const socketIds = io.sockets.adapter.rooms.get(room);
  if (!socketIds) return false;
  for (const socketId of socketIds) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.user && String(s.user.id) === String(userId)) return true;
  }
  return false;
}

// Wires Socket.IO onto the same HTTP server as Express (Task #5 — Chat).
//
// Design (documented here since it's the one non-obvious architectural
// choice in this file): REST stays the *single write path* for messages —
// `POST /api/matches/:matchId/messages` persists via Mongoose, then emits
// `message:new` to the match's room via `req.app.get('io')`. Sockets are
// used only for (a) authorizing + joining a per-match room, (b) receiving
// that broadcast, and (c) two truly ephemeral, non-persisted signals
// (typing indicators, and the room broadcast half of read receipts — the
// persistence itself still goes through the REST PATCH endpoint). This
// avoids having two divergent code paths that can both create a Message.
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  // Socket auth middleware — reuses the exact same verifyToken() the HTTP
  // requireAuth middleware uses (backend/middleware/auth.js), so JWT
  // secret-handling lives in exactly one place. Token is expected at
  // `socket.handshake.auth.token` (the socket.io-client convention), with a
  // fallback to a Bearer Authorization header for non-browser clients.
  io.use((socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const headerToken = (socket.handshake.headers?.authorization || '')
      .split(' ')
      .slice(1)
      .join(' ');
    const token = authToken || headerToken;

    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyToken(token);
      socket.user = { id: payload.id };
      return next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Every connected socket auto-joins its own per-user room (Task #6) so
    // notification delivery (backend/utils/notificationUtils.js) works from
    // any screen, not only while a specific match room is joined.
    socket.join(userRoomName(socket.user.id));

    // Client asks to join a match's room. Server authorizes: matchId must
    // be a real, active (not-unmatched) match the connected user is a
    // participant of — the same check the REST message routes perform, via
    // the same isParticipant() helper.
    socket.on('match:join', async (payload, ack) => {
      try {
        const matchId = payload?.matchId;
        if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
          if (typeof ack === 'function') ack({ ok: false, message: 'Invalid matchId' });
          return;
        }

        const match = await Match.findById(matchId);
        if (!match || match.unmatched || !isParticipant(match, socket.user.id)) {
          if (typeof ack === 'function') {
            ack({ ok: false, message: 'Not authorized for this match' });
          }
          return;
        }

        socket.join(roomName(matchId));
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('socket match:join error:', err);
        if (typeof ack === 'function') {
          ack({ ok: false, message: 'Something went wrong, please try again' });
        }
      }
    });

    socket.on('match:leave', (payload) => {
      const matchId = payload?.matchId;
      if (matchId) socket.leave(roomName(matchId));
    });

    // Typing indicator — ephemeral, never persisted. Re-broadcast to
    // everyone else in the room (not back to the sender).
    socket.on('typing:start', (payload) => {
      const matchId = payload?.matchId;
      if (!matchId) return;
      socket.to(roomName(matchId)).emit('typing', {
        matchId,
        userId: socket.user.id,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (payload) => {
      const matchId = payload?.matchId;
      if (!matchId) return;
      socket.to(roomName(matchId)).emit('typing', {
        matchId,
        userId: socket.user.id,
        isTyping: false,
      });
    });
  });

  return io;
}

module.exports = { initSocket, roomName, userRoomName, isUserInRoom };
