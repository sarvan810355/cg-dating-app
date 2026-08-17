import { useState } from 'react';
import * as api from '../api';
import Button from './Button';
import TextField from './TextField';
import { REPORT_REASONS } from '../constants/safetyOptions';

// Report flow (Task #10, see docs/ROADMAP.md's Phase 8) — reason dropdown +
// optional details, submits to POST /api/reports. Reused from both
// Discovery.jsx (report a profile card) and Chat.jsx (report the other
// person in a match) via components/SafetyMenu.jsx, so this component only
// needs to know *who* is being reported, not where it was opened from.
// Follows the same centered-overlay Modal pattern as MatchModal.jsx (see
// docs/DESIGN_SYSTEM.md's Modal/Dialog component entries).
function ReportModal({ open, userId, userName, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  // Resets local form state so the next time this modal opens (a different
  // report, or the same one retried) it doesn't show the previous attempt's
  // values/confirmation.
  function handleClose() {
    setReason('');
    setDetails('');
    setError('');
    setSubmitted(false);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason) {
      setError('Please choose a reason');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.reportUser(userId, reason, details.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not submit your report — try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-lg">
        {submitted ? (
          <div className="text-center">
            <p className="mb-2 text-lg font-semibold text-text-primary">Report submitted</p>
            <p className="mb-6 text-sm text-text-secondary">
              Thanks for letting us know — you don&rsquo;t need to do anything else. Your report is
              confidential and {userName || 'this person'} won&rsquo;t be notified. If you&rsquo;re
              ever in immediate danger, please also block this person and contact local
              authorities.
            </p>
            <Button className="w-full" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="mb-1 text-lg font-semibold text-text-primary">
              Report {userName || 'this user'}
            </h2>
            <p className="mb-4 text-xs text-text-secondary">
              Your report is confidential — {userName || 'this person'} won&rsquo;t be notified.
            </p>

            {error && (
              <p className="mb-3 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">
                {error}
              </p>
            )}

            <TextField
              as="select"
              id="report-reason"
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              options={[{ value: '', label: 'Choose a reason' }, ...REPORT_REASONS]}
              containerClassName="mb-4"
              required
            />

            <TextField
              as="textarea"
              id="report-details"
              label="Additional details (optional)"
              placeholder="Anything else we should know?"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              maxLength={1000}
              containerClassName="mb-5"
            />

            <div className="space-y-2">
              <Button type="submit" className="w-full" loading={submitting}>
                Submit report
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportModal;
