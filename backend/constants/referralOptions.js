// Shared enums/config for the Referral program ("Invite & Earn", Task #17 —
// V2 scope, see docs/BUSINESS_PLAN.md's Growth Strategy and TODO.md's V2
// section). Kept in one place so the User model, the signup route, the
// referral routes, and the reward-granting helper all agree on the same
// values — same convention as backend/constants/subscriptionOptions.js /
// verificationOptions.js.

// Referral code alphabet: uppercase alphanumeric, deliberately excluding
// visually-ambiguous characters (0/O, 1/I) so a code is easy to read aloud
// or retype from a screenshot without transcription errors — this is why
// codes are validated/looked-up case-insensitively-but-stored-uppercase
// (see backend/models/User.js's referralCode field) rather than mixed case.
const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const REFERRAL_CODE_LENGTH = 7;
// Format validator applied to a caller-submitted `referralCode` at signup —
// intentionally permissive on case/whitespace (the signup route
// trims+uppercases before checking), strict on charset/length. Doesn't
// re-derive the alphabet as a regex class to avoid the two ever drifting —
// this is checked against REFERRAL_CODE_ALPHABET's actual characters below.
const REFERRAL_CODE_RE = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

// Retry budget for generating a unique referral code at signup (collision
// probability is astronomically low — 32^7 ≈ 34 billion possible codes —
// so this is defense-in-depth against a genuine race, not an expected hot
// path). See backend/utils/referralUtils.js#generateUniqueReferralCode().
const REFERRAL_CODE_GENERATION_MAX_ATTEMPTS = 8;

// --- Reward mechanism ------------------------------------------------------
// Chosen per the task spec: reuse the existing Subscription/Plan/entitlement
// system (Task #12) rather than inventing a new currency. As of this task,
// neither a "boost credits" nor a "priority likes" currency exists anywhere
// in the codebase yet (Task #16 — Boost/Priority Like — had not landed at
// implementation time; grepped the full backend/ tree to confirm), so the
// safe default from the task spec applies: grant both the referrer and the
// referee a short, time-limited CG_PLUS subscription via a new Subscription
// document, using the same `paymentProvider`-style traceability pattern
// already established for the mock Razorpay checkout
// (backend/models/Subscription.js) — `paymentProvider: 'referral_reward'`
// instead of `'mock_razorpay'`, so reward-granted rows stay distinguishable
// from a (mock) real checkout in the database. See
// backend/utils/referralUtils.js#grantReferralReward() and
// docs/BUSINESS_PLAN.md's Referral program entry for the full writeup.
const REFERRAL_REWARD_PLAN_CODE = 'CG_PLUS';
const REFERRAL_REWARD_DAYS = 7;
const REFERRAL_REWARD_PAYMENT_PROVIDER = 'referral_reward';

module.exports = {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_RE,
  REFERRAL_CODE_GENERATION_MAX_ATTEMPTS,
  REFERRAL_REWARD_PLAN_CODE,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_PAYMENT_PROVIDER,
};
