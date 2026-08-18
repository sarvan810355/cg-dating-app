const mongoose = require('mongoose');
const {
  SAFE_DATE_STATUSES,
  LOCATION_MAX_LENGTH,
  TRUSTED_CONTACT_NAME_MAX_LENGTH,
  TRUSTED_CONTACT_PHONE_MAX_LENGTH,
} = require('../constants/safeDateOptions');

// Safe Date mode (Task #18 — V2, see docs/ROADMAP.md's Phase 12 "Growth & Engagement
// Features"). A user's own plan to meet someone (usually a match) in person, with a
// public-location note and an optional trusted contact — see
// docs/DATABASE_SCHEMA.md's `safe_dates` section for the full field-by-field
// divergence writeup against the original draft.
//
// **Privacy requirement (explicit product-spec rule, not a simplification):** this
// model deliberately stores `location` as free text describing an "approximate public
// location" — never exact GPS coordinates, and never silently tracked. There is no
// device-location field anywhere on this schema; the location is exactly what the
// user typed when they created the plan, and nothing about this feature reads the
// device's real-time position at all.
//
// **No real trusted-contact alerting.** `trustedContactPhone` is stored (so the UI can
// display "who would be contacted") but is NEVER actually used to send an SMS/call —
// there is no SMS provider configured in this project (same MOCK/DEV-ONLY delivery
// gap already true of mobile-OTP verification, see MOCK_FEATURES.md). "Missed
// check-in" is a read-time status computation only, not a real alert to anyone — see
// backend/utils/safeDateUtils.js and MOCK_FEATURES.md's Safe Date entry for the full
// explanation of why, and what a real implementation would need (a job queue + a real
// SMS provider, neither of which exist in this project yet).
const SafeDateSchema = new mongoose.Schema(
  {
    // The user who planned this date — always the authenticated caller at creation
    // time, never taken from client input (same convention as Report.reporter,
    // Block.blocker).
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Optional — this feature is meant for meeting a match, but a match reference
    // isn't required so a plan can still be created for a date arranged outside the
    // app (e.g. someone met before joining, or the match was later unmatched/deleted
    // — the SafeDate plan itself should still survive either way).
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
    // Free-text "approximate public location" — e.g. "Marine Drive area, VIP Road,
    // Raipur" or "Coffee shop near City Center Mall, Bhilai". NEVER exact GPS
    // coordinates — see the model-level comment above. Required: a Safe Date plan
    // without any location note defeats the point of the feature.
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: LOCATION_MAX_LENGTH,
    },
    plannedStartAt: {
      type: Date,
      required: true,
    },
    plannedEndAt: {
      type: Date,
      required: true,
    },
    trustedContactName: {
      type: String,
      trim: true,
      maxlength: TRUSTED_CONTACT_NAME_MAX_LENGTH,
      default: null,
    },
    // Stored but NEVER actually SMS'd/called — see the model-level comment above.
    trustedContactPhone: {
      type: String,
      trim: true,
      maxlength: TRUSTED_CONTACT_PHONE_MAX_LENGTH,
      default: null,
    },
    status: {
      type: String,
      enum: SAFE_DATE_STATUSES,
      default: 'PLANNED',
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    // Set once a pre-date reminder Notification has been created for this plan, so
    // the read-time computation (GET /api/safe-dates*, see
    // backend/utils/safeDateUtils.js) never creates a duplicate — the reminder is
    // only ever triggered by an actual client request landing inside the reminder
    // window, not a scheduled job, so this flag is what makes that "at most once"
    // rather than "once per GET call while inside the window". See
    // MOCK_FEATURES.md's Safe Date entry.
    reminderNotifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The actual "my safe dates, upcoming + past" access pattern
// (GET /api/safe-dates) — newest planned-start first.
SafeDateSchema.index({ user: 1, plannedStartAt: -1 });

module.exports = mongoose.model('SafeDate', SafeDateSchema);
