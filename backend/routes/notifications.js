const express = require('express');
const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { toNotificationJSON } = require('../utils/notificationUtils');
const {
  DEFAULT_NOTIFICATIONS_LIMIT,
  MAX_NOTIFICATIONS_LIMIT,
  PREFERENCE_FIELD_BY_TYPE,
} = require('../constants/notificationOptions');

const router = express.Router();

// The set of preference fields exposed by GET/PUT .../preferences —
// currently ['matchNotifications', 'likeNotifications',
// 'messageNotifications']. Derived from PREFERENCE_FIELD_BY_TYPE so this
// route file and the preference-gating logic in
// backend/utils/notificationUtils.js can never drift apart.
const PREFERENCE_FIELDS = Object.values(PREFERENCE_FIELD_BY_TYPE);

function defaultPreferences() {
  const defaults = {};
  PREFERENCE_FIELDS.forEach((field) => {
    defaults[field] = true;
  });
  return defaults;
}

// A brand-new user (or one whose document predates this field) has no
// `notificationPreferences` sub-document at all yet — always resolve to the
// same effective defaults (all `true`) as the User schema declares, rather
// than exposing `undefined` to clients.
function toPreferencesJSON(prefs) {
  const defaults = defaultPreferences();
  const result = {};
  PREFERENCE_FIELDS.forEach((field) => {
    result[field] = prefs && prefs[field] !== undefined ? prefs[field] : defaults[field];
  });
  return result;
}

// GET /api/notifications (protected) — paginated, newest-first.
router.get('/', requireAuth, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_NOTIFICATIONS_LIMIT;
    limit = Math.min(limit, MAX_NOTIFICATIONS_LIMIT);

    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = notifications.length > limit;
    const pageNotifications = notifications.slice(0, limit);

    return res.json({
      notifications: pageNotifications.map(toNotificationJSON),
      page,
      hasMore,
    });
  } catch (err) {
    console.error('List notifications error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/notifications/unread-count (protected) — lets the frontend badge
// poll cheaply without paginating the full list.
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    return res.json({ unreadCount });
  } catch (err) {
    console.error('Unread notification count error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/notifications/preferences (protected)
router.get('/preferences', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationPreferences');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ preferences: toPreferencesJSON(user.notificationPreferences) });
  } catch (err) {
    console.error('Get notification preferences error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PUT /api/notifications/preferences (protected) — partial update; body may
// include any subset of { matchNotifications, likeNotifications,
// messageNotifications }, each a boolean. There is deliberately no field
// here to disable a safety-critical notification type — 'verification'/
// 'safety'/'subscription' aren't in PREFERENCE_FIELD_BY_TYPE at all, so
// there's nothing for a client to even try to toggle for them (see
// backend/constants/notificationOptions.js).
router.put('/preferences', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const update = {};
    const errors = [];

    PREFERENCE_FIELDS.forEach((field) => {
      if (body[field] === undefined) return;
      if (typeof body[field] !== 'boolean') {
        errors.push(`${field} must be a boolean`);
        return;
      }
      update[`notificationPreferences.${field}`] = body[field];
    });

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Invalid preferences', errors });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('notificationPreferences');

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ preferences: toPreferencesJSON(user.notificationPreferences) });
  } catch (err) {
    console.error('Update notification preferences error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/notifications/read-all (protected) — marks every unread
// notification for the caller as read. Idempotent — re-calling with nothing
// unread simply reports updatedCount: 0 (same pattern as
// PATCH /api/matches/:matchId/messages/read).
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } }
    );
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/notifications/:id/read (protected) — marks one notification as
// read. Only the recipient can mark their own notification read; any other
// id (not found, or belonging to someone else) is a 404 rather than a 403,
// so callers can't probe for the existence of other users' notification ids.
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'id must be a valid notification id' });
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id,
    });
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (!notification.read) {
      notification.read = true;
      await notification.save();
    }

    return res.json({ notification: toNotificationJSON(notification) });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
