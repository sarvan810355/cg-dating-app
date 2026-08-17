const mongoose = require('mongoose');
const { VERIFICATION_STATUSES } = require('../constants/verificationOptions');

// Core account/auth record. Profile details (bio, photos, preferences, etc.)
// live in the separate Profile model.
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },

    // --- Notification preferences (Task #6, see docs/ROADMAP.md Phase 6) ---
    // Basic per-type opt-out toggles, all default `true` (opt-out, not
    // opt-in). Deliberately no fields here for 'verification'/'safety'/
    // 'subscription' notifications — those aren't user-disable-able (see
    // backend/constants/notificationOptions.js's PREFERENCE_FIELD_BY_TYPE);
    // there are no code paths creating them yet, so this is future-proofing.
    notificationPreferences: {
      matchNotifications: { type: Boolean, default: true },
      likeNotifications: { type: Boolean, default: true },
      messageNotifications: { type: Boolean, default: true },
    },

    // --- Verification (Task #9 in the internal TaskList; = docs/ROADMAP.md's
    // Phase 7). Two independent verification levels, each with its own small
    // status state machine (NOT_VERIFIED -> PENDING -> VERIFIED/REJECTED/
    // EXPIRED — see backend/constants/verificationOptions.js). Kept directly
    // on User (not a separate `verifications` collection/model, despite
    // docs/DATABASE_SCHEMA.md's `verifications` section describing one) for
    // the same reason `notificationPreferences` lives here — a 1:1-with-user,
    // always-fetched-together piece of account trust state doesn't need its
    // own document; see docs/DATABASE_SCHEMA.md's divergence note. ---
    mobileVerification: {
      status: { type: String, enum: VERIFICATION_STATUSES, default: 'NOT_VERIFIED' },
      verifiedAt: { type: Date, default: null },
      // --- Internal fields below. [NEVER EXPOSED] to any API response —
      // see backend/utils/verificationUtils.js#toOwnVerificationStatusJSON(),
      // which is an explicit whitelist that omits all three of these. ---
      otpHash: { type: String, default: null, select: false },
      otpExpiresAt: { type: Date, default: null, select: false },
      // Sliding-window OTP-request rate limit (see
      // backend/constants/verificationOptions.js's OTP_MAX_REQUESTS /
      // OTP_RATE_LIMIT_WINDOW_MINUTES) — timestamps of recent
      // request-otp calls, pruned on each new request.
      otpRequestTimestamps: { type: [Date], default: [], select: false },
    },
    photoVerification: {
      status: { type: String, enum: VERIFICATION_STATUSES, default: 'NOT_VERIFIED' },
      verifiedAt: { type: Date, default: null },
      // The submitted selfie itself — same MOCK/TEMPORARY storage pattern as
      // profile photos (see backend/utils/mockImageUpload.js). Safe to
      // return to the OWNER of the submission, but [NEVER EXPOSED] in any
      // OTHER user's view of this profile — public profile responses only
      // ever surface the `photoVerified` boolean, never this URL. This is
      // the manual-review queue's evidence field; no automated face-match
      // happens in this MVP pass.
      submittedPhotoUrl: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      // --- Internal moderation fields. [NEVER EXPOSED] to any API response —
      // for the future Admin panel's review queue (Task #10-equivalent /
      // docs/ROADMAP.md Phase 9) to read/write once it exists; no code path
      // sets these yet in this pass. ---
      reviewNotes: { type: String, default: null, select: false },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
      reviewedAt: { type: Date, default: null, select: false },
    },

    // --- Subscription / entitlements (Task #12 — Subscription scaffolding).
    // Free-tier daily LIKE quota tracking only — the subscription itself
    // lives in the separate Subscription model (one user can have several
    // over time; see backend/models/Subscription.js), not here. See
    // backend/utils/entitlementUtils.js#tryConsumeDailyLike() for the
    // reset-on-new-UTC-day logic that reads/writes these two fields, and
    // backend/routes/discovery.js's POST /swipe for where they're enforced.
    // ---
    dailyLikeCount: { type: Number, default: 0 },
    lastLikeCountReset: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
