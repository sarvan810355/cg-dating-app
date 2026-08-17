import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';

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

function Settings() {
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
