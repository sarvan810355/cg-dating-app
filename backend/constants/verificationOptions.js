// Shared enums / config for Verification (Task #9 in the internal TaskList;
// = docs/ROADMAP.md's Phase 7). Kept in one place so the User schema, the
// verification routes, and (indirectly, via the API) the frontend all agree
// on the same values — same convention as backend/constants/
// notificationOptions.js / backend/constants/profileOptions.js.

// Shared status enum for BOTH verification levels (mobile OTP and
// photo/selfie). Not every status is reachable by every level in this MVP
// pass (e.g. nothing currently transitions photoVerification to EXPIRED —
// there's no expiry timer on a pending photo review), but a single shared
// enum keeps the two levels' state machines visibly parallel and means the
// schema never needs to change if that changes later (e.g. an admin
// auto-expiring stale pending reviews).
const VERIFICATION_STATUSES = ['NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'];

// --- Mobile OTP ------------------------------------------------------------
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
// Simple abuse guard: at most this many OTP *requests* (not verify attempts)
// per rolling window, per user. MVP-simple sliding window kept on the user
// document itself (see backend/models/User.js's
// mobileVerification.otpRequestTimestamps) rather than a separate
// rate-limiting store — good enough for MVP per the task spec.
const OTP_MAX_REQUESTS = 3;
const OTP_RATE_LIMIT_WINDOW_MINUTES = 10;

// Loose but real phone validation — optional leading '+', 10-15 digits after
// stripping spaces/hyphens/parens. Deliberately not India-specific (same
// "don't hardcode to one region" spirit as profileOptions.js's CG_DISTRICTS
// note) since `users.phone` itself has no country restriction elsewhere in
// this codebase.
const PHONE_RE = /^\+?[0-9]{10,15}$/;

module.exports = {
  VERIFICATION_STATUSES,
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_REQUESTS,
  OTP_RATE_LIMIT_WINDOW_MINUTES,
  PHONE_RE,
};
