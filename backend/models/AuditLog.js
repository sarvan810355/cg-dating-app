const mongoose = require('mongoose');

// A simple, append-only record of every state-changing Admin action (Task
// #11 in the internal TaskList; = docs/ROADMAP.md's Phase 9). Written from
// backend/routes/admin.js via backend/utils/auditUtils.js#writeAuditLog()
// after every mutation there (report review, verification approve/reject,
// suspend/reinstate, role change) — never read back by any non-admin route,
// and never exposed to a non-admin API response.
//
// Deliberately simpler than docs/DATABASE_SCHEMA.md's originally-drafted
// `audit_logs` shape ({ actorUserId, action, entityType, entityId,
// metadata }) — this basic moderation panel only ever targets a single user
// (or no user, e.g. a future non-user-scoped admin action), so a plain
// `targetUserId` covers every action this task adds without needing a
// generic `entityType`/`entityId` pair; `details` plays the same role as
// the draft's `metadata`. Widen back to the generic shape later if a
// non-user-targeted admin action needs auditing.
const AuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Free string, e.g. 'report.reviewed', 'user.suspended',
    // 'verification.approved' — not a closed enum, so new admin actions
    // never require a schema change, same spirit as
    // backend/models/Notification.js's payload being loosely typed per-type.
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Small free-form object with action-specific context (e.g.
    // { reportId, status } for 'report.reviewed', { oldRole, newRole } for
    // 'user.role_changed'). [May contain private moderation notes — NEVER
    // EXPOSED to non-admin API responses], per docs/DATABASE_SCHEMA.md's
    // global field-level access rule and its `audit_logs` section.
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  // createdAt only — an audit log entry is never edited in place, same
  // pattern already used for Like/Notification/Report.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The actual access pattern for any future "recent admin activity" view:
// newest first.
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
