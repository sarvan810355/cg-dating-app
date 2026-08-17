const express = require('express');

const Match = require('../models/Match');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { DEFAULT_MATCHES_LIMIT, MAX_MATCHES_LIMIT } = require('../constants/discoveryOptions');

const router = express.Router();

// GET /api/matches (protected) — the caller's active (not-unmatched)
// matches, newest first, with the other participant's basic profile info
// (for a match list card) attached.
router.get('/', requireAuth, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_MATCHES_LIMIT;
    limit = Math.min(limit, MAX_MATCHES_LIMIT);

    const matches = await Match.find({ users: req.user.id, unmatched: false })
      .sort({ matchedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = matches.length > limit;
    const pageMatches = matches.slice(0, limit);

    const otherUserIds = pageMatches.map((m) =>
      m.users.find((u) => u.toString() !== req.user.id).toString()
    );
    const profiles = await Profile.find({ user: { $in: otherUserIds } });
    const profileByUser = new Map(profiles.map((p) => [p.user.toString(), p]));

    const result = pageMatches.map((m) => {
      const otherUserId = m.users.find((u) => u.toString() !== req.user.id).toString();
      const p = profileByUser.get(otherUserId);
      const primaryPhoto = p?.photos?.find((ph) => ph.isPrimary)?.url || p?.photos?.[0]?.url || null;
      return {
        id: m._id,
        matchedAt: m.matchedAt,
        otherUser: {
          userId: otherUserId,
          displayName: p?.displayName || null,
          age: p ? p.age : null,
          city: p?.city || null,
          district: p?.district || null,
          datingIntention: p?.datingIntention || null,
          photo: primaryPhoto,
        },
      };
    });

    return res.json({ matches: result, page, hasMore });
  } catch (err) {
    console.error('List matches error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
