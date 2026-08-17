const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../constants/notificationOptions');

// In-app notification for match/like/message events (Task #6, see
// docs/ROADMAP.md Phase 6). Real push delivery (Firebase Cloud Messaging) is
// MOCK/TEMPORARY-deferred — no FCM credentials configured yet, see
// MOCK_FEATURES.md; this model + its API only ever power the in-app
// notification center and the live `notification:new` Socket.IO event
// (backend/socket.js, backend/utils/notificationUtils.js).
const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    // Small object with whatever's needed to render this notification
    // client-side — shape varies by `type`, e.g. { matchId, fromUserId,
    // fromUserName } for 'match'/'message', but deliberately `{}` (no
    // identifying fields) for 'like' — "see who liked you" is a
    // premium-gated reveal per docs/BUSINESS_PLAN.md, so a plain like
    // notification never carries the liker's identity; see the
    // notification-creation comment in backend/routes/discovery.js.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  // Only createdAt is meaningful here — a notification is never edited in
  // place except the targeted `read` flip (PATCH .../read, .../read-all),
  // not a general update path, so no `updatedAt` is tracked (same pattern
  // already used by backend/models/Like.js).
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The actual "my notifications, newest first" access pattern
// (GET /api/notifications).
NotificationSchema.index({ recipient: 1, createdAt: -1 });
// "My unread notifications" / unread-count lookups without a collection scan
// (GET /api/notifications/unread-count, PATCH .../read-all).
NotificationSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
