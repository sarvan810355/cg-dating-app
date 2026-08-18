import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { DATING_INTENTIONS } from '../constants/profileOptions';
import {
  DEFAULT_MAX_DISTANCE_KM,
  MAX_DISTANCE_KM_CAP,
  DEFAULT_MIN_AGE_PREF,
  DEFAULT_MAX_AGE_PREF,
  MAX_AGE_PREF_CAP,
} from '../constants/discoveryOptions';

// Task #14 — Discovery Preferences (V2, user-requested: "location
// preference ... jaise other dating apps kaam karte hain"). A small
// dedicated page (linked from Settings, per the task spec) rather than
// folding this into Settings.jsx directly — this has enough of its own
// state (sliders, a checkbox group, two toggles) to be worth its own
// screen, same reasoning already applied to Verification/SafetyCenter/
// Referrals as separate pages off Settings. Wired to the existing
// PUT /api/profile/me partial-merge pattern via
// frontend/src/api.js#updateMatchPreferences()/updatePrivacySettings() — no
// new backend endpoint.
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

function DiscoveryPreferences() {
  const navigate = useNavigate();
  const [maxDistanceKm, setMaxDistanceKm] = useState(DEFAULT_MAX_DISTANCE_KM);
  const [minAge, setMinAge] = useState(DEFAULT_MIN_AGE_PREF);
  const [maxAge, setMaxAge] = useState(DEFAULT_MAX_AGE_PREF);
  const [datingIntentions, setDatingIntentions] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [locationStatus, setLocationStatus] = useState(null); // { source, lat, lng } | null
  const [locationBusy, setLocationBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getMyProfile()
      .then((data) => {
        if (cancelled) return;
        const p = data.profile;
        setMaxDistanceKm(p.preferences?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM);
        setMinAge(p.preferences?.minAge ?? DEFAULT_MIN_AGE_PREF);
        setMaxAge(p.preferences?.maxAge ?? DEFAULT_MAX_AGE_PREF);
        setDatingIntentions(p.preferences?.datingIntentions || []);
        setVerifiedOnly(!!p.preferences?.verifiedOnly);
        setIncognito(!!p.privacySettings?.incognito);
        setLocationStatus(p.location ? { source: p.locationSource, ...p.location } : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your preferences');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleIntention(value) {
    setDatingIntentions((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const min = Number(minAge);
    const max = Number(maxAge);
    if (!Number.isInteger(min) || min < DEFAULT_MIN_AGE_PREF) {
      setError(`Minimum age must be a whole number ${DEFAULT_MIN_AGE_PREF} or older`);
      return;
    }
    if (!Number.isInteger(max) || max < min) {
      setError('Maximum age must be greater than or equal to minimum age');
      return;
    }

    setSaving(true);
    try {
      const data = await api.updateMatchPreferences({
        maxDistanceKm: Number(maxDistanceKm),
        minAge: min,
        maxAge: max,
        datingIntentions,
        verifiedOnly,
      });
      const p = data.profile;
      setMaxDistanceKm(p.preferences?.maxDistanceKm ?? maxDistanceKm);
      setMinAge(p.preferences?.minAge ?? min);
      setMaxAge(p.preferences?.maxAge ?? max);
      setSuccess('Preferences saved');
    } catch (err) {
      setError(err.message || 'Could not save your preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleIncognitoToggle(value) {
    const previous = incognito;
    setIncognito(value);
    setError('');
    try {
      await api.updatePrivacySettings({ incognito: value });
    } catch (err) {
      setIncognito(previous);
      setError(err.message || 'Could not update incognito mode');
    }
  }

  function handleUseCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Location access is not available in this browser — enter your city/district instead.');
      return;
    }
    setLocationBusy(true);
    // Explicit user-initiated request — the browser itself shows the
    // permission prompt; nothing here reads location silently or in the
    // background. A manual city/district fallback is always available on
    // the profile builder regardless of this succeeding or failing.
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await api.updateProfileLocation(latitude, longitude);
          setLocationStatus(data.profile.location ? { source: data.profile.locationSource, ...data.profile.location } : null);
          setSuccess('Location updated');
        } catch (err) {
          setError(err.message || 'Could not save your location');
        } finally {
          setLocationBusy(false);
        }
      },
      (geoErr) => {
        setLocationBusy(false);
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? 'Location permission denied — your city/district (set in your profile) will be used as an approximate location instead.'
            : 'Could not determine your location — try again, or rely on your profile city/district.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Discovery Preferences</h1>
          <Link to="/settings" className="text-sm text-text-secondary hover:underline">
            Settings
          </Link>
        </div>
        <p className="mb-6 text-sm text-text-secondary">
          Control who shows up in your Discover feed — distance, age range, what you&rsquo;re
          looking for, and whether others can see you at all.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}
        {success && (
          <p className="mb-4 rounded-lg bg-success-subtle px-3 py-2 text-sm text-success">
            {success}
          </p>
        )}

        {/* Location */}
        <section className="mb-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-lg font-semibold text-text-primary">Your location</h2>
          <p className="mb-3 text-xs text-text-secondary">
            {locationStatus?.source === 'device' &&
              'Using your device’s current location (most accurate).'}
            {locationStatus?.source === 'approximate_city' &&
              'Using an approximate location based on your profile’s city/district. For a more accurate distance match, share your device location.'}
            {!locationStatus &&
              'No location set yet — add a city/district on your profile, or share your device location below.'}
          </p>
          <Button variant="secondary" loading={locationBusy} onClick={handleUseCurrentLocation}>
            📍 Use my current location
          </Button>
        </section>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Distance */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-text-primary">Maximum distance</span>
              <span className="font-semibold text-primary">{maxDistanceKm} km</span>
            </div>
            <input
              type="range"
              min={1}
              max={MAX_DISTANCE_KM_CAP}
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="mt-2 text-xs text-text-secondary">
              Profiles without any location information are still shown — this only filters
              profiles whose distance from you is known.
            </p>
          </section>

          {/* Age range */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium text-text-primary">Age range</span>
              <span className="font-semibold text-primary">
                {minAge} &ndash; {maxAge}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Min age"
                type="number"
                min={DEFAULT_MIN_AGE_PREF}
                max={MAX_AGE_PREF_CAP}
                value={minAge}
                onChange={(e) => setMinAge(Number(e.target.value))}
              />
              <TextField
                label="Max age"
                type="number"
                min={DEFAULT_MIN_AGE_PREF}
                max={MAX_AGE_PREF_CAP}
                value={maxAge}
                onChange={(e) => setMaxAge(Number(e.target.value))}
              />
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Minimum age can never be below {DEFAULT_MIN_AGE_PREF} — CG Dating is 18+ only.
            </p>
          </section>

          {/* Dating intention */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-medium text-text-primary">
              Show me people looking for…
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {DATING_INTENTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    datingIntentions.includes(opt.value)
                      ? 'border-primary bg-primary-subtle text-primary'
                      : 'border-border bg-surface text-text-primary hover:bg-primary-subtle'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={datingIntentions.includes(opt.value)}
                    onChange={() => toggleIntention(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Leave all unchecked to see any dating intention.
            </p>
          </section>

          {/* Verified only */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Verified profiles only</p>
                <p className="text-xs text-text-secondary">
                  Only show people with a verified photo
                </p>
              </div>
              <Toggle
                checked={verifiedOnly}
                label="Verified profiles only"
                onChange={setVerifiedOnly}
              />
            </div>
          </section>

          <Button type="submit" loading={saving} className="w-full">
            Save preferences
          </Button>
        </form>

        {/* Incognito — saved immediately (not part of the form above) since
            it's a safety-adjacent toggle, same "save on change" pattern
            already used for notification preferences on Settings.jsx. */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Incognito browsing</p>
              <p className="text-xs text-text-secondary">
                Hide your profile from everyone else&rsquo;s Discover feed. You can still browse
                and swipe on others as usual.
              </p>
            </div>
            <Toggle checked={incognito} label="Incognito browsing" onChange={handleIncognitoToggle} />
          </div>
        </section>

        <Button variant="ghost" className="mt-4 w-full" onClick={() => navigate('/settings')}>
          Back to Settings
        </Button>
      </div>
    </div>
  );
}

export default DiscoveryPreferences;
