const express = require('express');
const mongoose = require('mongoose');

const SafeDate = require('../models/SafeDate');
const Match = require('../models/Match');
const { requireAuth } = require('../middleware/auth');
const { isParticipant } = require('../utils/matchUtils');
const { applySafeDateComputation, toSafeDateJSON } = require('../utils/safeDateUtils');
const { checkAndAwardBadges } = require('../utils/badgeUtils');
const {
  LOCATION_MAX_LENGTH,
  TRUSTED_CONTACT_NAME_MAX_LENGTH,
  TRUSTED_CONTACT_PHONE_MAX_LENGTH,
  DEFAULT_SAFE_DATES_LIMIT,
  MAX_SAFE_DATES_LIMIT,
} = require('../constants/safeDateOptions');

const router = express.Router();

// Loads a SafeDate by id and confirms it belongs to the caller. Returns
// `{ status, message }` to short-circuit on, or `{ safeDate }`. Same "404, not 403,
// for another user's resource" convention already used by
// backend/routes/notifications.js (a mismatched id there is a 404 too — "no such
// notification for this caller, including one that belongs to someone else" — so a
// caller can't probe for the existence of another user's records).
async function loadOwnSafeDate(id, userId) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 400, message: 'id must be a valid id' };
  }
  const safeDate = await SafeDate.findOne({ _id: id, user: userId });
  if (!safeDate) {
    return { status: 404, message: 'Safe Date plan not found' };
  }
  return { safeDate };
}

// POST /api/safe-dates (protected) — create a new Safe Date plan. Reachable from a
// Match/Chat screen ("Plan a Safe Date") on the frontend — see
// frontend/src/pages/PlanSafeDate.jsx.
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      matchId,
      location,
      plannedStartAt,
      plannedEndAt,
      trustedContactName,
      trustedContactPhone,
    } = req.body || {};

    const trimmedLocation = typeof location === 'string' ? location.trim() : '';
    if (!trimmedLocation) {
      return res.status(400).json({ message: 'location is required — an approximate public meeting place' });
    }
    if (trimmedLocation.length > LOCATION_MAX_LENGTH) {
      return res.status(400).json({ message: `location cannot exceed ${LOCATION_MAX_LENGTH} characters` });
    }

    const startDate = new Date(plannedStartAt);
    const endDate = new Date(plannedEndAt);
    if (!plannedStartAt || Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'plannedStartAt must be a valid date/time' });
    }
    if (!plannedEndAt || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'plannedEndAt must be a valid date/time' });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ message: 'plannedEndAt must be after plannedStartAt' });
    }
    // A generous 5-minute allowance for clock skew between client and server, rather
    // than rejecting a plan someone is creating right as the date is about to start.
    if (startDate.getTime() < Date.now() - 5 * 60 * 1000) {
      return res.status(400).json({ message: 'plannedStartAt cannot be in the past' });
    }

    let matchRef = null;
    if (matchId !== undefined && matchId !== null && matchId !== '') {
      if (!mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'matchId must be a valid id' });
      }
      const match = await Match.findById(matchId);
      if (!match) {
        return res.status(404).json({ message: 'Match not found' });
      }
      if (!isParticipant(match, req.user.id)) {
        return res.status(403).json({ message: 'You are not a participant in this match' });
      }
      matchRef = match._id;
    }

    let trimmedContactName = null;
    if (trustedContactName !== undefined && trustedContactName !== null && trustedContactName !== '') {
      trimmedContactName = String(trustedContactName).trim();
      if (trimmedContactName.length > TRUSTED_CONTACT_NAME_MAX_LENGTH) {
        return res
          .status(400)
          .json({ message: `trustedContactName cannot exceed ${TRUSTED_CONTACT_NAME_MAX_LENGTH} characters` });
      }
    }

    let trimmedContactPhone = null;
    if (trustedContactPhone !== undefined && trustedContactPhone !== null && trustedContactPhone !== '') {
      trimmedContactPhone = String(trustedContactPhone).trim();
      if (trimmedContactPhone.length > TRUSTED_CONTACT_PHONE_MAX_LENGTH) {
        return res
          .status(400)
          .json({ message: `trustedContactPhone cannot exceed ${TRUSTED_CONTACT_PHONE_MAX_LENGTH} characters` });
      }
      // Loose format check only (digits, spaces, +, -, parens) — this number is
      // NEVER actually used to send an SMS/call in this codebase (no SMS provider
      // configured, see MOCK_FEATURES.md), so it's stored purely for the user's own
      // reference/display, not validated as strictly as a real delivery target would
      // need.
      if (!/^[0-9+\-() ]+$/.test(trimmedContactPhone)) {
        return res.status(400).json({ message: 'trustedContactPhone may only contain digits, spaces, +, -, ( )' });
      }
    }

    const safeDate = await SafeDate.create({
      user: req.user.id,
      match: matchRef,
      location: trimmedLocation,
      plannedStartAt: startDate,
      plannedEndAt: endDate,
      trustedContactName: trimmedContactName,
      trustedContactPhone: trimmedContactPhone,
    });

    return res.status(201).json({ safeDate: toSafeDateJSON(safeDate, { isOverdue: false, isReminderWindow: false }) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create safe date error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/safe-dates (protected) — the caller's own plans, past + upcoming, newest
// planned-start first. Each item's status/isOverdue is (re)computed at read time —
// see backend/utils/safeDateUtils.js and MOCK_FEATURES.md's Safe Date entry.
router.get('/', requireAuth, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_SAFE_DATES_LIMIT;
    limit = Math.min(limit, MAX_SAFE_DATES_LIMIT);

    const filter = { user: req.user.id };
    if (req.query.status !== undefined) {
      filter.status = req.query.status;
    }

    const docs = await SafeDate.find(filter)
      .sort({ plannedStartAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = docs.length > limit;
    const pageDocs = docs.slice(0, limit);

    const io = req.app.get('io');
    const safeDates = [];
    for (const doc of pageDocs) {
      // eslint-disable-next-line no-await-in-loop -- small per-page list (<= 50), and
      // each iteration only ever writes when this specific plan's own state changed
      // (a status transition or a first-time reminder) — not worth the complexity of
      // batching for this MVP-scale feature.
      const computed = await applySafeDateComputation(doc, { io });
      safeDates.push(toSafeDateJSON(doc, computed));
    }

    return res.json({ safeDates, page, hasMore });
  } catch (err) {
    console.error('List safe dates error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/safe-dates/:id (protected, owner-only)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const loaded = await loadOwnSafeDate(req.params.id, req.user.id);
    if (loaded.status) return res.status(loaded.status).json({ message: loaded.message });

    const io = req.app.get('io');
    const computed = await applySafeDateComputation(loaded.safeDate, { io });

    return res.json({ safeDate: toSafeDateJSON(loaded.safeDate, computed) });
  } catch (err) {
    console.error('Get safe date error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/safe-dates/:id/check-in (protected, owner-only) — "I've arrived / I'm
// safe". Allowed from PLANNED or MISSED_CHECKIN (a late check-in is still a valid "I'm
// safe" signal) — rejected once the plan is already COMPLETED/CANCELLED.
router.patch('/:id/check-in', requireAuth, async (req, res) => {
  try {
    const loaded = await loadOwnSafeDate(req.params.id, req.user.id);
    if (loaded.status) return res.status(loaded.status).json({ message: loaded.message });
    const { safeDate } = loaded;

    if (!['PLANNED', 'MISSED_CHECKIN'].includes(safeDate.status)) {
      return res.status(400).json({ message: `Cannot check in — this plan is already ${safeDate.status}` });
    }

    safeDate.status = 'CHECKED_IN';
    safeDate.checkedInAt = new Date();
    await safeDate.save();

    return res.json({ safeDate: toSafeDateJSON(safeDate, { isOverdue: false, isReminderWindow: false }) });
  } catch (err) {
    console.error('Safe date check-in error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/safe-dates/:id/complete (protected, owner-only) — the user manually
// confirms the date ended safely. Allowed from any non-terminal state (PLANNED,
// CHECKED_IN, or MISSED_CHECKIN — showing up late and then finishing the date safely
// is still a completion), rejected once already COMPLETED/CANCELLED.
router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const loaded = await loadOwnSafeDate(req.params.id, req.user.id);
    if (loaded.status) return res.status(loaded.status).json({ message: loaded.message });
    const { safeDate } = loaded;

    if (['COMPLETED', 'CANCELLED'].includes(safeDate.status)) {
      return res.status(400).json({ message: `Cannot complete — this plan is already ${safeDate.status}` });
    }

    safeDate.status = 'COMPLETED';
    safeDate.completedAt = new Date();
    await safeDate.save();

    // Task #20 — Achievements/Badges (V2 scope): FIRST_SAFE_DATE_COMPLETED's
    // natural award point. Isolated try/catch, same "never turn a
    // successful state change into a 500" pattern as every other badge-check
    // call site.
    try {
      await checkAndAwardBadges(req.user.id, 'safeDate', req.app.get('io'));
    } catch (badgeErr) {
      console.error('Badge check error (safe date complete):', badgeErr);
    }

    return res.json({ safeDate: toSafeDateJSON(safeDate, { isOverdue: false, isReminderWindow: false }) });
  } catch (err) {
    console.error('Safe date complete error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/safe-dates/:id/cancel (protected, owner-only)
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const loaded = await loadOwnSafeDate(req.params.id, req.user.id);
    if (loaded.status) return res.status(loaded.status).json({ message: loaded.message });
    const { safeDate } = loaded;

    if (['COMPLETED', 'CANCELLED'].includes(safeDate.status)) {
      return res.status(400).json({ message: `Cannot cancel — this plan is already ${safeDate.status}` });
    }

    safeDate.status = 'CANCELLED';
    safeDate.cancelledAt = new Date();
    await safeDate.save();

    return res.json({ safeDate: toSafeDateJSON(safeDate, { isOverdue: false, isReminderWindow: false }) });
  } catch (err) {
    console.error('Safe date cancel error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
