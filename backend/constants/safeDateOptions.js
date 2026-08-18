// Shared enums / config for Safe Date mode (Task #18 — V2, see docs/ROADMAP.md's
// Phase 12 "Growth & Engagement Features"). Kept in one place so the SafeDate model,
// safe-dates routes, and (indirectly, via the API) the frontend all agree on the same
// values — same convention as backend/constants/discoveryOptions.js /
// backend/constants/chatOptions.js.

// A Safe Date plan's lifecycle. PLANNED is the only creation state; every other
// value is a terminal-ish transition a caller (or, for MISSED_CHECKIN only, the
// read-time status computation — see backend/utils/safeDateUtils.js) moves it to.
const SAFE_DATE_STATUSES = ['PLANNED', 'CHECKED_IN', 'COMPLETED', 'MISSED_CHECKIN', 'CANCELLED'];

// Field length caps, enforced at the route layer (same "hand-picked validation per
// route" convention already used across this codebase — see docs/DATABASE_SCHEMA.md's
// note that a shared schema-validation library was never adopted for the MVP).
const LOCATION_MAX_LENGTH = 200; // free-text "approximate public location" — never GPS coords
const TRUSTED_CONTACT_NAME_MAX_LENGTH = 100;
const TRUSTED_CONTACT_PHONE_MAX_LENGTH = 20;

// --- Read-time status computation windows (backend/utils/safeDateUtils.js) --------
// There is no background job scheduler anywhere in this codebase (no node-cron, no
// task queue) and no real SMS/push provider to alert a trusted contact — see
// MOCK_FEATURES.md's Safe Date entry. All "is this date overdue / did they miss their
// check-in" logic below is therefore computed fresh every time a SafeDate is read
// (GET /api/safe-dates, GET /api/safe-dates/:id), never by a proactive timer.

// A PLANNED date becomes `isOverdue: true` once this many minutes have passed since
// `plannedStartAt` with no check-in yet — enough slack for someone running a little
// late without immediately flagging a normal delay as a safety concern.
const CHECKIN_GRACE_MINUTES = 30;

// A still-not-checked-in PLANNED (now overdue) date is only reclassified to the
// terminal `MISSED_CHECKIN` status once this many minutes have passed since
// `plannedEndAt` — i.e. well past when the date was supposed to be over, not just
// "running late to start it".
const MISSED_CHECKIN_GRACE_MINUTES = 120;

// How far ahead of `plannedStartAt` the read-time reminder window opens — see
// GET /api/safe-dates's reminder-notification note (backend/routes/safeDates.js) and
// MOCK_FEATURES.md for why this is read-time-computed, not a scheduled push.
const REMINDER_WINDOW_MINUTES = 60;

const DEFAULT_SAFE_DATES_LIMIT = 20;
const MAX_SAFE_DATES_LIMIT = 50;

module.exports = {
  SAFE_DATE_STATUSES,
  LOCATION_MAX_LENGTH,
  TRUSTED_CONTACT_NAME_MAX_LENGTH,
  TRUSTED_CONTACT_PHONE_MAX_LENGTH,
  CHECKIN_GRACE_MINUTES,
  MISSED_CHECKIN_GRACE_MINUTES,
  REMINDER_WINDOW_MINUTES,
  DEFAULT_SAFE_DATES_LIMIT,
  MAX_SAFE_DATES_LIMIT,
};
