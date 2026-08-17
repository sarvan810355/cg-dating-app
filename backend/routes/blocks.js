const express = require('express');
const mongoose = require('mongoose');

const Block = require('../models/Block');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function toBlockJSON(block) {
  return {
    id: block._id,
    blockedUserId: block.blocked,
    createdAt: block.createdAt,
  };
}

// POST /api/blocks (protected) — body { "blockedUserId": "..." }.
// Reachable from a user's profile card (Discovery) and from the Chat screen
// on the frontend, both behind a confirmation prompt (blocking is
// consequential). Deliberately does NOT notify `blockedUserId` in any way —
// per the product spec, blocking must be silent to the blocked party (see
// docs/API_DOCUMENTATION.md's Safety section) — no Notification document is
// ever created here.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { blockedUserId } = req.body || {};

    if (!blockedUserId || !mongoose.Types.ObjectId.isValid(blockedUserId)) {
      return res.status(400).json({ message: 'blockedUserId must be a valid user id' });
    }
    if (String(blockedUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    const targetExists = await User.exists({ _id: blockedUserId });
    if (!targetExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    let block;
    let statusCode = 201;
    try {
      block = await Block.create({ blocker: req.user.id, blocked: blockedUserId });
    } catch (err) {
      if (err.code === 11000) {
        // Already blocked — idempotent, not an error (e.g. a retried
        // request, or blocking from two different entry points in a row).
        block = await Block.findOne({ blocker: req.user.id, blocked: blockedUserId });
        statusCode = 200;
      } else {
        throw err;
      }
    }

    return res.status(statusCode).json({ block: toBlockJSON(block) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create block error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// DELETE /api/blocks/:userId (protected) — unblock. Idempotent-friendly in
// spirit but returns 404 if the caller isn't currently blocking that user,
// so the frontend's "manage blocked users" screen gets clear feedback if a
// row is somehow already stale (e.g. unblocked in another tab).
router.delete('/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId must be a valid id' });
    }

    const deleted = await Block.findOneAndDelete({ blocker: req.user.id, blocked: userId });
    if (!deleted) {
      return res.status(404).json({ message: 'You have not blocked this user' });
    }

    return res.json({ unblocked: true, userId });
  } catch (err) {
    console.error('Delete block error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/blocks (protected) — the caller's blocked-users list, for the
// "manage blocked users" settings screen (frontend/src/pages/
// BlockedUsers.jsx). Newest-first; not paginated in this pass (a user's own
// block list is expected to stay small — pagination can be added later the
// same way GET /api/matches did if that assumption stops holding).
router.get('/', requireAuth, async (req, res) => {
  try {
    const blocks = await Block.find({ blocker: req.user.id }).sort({ createdAt: -1 });
    const blockedUserIds = blocks.map((b) => b.blocked.toString());

    const profiles = await Profile.find({ user: { $in: blockedUserIds } });
    const profileByUser = new Map(profiles.map((p) => [p.user.toString(), p]));

    const result = blocks.map((b) => {
      const p = profileByUser.get(b.blocked.toString());
      const primaryPhoto = p?.photos?.find((ph) => ph.isPrimary)?.url || p?.photos?.[0]?.url || null;
      return {
        blockedUserId: b.blocked,
        displayName: p?.displayName || null,
        photo: primaryPhoto,
        createdAt: b.createdAt,
      };
    });

    return res.json({ blocks: result });
  } catch (err) {
    console.error('List blocks error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
