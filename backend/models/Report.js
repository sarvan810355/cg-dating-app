const mongoose = require('mongoose');
const { REPORT_REASONS, REPORT_STATUSES } = require('../constants/safetyOptions');

// A user-submitted report against another user (Task #10 in the internal
// TaskList; = docs/ROADMAP.md's Phase 8). Read by the future Admin
// moderation queue (Task #11, docs/API_DOCUMENTATION.md's
// `GET`/`PUT /api/admin/reports*`) — no code path here ever transitions
// `status` away from `PENDING`; that's the Admin panel's job.
const ReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: true,
    },
    // Free text, optional — see backend/constants/safetyOptions.js's
    // REPORT_DETAILS_MAX_LENGTH for the length cap enforced at the route
    // layer (backend/routes/reports.js).
    details: {
      type: String,
      trim: true,
      default: null,
    },
    // Optional array of photo/message-reference URLs supporting the report.
    // MOCK/TEMPORARY-simple: plain strings (a URL, or a short free-text
    // reference) — no file-upload path exists in this pass, see
    // MOCK_FEATURES.md.
    evidence: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: 'PENDING',
    },
    // Set only once a moderator acts on this report (Task #11) — nullable
    // until then, same pattern as Match.unmatchedAt.
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // [NEVER EXPOSED] to the reporter, the reported user, or anyone but an
    // admin — private moderation notes, per docs/DATABASE_SCHEMA.md's global
    // field-level access rule. `select: false` so a default
    // Report.find()/findById() never loads it.
    reviewNotes: {
      type: String,
      default: null,
      select: false,
    },
  },
  // Only createdAt is meaningful as a `timestamps` field — a report's
  // moderation outcome lives in the separate, deliberately-nullable
  // `reviewedAt` (set only when a moderator acts on it), so `updatedAt`
  // isn't tracked — same choice already made for Like/Notification.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The future Admin moderation queue's actual access pattern: "reports in
// this status, newest first" (GET /api/admin/reports?status=) — required by
// the Task #10 spec ahead of Task #11 actually building that queue.
ReportSchema.index({ status: 1, createdAt: -1 });
// "All reports filed against this user" — useful both for the future admin
// queue and any future automated signal (e.g. N reports in M days).
ReportSchema.index({ reportedUser: 1 });

module.exports = mongoose.model('Report', ReportSchema);
