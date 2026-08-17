// Mirrors backend/constants/safetyOptions.js's REPORT_REASONS. Kept as a
// separate copy since frontend and backend are independent npm packages —
// update both together if this list changes. Only the report-reason enum is
// mirrored here (the frontend never needs REPORT_STATUSES/evidence limits —
// those are server-side moderation/validation concerns, see Task #11's
// future Admin panel for where REPORT_STATUSES actually gets used).
export const REPORT_REASONS = [
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'hate_abuse', label: 'Hate speech or abuse' },
  { value: 'threats', label: 'Threats or violence' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
];
