const express = require('express');

const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { getActiveBoost, tryActivateBoost } = require('../utils/entitlementUtils');
const { BOOST_DURATION_MINUTES } = require('../constants/boostOptions');

const router = express.Router();

// Shared shape for both routes below — a Boost document (or null) + the
// caller's current credit balance, with a derived `remainingSeconds` so the
// frontend can render a live countdown without doing its own date math
// against a raw `expiresAt` (same "server computes, client just renders"
// convention already used for Safe Date's `isOverdue`/`isReminderWindow`).
function toBoostStatusJSON(boost, creditsRemaining, now = new Date()) {
  const active = !!boost && boost.expiresAt.getTime() > now.getTime();
  return {
    active,
    boost: boost
      ? {
          id: boost._id,
          startedAt: boost.startedAt,
          expiresAt: boost.expiresAt,
          source: boost.source,
          remainingSeconds: active
            ? Math.max(0, Math.round((boost.expiresAt.getTime() - now.getTime()) / 1000))
            : 0,
        }
      : null,
    boostCreditsRemaining: creditsRemaining,
    boostDurationMinutes: BOOST_DURATION_MINUTES,
  };
}

// GET /api/boosts/status (protected) — whether the caller currently has an
// active (non-expired) boost, its remaining time, and their credit balance.
// Always a fresh DB read (see backend/utils/entitlementUtils.js#getActiveBoost())
// — nothing about boost status is ever cached on the JWT/session.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const [boost, user] = await Promise.all([
      getActiveBoost(req.user.id, now),
      User.findById(req.user.id).select('boostCreditsRemaining'),
    ]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json(toBoostStatusJSON(boost, user.boostCreditsRemaining || 0, now));
  } catch (err) {
    console.error('Boost status error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/boosts/activate (protected) — activates a BOOST_DURATION_MINUTES
// (30-minute) Profile Boost, consuming one `boostCreditsRemaining` credit.
// See backend/utils/entitlementUtils.js#tryActivateBoost() for the full
// "can't double-activate, can't go negative" logic — this route is a thin
// HTTP wrapper over it, same shape as every other entitlement-gated route in
// this codebase (e.g. POST /api/discovery/swipe's daily-like-limit check).
router.post('/activate', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    // Every activation built in this pass is user-initiated, spending from
    // the caller's own fungible credit balance — see
    // backend/constants/boostOptions.js#BOOST_SOURCES's comment for why
    // this is always recorded as 'purchased' regardless of how the credit
    // being spent was originally granted.
    const result = await tryActivateBoost(req.user.id, 'purchased', now);

    if (!result.activated && result.reason === 'ALREADY_ACTIVE') {
      const user = await User.findById(req.user.id).select('boostCreditsRemaining');
      return res.status(409).json({
        message: 'You already have an active boost',
        ...toBoostStatusJSON(result.boost, user?.boostCreditsRemaining || 0, now),
      });
    }
    if (!result.activated) {
      // NO_CREDITS — a genuinely different situation from the 409 above
      // (nothing to activate at all), and a genuinely different situation
      // from the daily-like-limit's 429 (that quota resets tomorrow; a
      // spent boost credit does not reset on its own — same "402, not 429"
      // reasoning as POST /api/discovery/swipe's priority-like check, see
      // that route's comment).
      const user = await User.findById(req.user.id).select('boostCreditsRemaining');
      return res.status(402).json({
        message: "You're out of Boost credits. Upgrade your plan for more.",
        upgradeRequired: true,
        boostCreditsRemaining: user?.boostCreditsRemaining || 0,
      });
    }

    return res
      .status(201)
      .json(toBoostStatusJSON(result.boost, result.creditsRemaining, now));
  } catch (err) {
    console.error('Boost activate error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
