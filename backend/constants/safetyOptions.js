// Shared enums / config for Safety (Report/Block) — Task #10 in the internal
// TaskList (= docs/ROADMAP.md's Phase 8). Kept in one place so the
// Report/Block models, backend/routes/reports.js, backend/routes/blocks.js,
// and (indirectly, via the API) the frontend all agree on the same values —
// same convention as backend/constants/verificationOptions.js /
// discoveryOptions.js.

// Report reasons — matches the product spec exactly (see the Task #10 launch
// spec / docs/DATABASE_SCHEMA.md's `reports` entity).
const REPORT_REASONS = [
  'fake_profile',
  'harassment',
  'spam',
  'scam',
  'inappropriate_content',
  'hate_abuse',
  'threats',
  'impersonation',
  'other',
];

// A report's moderation lifecycle. Every report is created PENDING; the
// other three states are only ever set by the future Admin moderation queue
// (Task #11, see docs/ROADMAP.md's Phase 9 / docs/API_DOCUMENTATION.md's
// `PUT /api/admin/reports/:id`) — no code path in this pass transitions a
// report away from PENDING.
const REPORT_STATUSES = ['PENDING', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED'];

// `details` is free text (optional) — capped generously, same spirit as
// Profile.bio's 500-char cap but a bit larger since a report may need more
// room to explain what happened.
const REPORT_DETAILS_MAX_LENGTH = 1000;

// `evidence` is an optional array of photo/message-reference URLs — see the
// MOCK_FEATURES.md note: this is plain strings (a URL or a short free-text
// reference), not a file-upload path. Capped so a single report can't grow
// unbounded.
const MAX_EVIDENCE_ITEMS = 10;
const EVIDENCE_ITEM_MAX_LENGTH = 2000;

module.exports = {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_DETAILS_MAX_LENGTH,
  MAX_EVIDENCE_ITEMS,
  EVIDENCE_ITEM_MAX_LENGTH,
};
