const mongoose = require('mongoose');
const {
  SUBSCRIPTION_STATUSES,
  PAYMENT_PROVIDERS,
} = require('../constants/subscriptionOptions');

// A user's subscription to a Plan (Task #12 — Subscription scaffolding).
// One document per checkout — POST /api/subscription/subscribe creates a
// new ACTIVE row rather than mutating a prior one, so history is preserved;
// "the caller's current subscription" (GET /api/subscription/me,
// backend/utils/entitlementUtils.js) is derived by querying for the
// latest non-expired row rather than assuming there's only ever one.
const SubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'ACTIVE',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // Set by POST /api/subscription/cancel. A cancelled subscription stays
    // usable until `expiresAt` (standard SaaS behavior — cancelling stops
    // renewal, it doesn't claw back time already paid for), so
    // backend/utils/entitlementUtils.js treats CANCELLED-but-not-yet-expired
    // the same as ACTIVE for entitlement purposes.
    cancelledAt: {
      type: Date,
      default: null,
    },
    // --- MOCK/TEMPORARY payment fields ---------------------------------
    // There is no real Razorpay integration in this pass (see
    // MOCK_FEATURES.md and backend/routes/subscription.js's route-level
    // comment): `paymentProvider` only ever holds 'mock_razorpay', and
    // `paymentReference` is a fake reference string generated at
    // subscribe-time, never a real gateway transaction id. A real
    // integration would additionally record a verified-webhook timestamp
    // before ever marking a subscription ACTIVE — see the `payments`
    // collection's `webhookVerifiedAt` field in docs/DATABASE_SCHEMA.md,
    // which this MVP pass does not implement.
    paymentProvider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      default: 'mock_razorpay',
    },
    paymentReference: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// "What's this user's current subscription" is always looked up by
// (user, status, expiresAt) — see
// backend/utils/entitlementUtils.js#getEffectiveSubscription().
SubscriptionSchema.index({ user: 1, status: 1, expiresAt: -1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
