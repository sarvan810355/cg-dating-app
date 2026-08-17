import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import AdminNav from '../components/AdminNav';
import Button from '../components/Button';
import { REPORT_REASONS } from '../constants/safetyOptions';

// Reports moderation queue (Task #11 in the internal TaskList; = docs/
// ROADMAP.md's Phase 9) — lists PENDING reports (GET /api/admin/reports) and
// lets an admin/moderator resolve one per row (PATCH /api/admin/reports/:id)
// with an optional note. Every report submitted via Task #10's
// POST /api/reports sits PENDING until acted on here — see MOCK_FEATURES.md/
// PROJECT_STATE.md's prior-pass notes for that gap.
const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

const ACTIONS = [
  { status: 'REVIEWED', label: 'Mark reviewed', variant: 'secondary' },
  { status: 'ACTION_TAKEN', label: 'Action taken', variant: 'destructive' },
  { status: 'DISMISSED', label: 'Dismiss', variant: 'ghost' },
];

function ReportRow({ report, onResolve, resolving }) {
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {REASON_LABEL[report.reason] || report.reason}
          </p>
          <p className="text-xs text-text-secondary">
            Reported {new Date(report.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-background px-3 py-2">
          <p className="font-medium text-text-secondary">Reporter</p>
          <p className="text-text-primary">
            {report.reporter.displayName || report.reporter.email || report.reporter.id}
          </p>
        </div>
        <div className="rounded-lg bg-background px-3 py-2">
          <p className="font-medium text-text-secondary">Reported user</p>
          <p className="text-text-primary">
            {report.reportedUser.displayName || report.reportedUser.email || report.reportedUser.id}
          </p>
        </div>
      </div>

      {report.details && (
        <p className="mb-3 whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm text-text-primary">
          {report.details}
        </p>
      )}

      {report.evidence?.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-text-secondary">
          {report.evidence.map((e, i) => (
            <li key={i} className="break-all">
              {e}
            </li>
          ))}
        </ul>
      )}

      {showNote && (
        <textarea
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          rows={2}
          placeholder="Optional review note (admin-only, never shown to users)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <Button
            key={a.status}
            variant={a.variant}
            loading={resolving === a.status}
            disabled={!!resolving}
            onClick={() => onResolve(report.id, a.status, note || undefined)}
          >
            {a.label}
          </Button>
        ))}
        <button
          type="button"
          className="text-xs text-text-secondary hover:underline"
          onClick={() => setShowNote((v) => !v)}
        >
          {showNote ? 'Hide note' : 'Add note'}
        </button>
      </div>
    </li>
  );
}

function AdminReports() {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);
  const [resolvingStatus, setResolvingStatus] = useState(null);

  function load() {
    setLoading(true);
    setError('');
    api
      .getAdminReports({ status: 'PENDING' })
      .then((data) => setReports(data.reports))
      .catch((err) => setError(err.message || 'Could not load the reports queue'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleResolve(id, status, reviewNotes) {
    setResolvingId(id);
    setResolvingStatus(status);
    setError('');
    try {
      await api.reviewAdminReport(id, { status, reviewNotes });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || 'Could not update this report — try again');
    } finally {
      setResolvingId(null);
      setResolvingStatus(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Exit admin
          </Link>
        </div>

        <AdminNav />

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && reports?.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-1 text-lg font-semibold text-text-primary">Queue is clear</p>
            <p className="text-sm text-text-secondary">No pending reports right now.</p>
          </div>
        )}

        {reports?.length > 0 && (
          <ul className="space-y-3">
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                resolving={resolvingId === r.id ? resolvingStatus : null}
                onResolve={handleResolve}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminReports;
