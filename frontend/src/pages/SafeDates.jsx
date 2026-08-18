import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';

// "My Safe Dates" (Task #18 — Safe Date mode, V2, see docs/ROADMAP.md's Phase 12).
// Lists the caller's own plans, past + upcoming, with Check-In / Complete / Cancel
// actions and an overdue banner. `isOverdue`/`status` are recomputed by the backend
// on every load (read-time computation — see backend/utils/safeDateUtils.js and
// MOCK_FEATURES.md's Safe Date entry) — this screen never computes overdue-ness
// itself, it only renders whatever the API returns.

const STATUS_COPY = {
  PLANNED: { label: 'Planned', tone: 'text-primary' },
  CHECKED_IN: { label: 'Checked in', tone: 'text-success' },
  COMPLETED: { label: 'Completed', tone: 'text-text-secondary' },
  MISSED_CHECKIN: { label: 'Missed check-in', tone: 'text-error' },
  CANCELLED: { label: 'Cancelled', tone: 'text-text-secondary' },
};

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SafeDateCard({ plan, onAction, actingId }) {
  const copy = STATUS_COPY[plan.status] || STATUS_COPY.PLANNED;
  const acting = actingId === plan.id;
  const canCheckIn = plan.status === 'PLANNED' || plan.status === 'MISSED_CHECKIN';
  const canComplete = ['PLANNED', 'CHECKED_IN', 'MISSED_CHECKIN'].includes(plan.status);
  const canCancel = canComplete;

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      {plan.isOverdue && (plan.status === 'PLANNED' || plan.status === 'MISSED_CHECKIN') && (
        <div className="mb-3 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">
          {plan.status === 'MISSED_CHECKIN'
            ? "You didn't check in for this date — if you're safe, mark it as checked in or completed."
            : "You're overdue to check in for this date."}
        </div>
      )}
      {plan.isReminderWindow && plan.status === 'PLANNED' && (
        <div className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          Starting soon — {formatDateTime(plan.plannedStartAt)}.
        </div>
      )}

      <div className="mb-1 flex items-center justify-between">
        <p className="font-medium text-text-primary">{plan.location}</p>
        <span className={`text-xs font-semibold ${copy.tone}`}>{copy.label}</span>
      </div>
      <p className="text-xs text-text-secondary">
        {formatDateTime(plan.plannedStartAt)} – {formatDateTime(plan.plannedEndAt)}
      </p>
      {plan.trustedContactName && (
        <p className="mt-1 text-xs text-text-secondary">Trusted contact: {plan.trustedContactName}</p>
      )}

      {(canCheckIn || canComplete || canCancel) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canCheckIn && (
            <Button
              variant="secondary"
              disabled={acting}
              onClick={() => onAction(plan.id, 'check-in')}
            >
              Check in
            </Button>
          )}
          {canComplete && (
            <Button
              variant="secondary"
              disabled={acting}
              onClick={() => onAction(plan.id, 'complete')}
            >
              Mark completed
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              disabled={acting}
              onClick={() => onAction(plan.id, 'cancel')}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function SafeDates() {
  const [safeDates, setSafeDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return api
      .getSafeDates({ limit: 50 })
      .then((data) => setSafeDates(data.safeDates || []))
      .catch((err) => setError(err.message || 'Could not load your Safe Date plans'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function handleAction(id, action) {
    setActingId(id);
    setError('');
    try {
      const fn = action === 'check-in' ? api.checkInSafeDate : action === 'complete' ? api.completeSafeDate : api.cancelSafeDate;
      const data = await fn(id);
      setSafeDates((prev) => prev.map((p) => (p.id === id ? data.safeDate : p)));
    } catch (err) {
      setError(err.message || 'Could not update this plan — try again');
    } finally {
      setActingId(null);
    }
  }

  const upcoming = safeDates.filter((p) => ['PLANNED', 'CHECKED_IN', 'MISSED_CHECKIN'].includes(p.status));
  const past = safeDates.filter((p) => ['COMPLETED', 'CANCELLED'].includes(p.status));

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">My Safe Dates</h1>
          <Link to="/settings" className="text-sm text-text-secondary hover:underline">
            Settings
          </Link>
        </div>

        <Link to="/safe-dates/new">
          <Button className="mb-6 w-full">Plan a new Safe Date</Button>
        </Link>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading your plans…</p>}

        {!loading && safeDates.length === 0 && !error && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-2 text-lg font-semibold text-text-primary">No Safe Date plans yet</p>
            <p className="text-sm text-text-secondary">
              Meeting a match in person? Plan it here first — a public place, a rough time
              window, and an optional trusted contact.
            </p>
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <>
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">Upcoming</h2>
            <ul className="mb-6 space-y-3">
              {upcoming.map((plan) => (
                <SafeDateCard key={plan.id} plan={plan} onAction={handleAction} actingId={actingId} />
              ))}
            </ul>
          </>
        )}

        {!loading && past.length > 0 && (
          <>
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">Past</h2>
            <ul className="space-y-3">
              {past.map((plan) => (
                <SafeDateCard key={plan.id} plan={plan} onAction={handleAction} actingId={actingId} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default SafeDates;
