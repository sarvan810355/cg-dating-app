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

module.exports = { canonicalPair, isMutualLike };
