// Shared audit-log-write helper for the Admin panel (Task #11 in the
// internal TaskList; = docs/ROADMAP.md's Phase 9) — used by every
// state-changing route in backend/routes/admin.js so there is exactly one
// place that knows how to write an AuditLog document.

const AuditLog = require('../models/AuditLog');

// Writes an AuditLog entry. Deliberately isolated in its own try/catch, same
// "side effect never turns an otherwise-successful request into a 500"
// pattern already used for notification creation
// (backend/utils/notificationUtils.js, called from backend/routes/
// discovery.js / matches.js) — an admin mutation (e.g. suspending a user)
// has already fully succeeded by the time this is called, and a logging
// hiccup shouldn't roll that back or hide the success from the caller. The
// error is still logged server-side so a persistent audit-log failure isn't
// silent forever.
async function writeAuditLog({ actorId, action, targetUserId = null, details = {} }) {
  try {
    await AuditLog.create({ actor: actorId, action, targetUserId, details });
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}

module.exports = { writeAuditLog };
