// Shared enums / config for Subscription (Task #12 in the internal
// TaskList; = docs/ROADMAP.md's Phase 10-ish "Subscription (basic)" scope —
// see TODO.md's Subscription section). Kept in one place so the Plan/
// Subscription models, the subscription routes, the entitlement helper, and
// (indirectly, via the API) the frontend all agree on the same values —
// same convention as backend/constants/discoveryOptions.js /
// verificationOptions.js.

// Plan codes/naming per docs/BUSINESS_PLAN.md's Revenue Model — names and
// pricing are admin-editable (see the Plan model), but the *codes* are a
// fixed enum so the rest of the codebase (entitlement checks, the seed data
// below) has stable identifiers to refer to.
const PLAN_CODES = ['CG_PLUS', 'CG_PRO', 'CG_ELITE'];

const BILLING_PERIODS = ['monthly', 'yearly'];

// How many days a subscription lasts once activated, per billing period —
// used to compute Subscription.expiresAt on (mock) checkout. Deliberately
// simple (30/365) rather than real calendar-month arithmetic — good enough
// for MVP per the task spec, same "MVP-simple" spirit as
// verificationOptions.js's OTP rate-limit window.
const BILLING_PERIOD_DAYS = {
  monthly: 30,
  yearly: 365,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'];

// The only payment provider integration in this codebase, and it's a MOCK —
// see MOCK_FEATURES.md and backend/routes/subscription.js's route-level
// comment. Kept as a single-value enum (rather than a free string) so a
// real Razorpay integration later is a deliberate schema change, not a
// silent value drift.
const PAYMENT_PROVIDERS = ['mock_razorpay'];

// Feature flags a Plan can carry (Plan.features, array of these strings).
// Checked server-side only via backend/utils/entitlementUtils.js#hasFeature()
// — never trust a client-submitted "isPremium"/feature claim.
const PLAN_FEATURES = [
  'unlimited_likes',
  'advanced_filters',
  'see_who_liked_you',
  'boost',
  'incognito',
];

// The one feature actually enforced server-side in this pass (see
// backend/routes/discovery.js's POST /swipe) — demonstrates real
// entitlement gating since no other "premium feature" has a gated code path
// yet. The other PLAN_FEATURES values are stored/served but not yet
// enforced anywhere — same "documented scope boundary, not a bug" pattern
// as MOCK_FEATURES.md's other entries.
const UNLIMITED_LIKES_FEATURE = 'unlimited_likes';

// Free-tier daily LIKE limit (not passes — a "pass" costs nothing). Chosen
// per docs/BUSINESS_PLAN.md's "limited number of daily likes" freemium
// requirement; documented alongside the plans there too. Resets once per
// UTC calendar day (see backend/utils/entitlementUtils.js's isSameUtcDay) —
// deliberately not a rolling 24h window, to keep the reset predictable and
// simple to reason about (same "MVP-simple" bar as the OTP rate limiter).
const FREE_TIER_DAILY_LIKE_LIMIT = 20;

// Seed data for the three default plans (see
// backend/utils/entitlementUtils.js#seedDefaultPlans(), run once at server
// startup — idempotent: only inserts a plan if no document with that `code`
// already exists, so an admin's later price/feature edits are never
// clobbered by a restart). Pricing is in paise (India-first, avoids float
// rounding on currency — see docs/DATABASE_SCHEMA.md), arbitrary MVP
// placeholder numbers, admin-editable after seeding via direct DB edits
// until an Admin panel pricing screen exists (not built in this pass — see
// TODO.md's Admin section, which is a separate task from this one).
const DEFAULT_PLANS = [
  {
    code: 'CG_PLUS',
    name: 'CG Plus',
    priceInPaise: 29900, // ~ INR 299/month
    billingPeriod: 'monthly',
    features: ['unlimited_likes', 'advanced_filters'],
    isActive: true,
  },
  {
    code: 'CG_PRO',
    name: 'CG Pro',
    priceInPaise: 59900, // ~ INR 599/month
    billingPeriod: 'monthly',
    features: ['unlimited_likes', 'advanced_filters', 'see_who_liked_you', 'boost'],
    isActive: true,
  },
  {
    code: 'CG_ELITE',
    name: 'CG Elite',
    priceInPaise: 99900, // ~ INR 999/month
    billingPeriod: 'monthly',
    features: [
      'unlimited_likes',
      'advanced_filters',
      'see_who_liked_you',
      'boost',
      'incognito',
    ],
    isActive: true,
  },
];

module.exports = {
  PLAN_CODES,
  BILLING_PERIODS,
  BILLING_PERIOD_DAYS,
  MS_PER_DAY,
  SUBSCRIPTION_STATUSES,
  PAYMENT_PROVIDERS,
  PLAN_FEATURES,
  UNLIMITED_LIKES_FEATURE,
  FREE_TIER_DAILY_LIKE_LIMIT,
  DEFAULT_PLANS,
};
