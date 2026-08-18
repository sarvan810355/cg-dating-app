// Shared enums / config for Profile Boost + Priority Like (Task #16, V2 —
// the last currently-queued item from the user's post-MVP feature-addition
// batch; see PROJECT_STATE.md/docs/ROADMAP.md's V2 section). Kept in one
// place so the Boost/Like/User/Plan models, the boosts/discovery routes, the
// ranking utility, and (indirectly, via the API) the frontend all agree on
// the same values — same convention as backend/constants/discoveryOptions.js/
// subscriptionOptions.js.

// A Boost is TIME-LIMITED — 30 minutes is the real-world norm this feature
// is modeled on (this is the one duration real dating apps converge on for a
// "temporary visibility spike" boost, not an arbitrary MVP placeholder).
// `Boost.expiresAt` is always `startedAt + BOOST_DURATION_MINUTES`, computed
// once at activation time (backend/utils/entitlementUtils.js#tryActivateBoost()) —
// never re-extended by a later activation attempt (see the "can't
// double-activate" rule on POST /api/boosts/activate).
const BOOST_DURATION_MINUTES = 30;

// How a given Boost document was granted — see backend/models/Boost.js.
// **Honestly scoped:** boost credits are a single fungible counter
// (`users.boostCreditsRemaining`), not tracked with per-credit provenance —
// once a credit lands in that counter (a plan grant, a referral reward, or a
// future purchase path), activating a boost draws from the same pool
// regardless of which source originally topped it up. `source` therefore
// records how *this activation* was initiated, not necessarily how the
// specific credit it consumed was originally granted. The only activation
// path built in this pass (`POST /api/boosts/activate`) always records
// `'purchased'` (a user spending from their own credit balance, whatever its
// origin) — `'subscription_perk'`/`'referral_reward'` remain valid enum
// values reserved for a future *automatic* activation path (e.g. a plan that
// auto-activates a weekly boost for its holder without an explicit user
// action), not built in this pass; see docs/API_DOCUMENTATION.md's Boost
// section and MOCK_FEATURES.md.
const BOOST_SOURCES = ['subscription_perk', 'purchased', 'referral_reward'];

// One-time free credits granted to every new signup (schema defaults on
// `users.boostCreditsRemaining`/`users.priorityLikesRemaining`, see
// backend/models/User.js) — a small taster of both premium mechanics, the
// same "let a free user feel the premium feature once" growth pattern real
// dating apps use, and documented explicitly per this task's "your call,
// document it" instruction (docs/BUSINESS_PLAN.md). Referenced here for a
// single source of truth even though the actual default lives on the schema
// (Mongoose schema defaults can't import a JS constant across files as
// cleanly as a plain number literal, so this constant exists primarily for
// documentation / the seed-consistency check in the verification script).
const FREE_BOOST_CREDITS = 1;
const FREE_PRIORITY_LIKES = 1;

module.exports = {
  BOOST_DURATION_MINUTES,
  BOOST_SOURCES,
  FREE_BOOST_CREDITS,
  FREE_PRIORITY_LIKES,
};
