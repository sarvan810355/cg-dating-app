const express = require('express');

const User = require('../models/User');
const Profile = require('../models/Profile');
const Match = require('../models/Match');
const SafeDate = require('../models/SafeDate');
const { requireAuth } = require('../middleware/auth');
const { BADGE_CATALOG, MATCHES_10_THRESHOLD, MATCHES_50_THRESHOLD, REFERRALS_5_THRESHOLD, ACTIVE_STREAK_7_THRESHOLD } = require('../constants/badgeOptions');

const router = express.Router();

// Cheap, per-badge "how close am I" hint for a still-locked badge — nice-to-have
// per the task spec ("skip if it adds much complexity"), kept intentionally simple:
// only for the badges whose progress is a plain count/percentage already computed
// below for the response as a whole (no extra queries beyond what GET already runs).
// Returns `null` for a badge with no meaningful partial-progress display (a
// verification badge is binary — either verified or not; a "first X" badge already
// has a defined-progress version elsewhere in the catalog when the underlying count
// gets there).
function computeProgress(code, stats) {
  switch (code) {
    case 'PROFILE_COMPLETE':
      return { current: stats.profileCompletionPercentage, target: 100 };
    case 'MATCHES_10':
      return { current: Math.min(stats.matchCount, MATCHES_10_THRESHOLD), target: MATCHES_10_THRESHOLD };
    case 'MATCHES_50':
      return { current: Math.min(stats.matchCount, MATCHES_50_THRESHOLD), target: MATCHES_50_THRESHOLD };
    case 'REFERRALS_5':
      return { current: Math.min(stats.referralCount, REFERRALS_5_THRESHOLD), target: REFERRALS_5_THRESHOLD };
    case 'ACTIVE_STREAK_7':
      return { current: Math.min(stats.currentStreakDays, ACTIVE_STREAK_7_THRESHOLD), target: ACTIVE_STREAK_7_THRESHOLD };
    default:
      // FIRST_MATCH / FIRST_REFERRAL / FIRST_SAFE_DATE_COMPLETED / MOBILE_VERIFIED /
      // PHOTO_VERIFIED are binary conditions — nothing meaningful to show as a
      // fraction, so no progress hint is fabricated for them.
      return null;
  }
}

// GET /api/badges (protected) — the full catalog, which ones the caller has already
// unlocked (+ when), and a cheap progress hint toward the still-locked ones where
// one is meaningfully computable (see computeProgress() above). A handful of extra
// indexed count queries, all already-established access patterns reused from
// elsewhere in this codebase (Match/User(referredBy)/SafeDate counts) — not a
// aggregation pipeline, not a batch job; this route is cheap enough to call on every
// Badges screen load.
router.get('/', requireAuth, async (req, res) => {
  try {
    const [user, profile] = await Promise.all([
      User.findById(req.user.id).select('unlockedBadges currentStreakDays'),
      Profile.findOne({ user: req.user.id }).select('profileCompletionPercentage'),
    ]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [matchCount, referralCount, safeDateCompletedCount] = await Promise.all([
      Match.countDocuments({ users: req.user.id, unmatched: false }),
      User.countDocuments({ referredBy: req.user.id }),
      SafeDate.countDocuments({ user: req.user.id, status: 'COMPLETED' }),
    ]);

    const stats = {
      matchCount,
      referralCount,
      safeDateCompletedCount,
      currentStreakDays: user.currentStreakDays || 0,
      profileCompletionPercentage: profile?.profileCompletionPercentage || 0,
    };

    const unlockedByCode = new Map(user.unlockedBadges.map((b) => [b.code, b.unlockedAt]));

    const badges = BADGE_CATALOG.map((def) => {
      const unlocked = unlockedByCode.has(def.code);
      return {
        code: def.code,
        label: def.label,
        description: def.description,
        icon: def.icon,
        unlocked,
        unlockedAt: unlocked ? unlockedByCode.get(def.code) : null,
        progress: unlocked ? null : computeProgress(def.code, stats),
      };
    });

    return res.json({
      badges,
      unlockedCount: unlockedByCode.size,
      totalCount: BADGE_CATALOG.length,
    });
  } catch (err) {
    console.error('Get badges error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
