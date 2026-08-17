const express = require('express');
const mongoose = require('mongoose');

const Report = require('../models/Report');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const {
  REPORT_REASONS,
  REPORT_DETAILS_MAX_LENGTH,
  MAX_EVIDENCE_ITEMS,
  EVIDENCE_ITEM_MAX_LENGTH,
} = require('../constants/safetyOptions');

const router = express.Router();

// Whitelisted shape returned to the reporter — never includes reviewNotes
// (select: false on the schema anyway) or any other reporter's data. There
// is no GET endpoint for reports in this pass (no "my reports" screen was
// asked for) — this is only ever the direct response to a successful POST.
function toOwnReportJSON(report) {
  return {
    id: report._id,
    reportedUserId: report.reportedUser,
    reason: report.reason,
    details: report.details,
    evidence: report.evidence,
    status: report.status,
    createdAt: report.createdAt,
  };
}

// POST /api/reports (protected)
// Body: { "reportedUserId": "...", "reason": "...", "details"?: "...", "evidence"?: ["..."] }
// Creates a report against another user. The reporter is always the
// authenticated caller — never taken from the client. Reachable from a
// user's profile card (Discovery) and from the Chat screen (report the
// other person in a match) on the frontend.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { reportedUserId, reason } = req.body || {};

    if (!reportedUserId || !mongoose.Types.ObjectId.isValid(reportedUserId)) {
      return res.status(400).json({ message: 'reportedUserId must be a valid user id' });
    }
    if (String(reportedUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ message: `reason must be one of: ${REPORT_REASONS.join(', ')}` });
    }

    const reportedUserExists = await User.exists({ _id: reportedUserId });
    if (!reportedUserExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    let details = null;
    if (req.body.details !== undefined && req.body.details !== null) {
      const trimmed = String(req.body.details).trim();
      if (trimmed.length > REPORT_DETAILS_MAX_LENGTH) {
        return res
          .status(400)
          .json({ message: `details must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer` });
      }
      details = trimmed || null;
    }

    let evidence = [];
    if (req.body.evidence !== undefined) {
      if (!Array.isArray(req.body.evidence)) {
        return res.status(400).json({ message: 'evidence must be an array of strings' });
      }
      if (req.body.evidence.length > MAX_EVIDENCE_ITEMS) {
        return res
          .status(400)
          .json({ message: `evidence can have at most ${MAX_EVIDENCE_ITEMS} entries` });
      }
      evidence = req.body.evidence.map((e) => String(e).trim()).filter(Boolean);
      const tooLong = evidence.find((e) => e.length > EVIDENCE_ITEM_MAX_LENGTH);
      if (tooLong) {
        return res.status(400).json({
          message: `Each evidence entry must be ${EVIDENCE_ITEM_MAX_LENGTH} characters or fewer`,
        });
      }
    }

    const report = await Report.create({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reason,
      details,
      evidence,
    });

    return res.status(201).json({ report: toOwnReportJSON(report) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create report error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
