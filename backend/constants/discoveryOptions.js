// Shared enums / config for Discovery + Matching (Task #4). Kept in one place
// so the Like model, discovery/matches routes, and (indirectly, via the API)
// the frontend all agree on the same values — same convention as
// backend/constants/profileOptions.js.

// A "swipe" records either direction — 'like' (interested) or 'pass' (not
// interested) — as a single Like document (see backend/models/Like.js).
const SWIPE_ACTIONS = ['like', 'pass'];

const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 20;

const DEFAULT_MATCHES_LIMIT = 20;
const MAX_MATCHES_LIMIT = 50;

// --- Task #14 — Persistent match preferences (location/age, V2,
// user-requested: "location preference ... jaise other dating apps kaam
// karte hain"). See docs/DATABASE_SCHEMA.md's `profiles.preferences` section
// and docs/API_DOCUMENTATION.md's Discovery section for the full contract. ---
const DEFAULT_MAX_DISTANCE_KM = 50;
const MAX_DISTANCE_KM_CAP = 500; // generous "search wider" ceiling, not a hard product limit
const DEFAULT_MIN_AGE_PREF = 18; // == profileOptions.js's MIN_AGE — the hard safety floor
const DEFAULT_MAX_AGE_PREF = 45;
const MAX_AGE_PREF_CAP = 100;

module.exports = {
  SWIPE_ACTIONS,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  DEFAULT_MATCHES_LIMIT,
  MAX_MATCHES_LIMIT,
  DEFAULT_MAX_DISTANCE_KM,
  MAX_DISTANCE_KM_CAP,
  DEFAULT_MIN_AGE_PREF,
  DEFAULT_MAX_AGE_PREF,
  MAX_AGE_PREF_CAP,
};
