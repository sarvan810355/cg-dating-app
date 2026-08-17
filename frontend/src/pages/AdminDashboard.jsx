import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import AdminNav from '../components/AdminNav';

// Basic admin dashboard (Task #11 in the internal TaskList; = docs/
// ROADMAP.md's Phase 9) — a simple stat grid from GET /api/admin/dashboard.
// Deliberately not a full analytics engine (charts/trends/cohorts) — that's
// the future Task #13/Phase 12 "advanced analytics dashboard" (see TODO.md's
// V3 section); this is just enough for a moderator/admin to get a quick
// sense of scale and what needs attention right now.
const STAT_ROWS = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'mobileVerifiedUsers', label: 'Mobile-verified users' },
  { key: 'photoVerifiedUsers', label: 'Photo-verified users' },
  { key: 'totalMatches', label: 'Active matches' },
  { key: 'totalMessages', label: 'Messages sent' },
  { key: 'pendingReports', label: 'Pending reports', accent: 'warning', linkTo: '/admin/reports' },
  {
    key: 'pendingPhotoVerifications',
    label: 'Pending photo verifications',
    accent: 'warning',
    linkTo: '/admin/verifications',
  },
];

function StatCard({ label, value, accent, linkTo }) {
  const valueClass = accent === 'warning' && value > 0 ? 'text-warning' : 'text-text-primary';
  const card = (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${valueClass}`}>{value ?? '—'}</p>
    </div>
  );
  if (linkTo && value > 0) {
    return (
      <Link to={linkTo} className="block transition hover:opacity-80">
        {card}
      </Link>
    );
  }
  return card;
}

function AdminDashboard() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getAdminDashboard()
      .then((data) => {
        if (!cancelled) setCounts(data.counts);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the admin dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
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

        {!loading && counts && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STAT_ROWS.map((row) => (
              <StatCard
                key={row.key}
                label={row.label}
                value={counts[row.key]}
                accent={row.accent}
                linkTo={row.linkTo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
