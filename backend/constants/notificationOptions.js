// Shared enums / config for Notifications (Task #6 — see docs/ROADMAP.md,
// Phase 6). Kept in one place so the Notification model, notification
// routes, and (indirectly, via the API) the frontend all agree on the same
// values — same convention as backend/constants/discoveryOptions.js /
// backend/constants/chatOptions.js.

// Notification types this MVP pass actually creates: 'match' (mutual match
// created, see backend/routes/discovery.js), 'like' (someone liked you,
// before any mutual match — see the same file), 'message' (new chat
// message, see backend/routes/matches.js), 'badge' (Task #20 — Achievements/
// Badges, V2 scope: a new badge was just unlocked, see
// backend/utils/badgeUtils.js#awardBadge()). 'verification', 'safety', and
// 'subscription' are reserved enum values for later phases (Task #7+) — no
// code path creates them yet, but they're included now per
// docs/DATABASE_SCHEMA.md so the schema doesn't need to change when those
// phases land.
const NOTIFICATION_TYPES = [
  'match',
  'like',
  'message',
  'badge',
  'verification',
  'safety',
  'subscription',
];

// Which notification types are user-toggleable via GET/PUT
// /api/notifications/preferences, and which User.notificationPreferences
// field gates each one (see backend/models/User.js). Types NOT listed here
// ('verification', 'safety', 'subscription') are deliberately NOT
// disable-able — safety/account-critical notifications must always be
// delivered. There are no code paths creating those types yet, so this is
// future-proofing, not a currently-enforced gate (see the Task #6 spec).
const PREFERENCE_FIELD_BY_TYPE = {
  match: 'matchNotifications',
  like: 'likeNotifications',
  message: 'messageNotifications',
  // Task #20 — Achievements/Badges (V2 scope). Deliberately still
  // user-toggleable (not folded into the "always delivered" safety-critical
  // group below) — a badge unlock is a celebration, not a safety-critical
  // event, so a user who'd rather not see them can opt out exactly like any
  // other notification type. See backend/models/User.js's
  // notificationPreferences.achievementNotifications field.
  badge: 'achievementNotifications',
};

// GET /api/notifications pagination defaults — newest-first, same
// page-based pagination convention as GET /api/matches.
const DEFAULT_NOTIFICATIONS_LIMIT = 20;
const MAX_NOTIFICATIONS_LIMIT = 50;

module.exports = {
  NOTIFICATION_TYPES,
  PREFERENCE_FIELD_BY_TYPE,
  DEFAULT_NOTIFICATIONS_LIMIT,
  MAX_NOTIFICATIONS_LIMIT,
};
