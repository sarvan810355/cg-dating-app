// Verification helpers (Task #9 in the internal TaskList; = docs/ROADMAP.md's
// Phase 7). Split into small, pure/DB-independent functions wherever
// possible so they're unit-testable via a standalone Node script without a
// live MongoDB connection — same pattern already used by
// backend/utils/notificationUtils.js#isNotificationTypeEnabled() and
// backend/utils/matchUtils.js.

const crypto = require('crypto');
const {
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_REQUESTS,
  OTP_RATE_LIMIT_WINDOW_MINUTES,
} = require('../constants/verificationOptions');

// Generates a random numeric OTP (default 6 digits) using crypto.randomInt
// (CSPRNG), not Math.random() — this is a real, unguessable code even though
// *delivery* of it is mocked (see backend/routes/verification.js's
// MOCK/DEV-ONLY note re: no SMS provider configured).
function generateOtp(length = OTP_LENGTH) {
  const min = 10 ** (length - 1);
  const max = 10 ** length; // exclusive upper bound for crypto.randomInt
  return String(crypto.randomInt(min, max));
}

// Masks a phone number for anything returned to the client or written to
// logs, e.g. "+919876543210" -> "*********3210". Keeps the last 4 digits so
// a user can recognize their own number without the full value being
// re-exposed on every status check.
function maskPhone(phone) {
  if (!phone) return null;
  const str = String(phone);
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

// Drops OTP-request timestamps older than the rate-limit window. Pure —
// takes "now" as a parameter so it's deterministic/testable.
function pruneOtpTimestamps(timestamps, now = new Date()) {
  const windowStart = now.getTime() - OTP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  return (timestamps || []).filter((t) => new Date(t).getTime() > windowStart);
}

// Given the user's stored otpRequestTimestamps (before this request is
// recorded) and "now", should a *new* OTP request be blocked? Sliding
// window: at most OTP_MAX_REQUESTS requests per OTP_RATE_LIMIT_WINDOW_MINUTES.
function isOtpRateLimited(timestamps, now = new Date()) {
  return pruneOtpTimestamps(timestamps, now).length >= OTP_MAX_REQUESTS;
}

function otpExpiryDate(now = new Date()) {
  return new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function isOtpExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now.getTime();
}

// Whitelisted, client-safe verification status shape for the CALLER'S OWN
// account (GET /api/verification/status and the mobile-verify success
// response) — deliberately never includes mobileVerification.otpHash/
// otpExpiresAt/otpRequestTimestamps or photoVerification.reviewNotes/
// reviewedBy/reviewedAt (internal moderation fields). See
// docs/DATABASE_SCHEMA.md's [NEVER EXPOSED] convention. Built as an explicit
// whitelist (never a raw toObject() dump of the sub-documents) so a future
// internal field added to either sub-document can't accidentally leak.
function toOwnVerificationStatusJSON(user) {
  const mv = user.mobileVerification || {};
  const pv = user.photoVerification || {};
  return {
    mobileVerification: {
      status: mv.status || 'NOT_VERIFIED',
      verifiedAt: mv.verifiedAt || null,
      phone: maskPhone(user.phone),
    },
    photoVerification: {
      status: pv.status || 'NOT_VERIFIED',
      verifiedAt: pv.verifiedAt || null,
      // Safe to return to the OWNER of the submission (they already have
      // this photo) — never returned in the PUBLIC profile view, see
      // toPublicVerificationBadges() below and
      // backend/utils/profileSerializers.js.
      submittedPhotoUrl: pv.submittedPhotoUrl || null,
      submittedAt: pv.submittedAt || null,
    },
  };
}

// Public-profile-safe badge booleans only — no raw photo, no phone, no
// timestamps, no moderation notes. Used by
// backend/utils/profileSerializers.js#toPublicProfileJSON() and anywhere
// else another user's profile is rendered (discovery feed cards, match list
// cards) so a viewer only ever learns "verified: true/false", never the
// underlying evidence.
function toPublicVerificationBadges(user) {
  return {
    mobileVerified: user?.mobileVerification?.status === 'VERIFIED',
    photoVerified: user?.photoVerification?.status === 'VERIFIED',
  };
}

module.exports = {
  generateOtp,
  maskPhone,
  pruneOtpTimestamps,
  isOtpRateLimited,
  otpExpiryDate,
  isOtpExpired,
  toOwnVerificationStatusJSON,
  toPublicVerificationBadges,
};
