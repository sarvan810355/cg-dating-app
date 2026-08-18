import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import TextField from '../components/TextField';

// "Plan a Safe Date" — Task #18 (Safe Date mode, V2, see docs/ROADMAP.md's Phase 12).
// Reachable from the Chat screen ("Plan a Safe Date" in the header, carrying
// `?matchId=`, see frontend/src/pages/Chat.jsx) or standalone from
// frontend/src/pages/SafeDates.jsx's "New plan" button (no matchId in that case —
// this feature is meant for meeting a match, but the match reference is optional,
// see backend/models/SafeDate.js).
//
// **Privacy note (shown to the user, not just documented in code):** the location
// field is an approximate public meeting place the user types themselves — this
// screen never reads or stores the device's real-time location.
function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStart() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow, same time
  return toLocalDateTimeInputValue(d);
}

function defaultEnd() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000); // +2h
  return toLocalDateTimeInputValue(d);
}

function PlanSafeDate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';

  const [location, setLocation] = useState('');
  const [plannedStartAt, setPlannedStartAt] = useState(defaultStart);
  const [plannedEndAt, setPlannedEndAt] = useState(defaultEnd);
  const [trustedContactName, setTrustedContactName] = useState('');
  const [trustedContactPhone, setTrustedContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!location.trim()) {
      setError('Add an approximate public location — not an exact address.');
      return;
    }

    setSaving(true);
    try {
      await api.createSafeDate({
        matchId: matchId || undefined,
        location: location.trim(),
        plannedStartAt: new Date(plannedStartAt).toISOString(),
        plannedEndAt: new Date(plannedEndAt).toISOString(),
        trustedContactName: trustedContactName.trim() || undefined,
        trustedContactPhone: trustedContactPhone.trim() || undefined,
      });
      navigate('/safe-dates');
    } catch (err) {
      setError(err.message || 'Could not save this plan — try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Plan a Safe Date</h1>
          <Link to="/safe-dates" className="text-sm text-text-secondary hover:underline">
            My plans
          </Link>
        </div>

        <div className="mb-5 rounded-2xl border border-border bg-primary-subtle p-4">
          <p className="text-sm text-text-primary">
            Meeting someone in person? Share the plan here — a public place, a rough time
            window, and (optionally) a trusted contact who knows where you'll be.
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            We never track your exact location — just what you type below. Choose a busy,
            public place, never anywhere isolated or private.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            id="location"
            label="Meeting place"
            placeholder="e.g. Marine Drive area, VIP Road, Raipur"
            helperText="An approximate public place — not an exact address."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id="plannedStartAt"
              type="datetime-local"
              label="Starts"
              value={plannedStartAt}
              onChange={(e) => setPlannedStartAt(e.target.value)}
              required
            />
            <TextField
              id="plannedEndAt"
              type="datetime-local"
              label="Ends (approx.)"
              value={plannedEndAt}
              onChange={(e) => setPlannedEndAt(e.target.value)}
              required
            />
          </div>

          <TextField
            id="trustedContactName"
            label="Trusted contact (optional)"
            placeholder="e.g. Priya (friend)"
            value={trustedContactName}
            onChange={(e) => setTrustedContactName(e.target.value)}
          />
          <TextField
            id="trustedContactPhone"
            label="Trusted contact's phone (optional)"
            placeholder="e.g. +91 98765 43210"
            helperText="Saved for your own reference only — we don't message or call them."
            value={trustedContactPhone}
            onChange={(e) => setTrustedContactPhone(e.target.value)}
          />

          <Link to={`/date-ideas${matchId ? `?matchId=${matchId}` : ''}`} className="block text-sm text-primary hover:underline">
            Need date ideas?
          </Link>

          <Button type="submit" loading={saving} className="w-full">
            Save plan
          </Button>
        </form>
      </div>
    </div>
  );
}

export default PlanSafeDate;
