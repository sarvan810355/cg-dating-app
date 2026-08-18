const mongoose = require('mongoose');
const {
  PLAN_CODES,
  BILLING_PERIODS,
  PLAN_FEATURES,
} = require('../constants/subscriptionOptions');

// Configurable subscription plan (Task #12 — Subscription scaffolding).
// DB-backed (not a hardcoded constant) because docs/BUSINESS_PLAN.md is
// explicit that plan naming/pricing must be "admin-editable, never
// hardcoded" — a plain JS constants object couldn't satisfy that without a
// deploy for every price change. The three default rows are seeded
// idempotently at server startup (see
// backend/utils/entitlementUtils.js#seedDefaultPlans()) but nothing here
// stops an admin from editing a Plan document directly (or, once the Admin
// panel grows a pricing screen — not built in this pass, see TODO.md's
// Admin section — through that UI) without a code change.
const PlanSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      enum: PLAN_CODES,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // India-first, priced in paise (not rupees) to avoid floating-point
    // rounding on currency — same reasoning docs/DATABASE_SCHEMA.md already
    // uses for `payments.amount`. The frontend formats paise -> rupees for
    // display only (see frontend/src/pages/Subscription.jsx).
    priceInPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    billingPeriod: {
      type: String,
      enum: BILLING_PERIODS,
      required: true,
    },
    // Feature flags this plan grants — see
    // backend/constants/subscriptionOptions.js's PLAN_FEATURES and
    // backend/utils/entitlementUtils.js#hasFeature(), which is the ONLY
    // code path allowed to read this for entitlement decisions (never a
    // client-submitted claim).
    features: {
      type: [String],
      enum: PLAN_FEATURES,
      default: [],
    },
    // Inactive plans are kept (not deleted) so existing Subscriptions that
    // reference them stay resolvable, but GET /api/plans (the public
    // paywall listing) never surfaces them, and POST /api/subscription/
    // subscribe refuses to create a new subscription against one.
    isActive: {
      type: Boolean,
      default: true,
    },
    // --- Task #16 — Profile Boost + Priority Like (V2 scope). How many
    // boost/priority-like credits a subscriber is granted, ONE TIME, the
    // moment they subscribe to this plan (backend/routes/subscription.js's
    // POST /subscribe — see backend/utils/entitlementUtils.js#grantPlanCredits()).
    // Additive to `users.boostCreditsRemaining`/`priorityLikesRemaining`,
    // never a replacement — resubscribing/upgrading never claws back an
    // unused balance. **Honestly scoped:** this is a ONE-TIME grant on
    // subscribe, not a recurring monthly top-up — there is no job
    // scheduler anywhere in this codebase (no node-cron, no task queue,
    // same gap already documented for Safe Date's read-time-only reminder
    // computation) to grant a fresh batch on each renewal; see
    // MOCK_FEATURES.md's Task #16 entry for the full "why not recurring
    // yet" writeup. Defaults to 0 (a free/legacy plan grants nothing) so
    // this never silently applies to a plan an admin didn't explicitly
    // configure. ---
    boostCreditsGranted: {
      type: Number,
      default: 0,
      min: 0,
    },
    priorityLikesGranted: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', PlanSchema);
