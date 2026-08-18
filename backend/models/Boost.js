const mongoose = require('mongoose');
const { BOOST_SOURCES } = require('../constants/boostOptions');

// A single, TIME-LIMITED Profile Boost activation (Task #16 — Profile Boost +
// Priority Like, V2, see docs/DATABASE_SCHEMA.md's `boosts` section). One
// document per activation (same "one row per checkout/action, history
// preserved" pattern already used for `Subscription`, not a single mutable
// "current boost" field on `User`) — a user's PAST boosts stay queryable
// (e.g. for a future "boost history" screen or analytics) even after they
// expire, and "do I currently have an active boost" is always derived by
// querying for a not-yet-expired row rather than trusting a cached flag.
const BoostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    // Always `startedAt + BOOST_DURATION_MINUTES` (see
    // backend/constants/boostOptions.js), computed once at activation time
    // by backend/utils/entitlementUtils.js#tryActivateBoost() — never
    // extended/renewed by a later call (activating while already active is
    // rejected outright, see POST /api/boosts/activate's "can't
    // double-activate" rule).
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    // How this activation was granted — see
    // backend/constants/boostOptions.js#BOOST_SOURCES's comment for the
    // honest "fungible credit pool, not per-credit provenance" caveat.
    source: {
      type: String,
      enum: BOOST_SOURCES,
      required: true,
    },
  },
  // Only createdAt is meaningful here — a Boost activation is a point-in-time
  // event, never edited in place (same pattern as Like/Notification).
  { timestamps: { createdAt: true, updatedAt: false } }
);

// "Does this user currently have an active boost" / "what's their current
// boost's remaining time" — GET /api/boosts/status and the
// can't-double-activate check on POST /api/boosts/activate both query
// (user, expiresAt > now), newest expiry first.
BoostSchema.index({ user: 1, expiresAt: -1 });

module.exports = mongoose.model('Boost', BoostSchema);
