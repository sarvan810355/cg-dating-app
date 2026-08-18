import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

// Task #11 — Admin panel (see docs/ROADMAP.md's Phase 9): mirrors
// frontend/src/components/AdminRoute.jsx's role list. Kept as a small local
// copy for the same reason AdminRoute.jsx does — this is only ever a "should
// this link even render" check, never the actual access boundary (every
// /api/admin/* route re-checks role server-side regardless).
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

// Minimal Settings screen (Task #6, see docs/ROADMAP.md Phase 6) — didn't
// exist before this pass, created just large enough to hold notification
// preferences per the task spec ("create a minimal Settings page if one
// doesn't exist yet ... keep it small"). Other account settings can be added
// here later as they land (Verification, Safety, Subscription, ...).
const PREFERENCE_ROWS = [
  {
    field: 'matchNotifications',
    label: 'Matches',
    description: 'Notify me when I get a new mutual match',
  },
  {
    field: 'likeNotifications',
    label: 'Likes',
    description: 'Notify me when someone likes my profile',
  },
  {
    field: 'messageNotifications',
    label: 'Messages',
    description: 'Notify me when I receive a new chat message',
  },
];

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Task #12 — Subscription scaffolding: "Free" vs active-plan-name+expiry
// status, reachable from Settings per the task spec, with a Cancel button
// when subscribed. The fuller plan comparison/upgrade flow lives on the
// dedicated /subscription page (frontend/src/pages/Subscription.jsx) — this
// is just a status summary + entry point.
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function MembershipSection() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getMySubscription()
      .then((data) => {
        if (!cancelled) setSubscription(data.subscription || null);
      })
      .catch(() => {
        if (!cancelled) setSubscription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCancel() {
    setCancelling(true);
    setError('');
    try {
      const data = await api.cancelSubscription();
      setSubscription(data.subscription);
    } catch (err) {
      setError(err.message || 'Could not cancel your subscription — try again');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-lg font-semibold text-text-primary">Membership</h2>
      {loading && <p className="py-2 text-sm text-text-secondary">Loading…</p>}
      {!loading && (
        <>
          {error && <p className="mb-2 text-xs text-error">{error}</p>}
          {subscription && subscription.status === 'ACTIVE' ? (
            <>
              <p className="text-sm text-text-primary">
                {subscription.plan?.name}{' '}
                <span className="text-xs text-text-secondary">
                  · renews {formatDate(subscription.expiresAt)}
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <Link to="/subscription">
                  <Button variant="ghost">Manage plan</Button>
                </Link>
                <Button variant="destructive" disabled={cancelling} onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : subscription && subscription.status === 'CANCELLED' ? (
            <>
              <p className="text-sm text-text-primary">
                {subscription.plan?.name}{' '}
                <span className="text-xs text-text-secondary">
                  · cancelled, access until {formatDate(subscription.expiresAt)}
                </span>
              </p>
              <Link to="/subscription">
                <Button variant="ghost" className="mt-3">
                  View plans
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-text-primary">Free</p>
              <Link to="/subscription">
                <Button variant="primary" className="mt-3">
                  Upgrade
                </Button>
              </Link>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Settings() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // field currently being saved
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getNotificationPreferences()
      .then((data) => {
        if (!cancelled) setPreferences(data.preferences);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your notification settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(field, value) {
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [field]: value }));
    setSaving(field);
    setError('');
    try {
      const data = await api.updateNotificationPreferences({ [field]: value });
      setPreferences(data.preferences);
    } catch (err) {
      setPreferences(previous); // revert on failure
      setError(err.message || 'Could not save that setting — try again');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Home
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        <MembershipSection />

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-lg font-semibold text-text-primary">Notifications</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Choose which in-app notifications you want to receive.
          </p>

          {loading && <p className="py-6 text-center text-sm text-text-secondary">Loading…</p>}

          {!loading && preferences && (
            <ul className="space-y-4">
              {PREFERENCE_ROWS.map((row) => (
                <li key={row.field} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.label}</p>
                    <p className="text-xs text-text-secondary">{row.description}</p>
                  </div>
                  <Toggle
                    checked={!!preferences[row.field]}
                    disabled={saving === row.field}
                    label={row.label}
                    onChange={(value) => handleToggle(row.field, value)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link to="/verification">
          <Button variant="ghost" className="mt-4 w-full">
            Verification
          </Button>
        </Link>

        {/* Task #10 (Safety — Report/Block + Safety Center, see
            docs/ROADMAP.md's Phase 8). */}
        <Link to="/safety-center">
          <Button variant="ghost" className="mt-2 w-full">
            Safety Center
          </Button>
        </Link>

        <Link to="/settings/blocked-users">
          <Button variant="ghost" className="mt-2 w-full">
            Blocked Users
          </Button>
        </Link>

        {/* Task #17 — Referral program ("Invite & Earn", V2 scope, see
            docs/BUSINESS_PLAN.md's Growth Strategy). */}
        <Link to="/referrals">
          <Button variant="ghost" className="mt-2 w-full">
            Invite &amp; Earn
          </Button>
        </Link>

        {/* Task #18 — Safe Date mode + Date Planner (V2 scope, see
            docs/ROADMAP.md's Phase 12). */}
        <Link to="/safe-dates">
          <Button variant="ghost" className="mt-2 w-full">
            My Safe Dates
          </Button>
        </Link>
        <Link to="/date-ideas">
          <Button variant="ghost" className="mt-2 w-full">
            Date Ideas
          </Button>
        </Link>

        {/* Task #11 — Admin panel (see docs/ROADMAP.md's Phase 9). Only
            rendered for ADMIN/SUPER_ADMIN/MODERATOR — per the task spec, this
            link (and the /admin section it points to) must be effectively
            invisible to a regular user, not just blocked server-side if they
            somehow guessed the URL (which the AdminRoute guard also
            handles — see frontend/src/components/AdminRoute.jsx). */}
        {isAdmin && (
          <Link to="/admin">
            <Button variant="ghost" className="mt-2 w-full">
              Admin
            </Button>
          </Link>
        )}

        <Link to="/dashboard">
          <Button variant="ghost" className="mt-2 w-full">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default Settings;
