const mongoose = require('mongoose');
const { SWIPE_ACTIONS } = require('../constants/discoveryOptions');

// A single swipe decision by `fromUser` on `toUser`. Both 'like' and 'pass'
// swipes are recorded here (not just likes) so the discovery feed never
// re-shows a candidate the caller has already decided on.
const LikeSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: SWIPE_ACTIONS,
      required: true,
    },
    // --- Task #16 — Priority Like (V2 scope, "Super Like" equivalent). Only
    // ever `true` when `action === 'like'` (a 'pass' can never be priority —
    // enforced at the route layer, backend/routes/discovery.js's POST
    // /swipe, not the schema, since a boolean field can't express "only
    // valid alongside this other field's specific value" on its own).
    // Chosen as a boolean flag on the existing Like document rather than a
    // third `action` enum value ('priority_like') — a priority like IS a
    // like (same mutual-match detection, same "don't re-show this
    // candidate" exclusion rule, same daily-like-quota consumption) that
    // additionally consumes a separate `priorityLikesRemaining` credit and
    // carries an extra ranking/notification effect; modeling it as a
    // distinct `action` value would have meant duplicating every "action
    // === 'like'" check across discovery.js/matchUtils.js for what is
    // fundamentally still a like. Defaults to `false` so every
    // already-recorded Like from before this task reads as a correct,
    // ordinary (non-priority) like with no migration needed.
    priority: {
      type: Boolean,
      default: false,
    },
  },
  // Only createdAt is meaningful here — a swipe is a point-in-time decision,
  // never edited in place (see backend/routes/discovery.js for how a repeat
  // swipe with a different action is handled: a 409, not an update).
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A user can only swipe once per candidate — this is both the integrity
// constraint (no duplicate likes/passes) and the lookup index used for
// mutual-like detection and for excluding already-swiped users from the feed.
LikeSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });
// "Did toUser like fromUser back" / "who liked me" lookups.
LikeSchema.index({ toUser: 1, action: 1 });

module.exports = mongoose.model('Like', LikeSchema);
