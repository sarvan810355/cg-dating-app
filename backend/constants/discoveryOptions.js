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

module.exports = {
  SWIPE_ACTIONS,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  DEFAULT_MATCHES_LIMIT,
  MAX_MATCHES_LIMIT,
};
