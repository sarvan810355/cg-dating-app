const express = require('express');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { computeWeeklyRecap, isRecapDue } = require('../utils/weeklyRecapUtils');

const router = express.Router();

// GET /api/recap/weekly (protected) — the caller's own last-7-days activity
// summary, computed fresh (see backend/utils/weeklyRecapUtils.js's top
// comment for why this is read-time, not scheduled), plus `isNew`: whether
// the frontend should actually surface it right now (see
// backend/utils/weeklyRecapUtils.js#isRecapDue()) based on
// `users.lastRecapShownAt`. Always returns the numbers regardless of
// `isNew` — a screen that wants to show the recap unconditionally (e.g. a
// dedicated "My Activity" page, not built in this pass) can still use them;
// Dashboard.jsx only surfaces the dismissible card when `isNew` is true.
router.get('/weekly', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('lastRecapShownAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const stats = await computeWeeklyRecap(req.user.id, now);

    return res.json({
      ...stats,
      isNew: isRecapDue(user.lastRecapShownAt, now),
      lastShownAt: user.lastRecapShownAt,
    });
  } catch (err) {
    console.error('Get weekly recap error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/recap/weekly/seen (protected) — marks the recap as shown right
// now. The frontend calls this the moment it actually displays the recap
// card (not on dismiss — dismissing just hides the already-shown card
// locally; either way, the next `isNew` won't be true again for another
// RECAP_DUE_AFTER_DAYS days). Idempotent — safe to call more than once.
router.patch('/weekly/seen', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { lastRecapShownAt: now } },
      { new: true }
    ).select('lastRecapShownAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ lastRecapShownAt: user.lastRecapShownAt });
  } catch (err) {
    console.error('Mark weekly recap seen error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
