const mongoose = require('mongoose');
const { VERIFICATION_STATUSES } = require('../constants/verificationOptions');
const { USER_ROLES, ACCOUNT_STATUSES } = require('../constants/adminOptions');

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
      // Security audit (Task #6, final polish pass): never returned by a bare
      // `find`/`findOne` — the one route that needs the hash (login, to run
      // bcrypt.compare) explicitly opts back in via `.select('+password')`.
      // Every route that returns a user already builds a hand-picked public
      // object (see routes/auth.js's toPublicUser()) rather than serializing
      // the raw document, so this is defense-in-depth, not a fix for an
      // active leak.
      select: false,
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

    // --- Admin / Roles (Task #11 in the internal TaskList; = docs/
    // ROADMAP.md's Phase 9). Kept directly on User rather than a separate
    // `admin_users` collection (despite docs/DATABASE_SCHEMA.md's
    // `admin_users` section originally describing one as a possibility) —
    // same "1:1-with-user, always-fetched-together account state" reasoning
    // already used for notificationPreferences/mobileVerification/
    // photoVerification above; a role check needs to be a single lookup on
    // the already-loaded User document, not a join or a second collection
    // query on every admin request. See backend/constants/adminOptions.js
    // for the (deliberately smaller-than-originally-drafted) role enum. ---
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'USER',
    },
    // A suspended account is blocked at login (backend/routes/auth.js) and
    // excluded from discovery (backend/routes/discovery.js) — see
    // backend/constants/adminOptions.js for the enum. Reversible via
    // `PATCH /api/admin/users/:userId/reinstate`; there is no permanent
    // ban/delete flow in this pass (unrelated to the pre-existing, still-
    // unused `isActive` boolean above, which predates this task and has no
    // code path reading/writing it).
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: 'ACTIVE',
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

// Supports the admin panel's "search/list users" query pattern (docs/
// DATABASE_SCHEMA.md's `users` section already called this out as a planned
// index, ahead of the role field itself existing).
UserSchema.index({ role: 1 });

module.exports = mongoose.model('User', UserSchema);
