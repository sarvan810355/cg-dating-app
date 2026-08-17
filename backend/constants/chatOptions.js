// Shared enums / config for Chat (Task #5). Kept in one place so the
// Message model, the message routes, and (indirectly, via the API) the
// frontend all agree on the same values — same convention as
// backend/constants/discoveryOptions.js.

// Reasonable hard cap on a single text message — generous for a chat
// message, cheap to validate, prevents pathological payloads.
const MAX_MESSAGE_LENGTH = 2000;

// GET /api/matches/:matchId/messages pagination defaults — newest-first,
// cursor-paginated (see docs/API_DOCUMENTATION.md for why).
const DEFAULT_MESSAGES_LIMIT = 30;
const MAX_MESSAGES_LIMIT = 50;

module.exports = {
  MAX_MESSAGE_LENGTH,
  DEFAULT_MESSAGES_LIMIT,
  MAX_MESSAGES_LIMIT,
};
