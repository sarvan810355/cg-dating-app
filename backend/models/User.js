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

    // --- Referral program (Task #17 — Invite & Earn, V2 scope; see
    // docs/BUSINESS_PLAN.md's Growth Strategy and TODO.md's V2 section). ---
    // Every user gets a short, human-shareable, unique referral code
    // generated at signup time (backend/routes/auth.js — see
    // backend/utils/referralUtils.js#generateUniqueReferralCode() for the
    // retry-on-collision generation strategy). `unique: true` here is the
    // schema-level guarantee, not just the generator's own pre-check.
    referralCode: {
      type: String,
      unique: true,
      // sparse: lets pre-existing documents (from before this field
      // existed, if any) coexist without all colliding on `null` under the
      // unique index — every user created via the signup route after this
      // change always has one, so this only matters for old/seed data.
      sparse: true,
      uppercase: true,
      trim: true,
    },
    // Who referred this user in, set at most once — at signup, if a valid
    // referral code was provided (backend/routes/auth.js). `immutable: true`
    // is the actual anti-abuse enforcement the task requires ("enforced by
    // the schema, not just app logic"): Mongoose ignores any attempt to
    // change this path on an existing (non-new) document, so there is no
    // way to retroactively link/relink a referral after account creation
    // even if some future route accidentally tried to `.save()` a change to
    // it — not just that no such route exists today (it doesn't; referral
    // linking only ever happens inline in the signup handler, on the
    // brand-new document, where `immutable` does not block the initial
    // set).
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },

    // --- Profile Boost + Priority Like (Task #16 — V2 scope, see
    // docs/DATABASE_SCHEMA.md's `boosts` section and
    // backend/constants/boostOptions.js). Both are simple, fungible
    // consumable-credit counters — the same "1:1-with-user, always-fetched-
    // together account state" reasoning already used for
    // `dailyLikeCount`/`referralCode` above — NOT source-tracked per credit
    // (see boostOptions.js#BOOST_SOURCES's comment on that trade-off).
    // `default: 1` on both: every new signup gets one free taster of each
    // premium mechanic (see boostOptions.js#FREE_BOOST_CREDITS/
    // FREE_PRIORITY_LIKES for the documented reasoning) — a deliberate
    // product choice, not an oversight; a plan subscription tops these up
    // further (see backend/routes/subscription.js's POST /subscribe). `min:
    // 0` is defense-in-depth against ever persisting a negative balance —
    // the actual "can't go negative" guarantee is enforced by
    // backend/utils/entitlementUtils.js's tryActivateBoost()/
    // tryConsumePriorityLike() only ever decrementing after confirming a
    // remaining balance > 0, this is a second, schema-level backstop. ---
    boostCreditsRemaining: { type: Number, default: 1, min: 0 },
    priorityLikesRemaining: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

// Supports the admin panel's "search/list users" query pattern (docs/
// DATABASE_SCHEMA.md's `users` section already called this out as a planned
// index, ahead of the role field itself existing).
UserSchema.index({ role: 1 });
// Task #17 — Referral program: "how many people has this user referred" is
// computed on demand via User.countDocuments({ referredBy: userId })
// (GET /api/referrals/me, backend/routes/referrals.js) rather than a
// denormalized counter — simpler for MVP and avoids counter-drift bugs
// (same "computed, not denormalized" choice already documented for
// profiles.profileCompletionPercentage). This index makes that count query
// (and "who did this user refer" lookups generally) an index scan, not a
// collection scan.
UserSchema.index({ referredBy: 1 });

module.exports = mongoose.model('User', UserSchema);
