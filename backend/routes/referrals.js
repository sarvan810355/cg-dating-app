const express = require('express');

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { requireAuth } = require('../middleware/auth');
const { REFERRAL_REWARD_PAYMENT_PROVIDER } = require('../constants/referralOptions');

const router = express.Router();

// How many recent reward grants to return on GET /me — a small preview,
// not a full paginated history (the task spec only asks for "count +
// latest few").
const RECENT_REWARDS_LIMIT = 5;

function toRewardJSON(subscription) {
  const obj = subscription.toObject ? subscription.toObject() : subscription;
  return {
    id: obj._id,
    planCode: obj.plan && obj.plan.code ? obj.plan.code : null,
    planName: obj.plan && obj.plan.name ? obj.plan.name : null,
    grantedAt: obj.startedAt,
    expiresAt: obj.expiresAt,
  };
}

// GET /api/referrals/me (protected) — the caller's own referral code, a
// shareable link/text, their referral count (how many people signed up
// using their code — computed on demand, see backend/models/User.js's
// comment on the `referredBy` index, not a denormalized counter), and the
// latest few reward grants they've personally received from referring
// people (NOT the rewards their referees got — this is "what have I
// earned", see docs/API_DOCUMENTATION.md's Referral section).
router.get('/referrals/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('referralCode');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [referralCount, rewardRows] = await Promise.all([
      User.countDocuments({ referredBy: req.user.id }),
      Subscription.find({
        user: req.user.id,
        paymentProvider: REFERRAL_REWARD_PAYMENT_PROVIDER,
      })
        .sort({ createdAt: -1 })
        .limit(RECENT_REWARDS_LIMIT)
        .populate('plan'),
    ]);

    return res.json({
      referralCode: user.referralCode,
      // No real deep-link infrastructure exists (see MOCK_FEATURES.md's
      // note on this) — a simple copyable string is the whole "shareable
      // link" for this pass.
      shareText: `Join CG Dating with my code: ${user.referralCode}`,
      referralCount,
      rewards: rewardRows.map(toRewardJSON),
    });
  } catch (err) {
    console.error('Get my referrals error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
