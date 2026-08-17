// Shared notification-creation helper for Task #6 (see docs/ROADMAP.md
// Phase 6) — used by backend/routes/discovery.js (match/like events) and
// backend/routes/matches.js (message events) so both trigger points share
// one place that (a) checks the recipient's notification preferences,
// (b) persists the Notification, and (c) emits the live `notification:new`
// Socket.IO event.

const Notification = require('../models/Notification');
const User = require('../models/User');
const { PREFERENCE_FIELD_BY_TYPE } = require('../constants/notificationOptions');
const { userRoomName } = require('../socket');

// Pure: given a user's `notificationPreferences` sub-document (or
// undefined/null, meaning "use defaults") and a notification `type`, should
// a notification of this type be created? Safety-critical types (anything
// not in PREFERENCE_FIELD_BY_TYPE, e.g. 'verification'/'safety') can never
// be suppressed by preference. Kept pure / DB-independent on purpose so it's
// unit-testable via a standalone Node script without a live MongoDB
// connection (see IMPLEMENTATION_PROGRESS.md's sandbox note) — all the
// preference-gating logic lives here, not inline in the route handlers.
function isNotificationTypeEnabled(preferences, type) {
  const field = PREFERENCE_FIELD_BY_TYPE[type];
  if (!field) return true; // not a user-toggleable type — always enabled
  if (!preferences || preferences[field] === undefined) return true; // default true
  return preferences[field] !== false;
}

// Maps a Notification document to its API/socket JSON shape.
function toNotificationJSON(n) {
  return {
    id: n._id,
    type: n.type,
    payload: n.payload,
    read: n.read,
    createdAt: n.createdAt,
  };
}

// Creates a Notification for `recipientId` — but only if that recipient
// hasn't disabled this `type` via their notification preferences — then, if
// an `io` instance is passed, emits `notification:new` to that user's
// personal Socket.IO room (backend/socket.js's userRoomName(), auto-joined
// by every connected socket). Emitting to a room with no connected sockets
// is a safe no-op, so this naturally satisfies "emit only if the recipient
// has an active socket connection" from the Task #6 spec without a separate
// online/presence check.
//
// Returns the created Notification, or `null` if none was created
// (recipient not found, or this type is disabled for them) — callers treat
// both the same way: nothing further to do.
async function createNotification({ recipientId, type, payload = {}, io }) {
  const recipient = await User.findById(recipientId).select('notificationPreferences');
  if (!recipient) return null; // recipient no longer exists — nothing to notify

  if (!isNotificationTypeEnabled(recipient.notificationPreferences, type)) {
    return null;
  }

  const notification = await Notification.create({ recipient: recipientId, type, payload });

  if (io) {
    io.to(userRoomName(recipientId)).emit('notification:new', toNotificationJSON(notification));
  }

  return notification;
}

module.exports = { isNotificationTypeEnabled, createNotification, toNotificationJSON };
