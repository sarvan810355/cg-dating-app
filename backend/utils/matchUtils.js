// Pure, DB-independent helpers for canonical match-pair ordering and swipe
// state logic. Kept separate from the Match model / discovery routes so the
// core "which pair do these two users canonically form" and "does this
// complete a mutual like" logic can be unit-tested with plain Node scripts,
// without a live MongoDB connection — see IMPLEMENTATION_PROGRESS.md for why
// that matters in this sandbox.

// Returns [low, high] — the two user ids sorted ascending as strings. This
// is the canonical order stored on Match.userA/Match.userB so the same pair
// of users always maps to the same document regardless of which direction
// the mutual like completed in (A likes B first vs. B likes A first), which
// is what lets a single compound unique index prevent duplicate matches.
function canonicalPair(idA, idB) {
  return [String(idA), String(idB)].sort();
}

// Given the Like document (or null) representing the *other* user's swipe on
// the current user, determines whether the current 'like' action just
// completed a mutual like.
function isMutualLike(reciprocalLike) {
  return !!reciprocalLike && reciprocalLike.action === 'like';
}

// Whether `userId` is one of the two participants of `match` (a loaded
// Match document, or any plain object exposing a `users` array of the same
// shape). Pure/DB-independent — added for Task #5 (Chat) so the
// GET/POST/PATCH message routes and the Socket.IO room-join handler can
// share the exact same authorization check instead of each re-deriving it.
function isParticipant(match, userId) {
  if (!match || !Array.isArray(match.users)) return false;
  return match.users.some((u) => String(u) === String(userId));
}

// The other participant's id (as a string) for a two-person match, or null
// if `userId` isn't a participant at all. Used to derive Message.recipient
// without a second DB lookup. Deliberately checks membership first (not
// just "the first id that isn't userId") so a non-participant never gets
// back an arbitrary participant's id — callers in this codebase always
// call this after an isParticipant() check anyway (see
// backend/routes/matches.js's loadAuthorizedMatch()), but the function's
// own contract should hold even if called in isolation.
function otherParticipant(match, userId) {
  if (!isParticipant(match, userId)) return null;
  const other = match.users.find((u) => String(u) !== String(userId));
  return other ? String(other) : null;
}

module.exports = { canonicalPair, isMutualLike, isParticipant, otherParticipant };
