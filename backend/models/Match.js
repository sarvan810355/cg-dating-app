const mongoose = require('mongoose');
const { canonicalPair } = require('../utils/matchUtils');

// A mutual like between two users (created once both sides have swiped
// 'like' on each other — see backend/routes/discovery.js).
//
// `userA`/`userB` store the pair in canonical order (ascending id string, via
// canonicalPair()) purely so the compound unique index below can prevent a
// duplicate match for the same pair regardless of which direction the mutual
// like completed in (A-likes-B-second vs. B-likes-A-second would otherwise
// look like two different pairs to a naive index). `users` mirrors the same
// two ids as a convenience array — this is the field most callers (feed
// exclusion, "is this match mine" checks) actually query against, and is
// also the field name this model originally shipped with as a placeholder.
//
// Fleshed out for Task #4 (Discovery + Matching); replaces the earlier
// placeholder's single `isActive` boolean with `unmatched` (+ `unmatchedAt` /
// `unmatchedBy`) to match the product spec — unmatching is a user action with
// an actor and a timestamp, not just a flag flip. See docs/DATABASE_SCHEMA.md
// for the divergence from the original draft (`userAId`/`userBId`/`status`).
const MatchSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: 'A match must contain exactly two users.',
      },
    },
    matchedAt: {
      type: Date,
      default: Date.now,
    },
    unmatched: {
      type: Boolean,
      default: false,
    },
    unmatchedAt: {
      type: Date,
      default: null,
    },
    unmatchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Canonicalize userA/userB (and keep `users` in sync) on every validation
// pass, so callers can construct a Match with the pair in either order and
// the uniqueness index below still catches duplicates. Deliberately
// synchronous (no async work) so this also runs correctly under
// `validateSync()` for DB-independent unit testing.
MatchSchema.pre('validate', function canonicalizeUserPair(next) {
  if (this.userA && this.userB) {
    const [low, high] = canonicalPair(this.userA, this.userB);
    this.userA = low;
    this.userB = high;
    this.users = [low, high];
  }
  next();
});

// Prevents duplicate matches for the same pair regardless of swipe
// direction/race — the actual "avoid duplicate matches" safety net.
MatchSchema.index({ userA: 1, userB: 1 }, { unique: true });
// Supports "all matches involving this user" queries (GET /api/matches,
// discovery feed exclusion) without a collection scan.
MatchSchema.index({ users: 1 });

module.exports = mongoose.model('Match', MatchSchema);
