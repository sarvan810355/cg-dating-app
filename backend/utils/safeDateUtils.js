// Safe Date mode (Task #18 — V2, see docs/ROADMAP.md's Phase 12). Read-time status
// computation — see backend/models/SafeDate.js's model-level comment and
// MOCK_FEATURES.md's Safe Date entry for the full "why read-time, not a real
// scheduler/SMS alert" explanation. This file is intentionally split into:
//
//   1. `computeSafeDateStatus()` — a PURE function (no DB, no I/O) so it's
//      unit-testable via a standalone Node script without a live MongoDB
//      connection, same convention already used by backend/utils/matchUtils.js
//      and backend/utils/notificationUtils.js#isNotificationTypeEnabled().
//   2. `applySafeDateComputation()` — the DB-touching wrapper the routes actually
//      call, which persists a MISSED_CHECKIN transition and creates the read-time
//      reminder Notification when applicable.

const {
  CHECKIN_GRACE_MINUTES,
  MISSED_CHECKIN_GRACE_MINUTES,
  REMINDER_WINDOW_MINUTES,
} = require('../constants/safeDateOptions');
const { createNotification } = require('./notificationUtils');

const MINUTE_MS = 60 * 1000;

// Pure. Given a plain object exposing `{ status, plannedStartAt, plannedEndAt }`
// (a loaded SafeDate document works fine — Mongoose documents support plain
// property access) and a reference `now`, returns:
//   - `isOverdue` (bool) — true once the caller is meaningfully late to check in
//     for a still-PLANNED date (past `plannedStartAt` + a grace period), and stays
//     true for a date that has already been reclassified `MISSED_CHECKIN`.
//   - `effectiveStatus` — the status this date SHOULD have right now. Equal to
//     `doc.status` in every case except: a PLANNED date well past `plannedEndAt`
//     with no check-in becomes `MISSED_CHECKIN`.
//   - `statusChanged` (bool) — true iff `effectiveStatus !== doc.status`, i.e. the
//     caller should persist this transition.
//   - `isReminderWindow` (bool) — true iff `now` falls within the read-time
//     reminder window before `plannedStartAt` for a still-PLANNED date.
//
// Deliberately does nothing for CHECKED_IN/COMPLETED/CANCELLED dates — once a user
// has checked in or manually closed out a plan, there's nothing left to compute.
function computeSafeDateStatus(doc, now = new Date()) {
  if (!doc || doc.status !== 'PLANNED') {
    return {
      effectiveStatus: doc?.status ?? 'PLANNED',
      statusChanged: false,
      isOverdue: doc?.status === 'MISSED_CHECKIN',
      isReminderWindow: false,
    };
  }

  const plannedStartAt = new Date(doc.plannedStartAt);
  const plannedEndAt = new Date(doc.plannedEndAt);

  const reminderWindowStart = new Date(plannedStartAt.getTime() - REMINDER_WINDOW_MINUTES * MINUTE_MS);
  const isReminderWindow = now >= reminderWindowStart && now < plannedStartAt;

  const checkinDeadline = new Date(plannedStartAt.getTime() + CHECKIN_GRACE_MINUTES * MINUTE_MS);
  const missedDeadline = new Date(plannedEndAt.getTime() + MISSED_CHECKIN_GRACE_MINUTES * MINUTE_MS);

  const pastMissedDeadline = now > missedDeadline;
  const isOverdue = now > checkinDeadline; // includes the pastMissedDeadline case

  return {
    effectiveStatus: pastMissedDeadline ? 'MISSED_CHECKIN' : 'PLANNED',
    statusChanged: pastMissedDeadline,
    isOverdue,
    isReminderWindow,
  };
}

// DB-touching wrapper used by backend/routes/safeDates.js. Takes a loaded SafeDate
// Mongoose document, computes its current state, and:
//   - persists a PLANNED -> MISSED_CHECKIN transition if the computation calls for
//     one (a plain `status` write, nothing else on the document is touched);
//   - creates a single in-app reminder Notification (reusing
//     backend/utils/notificationUtils.js#createNotification(), same as every other
//     notification trigger in this codebase) the first time a read happens to land
//     inside the reminder window — gated by `reminderNotifiedAt` so it only ever
//     fires once per plan. **This is the read-time-only reminder documented in
//     MOCK_FEATURES.md — it only fires if/when the owner (or anything else with
//     their token) happens to call a GET route while inside the window; there is no
//     scheduler making sure that happens close to `plannedStartAt`.**
// Returns `{ isOverdue, isReminderWindow }` for the route to fold into its JSON
// response — the document itself is mutated/saved in place.
async function applySafeDateComputation(safeDateDoc, { io } = {}) {
  const now = new Date();
  const { effectiveStatus, statusChanged, isOverdue, isReminderWindow } = computeSafeDateStatus(
    safeDateDoc,
    now
  );

  if (statusChanged) {
    safeDateDoc.status = effectiveStatus;
    await safeDateDoc.save();
  }

  if (isReminderWindow && !safeDateDoc.reminderNotifiedAt) {
    try {
      // 'safety' — a non-user-toggleable notification type (see
      // backend/constants/notificationOptions.js#PREFERENCE_FIELD_BY_TYPE) —
      // matches the product intent that a safety reminder should never be
      // silence-able the way a 'like'/'message' notification can be.
      await createNotification({
        recipientId: safeDateDoc.user,
        type: 'safety',
        payload: {
          kind: 'safe_date_reminder',
          safeDateId: String(safeDateDoc._id),
          location: safeDateDoc.location,
          plannedStartAt: safeDateDoc.plannedStartAt,
        },
        io,
      });
      safeDateDoc.reminderNotifiedAt = now;
      await safeDateDoc.save();
    } catch (err) {
      // Same isolation pattern already used at every other notification trigger
      // point (backend/routes/discovery.js, backend/routes/matches.js) — a
      // notification hiccup must never turn an otherwise-successful GET into a 500.
      console.error('Safe Date reminder notification error:', err);
    }
  }

  return { isOverdue, isReminderWindow };
}

function toSafeDateJSON(doc, { isOverdue, isReminderWindow } = {}) {
  return {
    id: doc._id,
    userId: doc.user,
    matchId: doc.match,
    location: doc.location,
    plannedStartAt: doc.plannedStartAt,
    plannedEndAt: doc.plannedEndAt,
    trustedContactName: doc.trustedContactName,
    trustedContactPhone: doc.trustedContactPhone,
    status: doc.status,
    checkedInAt: doc.checkedInAt,
    completedAt: doc.completedAt,
    cancelledAt: doc.cancelledAt,
    // Both derived at read-time — see this file's header comment.
    isOverdue: !!isOverdue,
    isReminderWindow: !!isReminderWindow,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { computeSafeDateStatus, applySafeDateComputation, toSafeDateJSON };
