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
