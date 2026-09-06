import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Avatar from '../components/Avatar';
import {
  GENDERS,
  INTERESTED_IN_OPTIONS,
  DATING_INTENTIONS,
  CG_DISTRICTS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  DIET_OPTIONS,
  PERSONALITY_PROMPTS,
  MAX_PHOTOS,
  MAX_INTERESTS,
  MAX_PROMPTS,
  BIO_MAX_LENGTH,
  INSTAGRAM_HANDLE_REGEX,
  normalizeInstagramHandle,
} from '../constants/profileOptions';

const EMPTY_FORM = {
  displayName: '',
  dateOfBirth: '',
  gender: '',
  interestedIn: [],
  datingIntention: '',
  city: '',
  district: '',
  profession: '',
  education: '',
  bio: '',
  interests: [],
  languages: [],
  lifestyle: { smoking: '', drinking: '', diet: '' },
  personalityPrompts: [],
  instagramHandle: '',
};

function toDateInputValue(dob) {
  if (!dob) return '';
  return new Date(dob).toISOString().slice(0, 10);
}

// Chip-style multi-value input shared by interests/languages sections.
function TagField({ label, values, onChange, placeholder, max, helperText }) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (values.includes(value)) {
      setDraft('');
      return;
    }
    if (max && values.length >= max) return;
    onChange([...values, value]);
    setDraft('');
  }

  function removeTag(value) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-primary">{label}</label>
      <div className="flex gap-2">
        <TextField
          containerClassName="flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="secondary" onClick={addTag}>
          Add
        </Button>
      </div>
      {helperText && <p className="mt-1 text-xs text-text-secondary">{helperText}</p>}
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary"
            >
              {v}
              <button
                type="button"
                onClick={() => removeTag(v)}
                aria-label={`Remove ${v}`}
                className="text-primary/70 hover:text-primary"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// One section per step — keeps the builder feeling like a short guided flow
// instead of one long form. Purely a presentation split: all steps write
// into the same `form` state and are saved via the same partial-merge
// PUT /api/profile/me, so navigating back and forth never loses data.
const STEPS = [
  { key: 'basic', title: 'The basics', subtitle: "Let's start with who you are" },
  { key: 'intention', title: "What are you looking for?", subtitle: 'Be upfront about your intentions' },
  { key: 'location', title: 'Where are you?', subtitle: 'Helps us find people near you' },
  { key: 'photos', title: 'Add your photos', subtitle: 'Profiles with photos get more matches' },
  { key: 'bio', title: 'Bio & interests', subtitle: 'Give people something to talk about' },
  { key: 'social', title: 'Social (optional)', subtitle: 'Link your Instagram if you like' },
  { key: 'prompts', title: 'Show your personality', subtitle: 'Answer a prompt or two' },
];

function ProfileBuilder() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState([]);
  const [completion, setCompletion] = useState(0);
  const [hints, setHints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState(0);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [promptChoice, setPromptChoice] = useState(PERSONALITY_PROMPTS[0]);
  const [promptAnswer, setPromptAnswer] = useState('');
  // Task #14 — real coordinate capture (V2, user-requested: location
  // preference filtering). Explicit-consent only: this is set purely by the
  // "Use my current location" button below, never automatically. `null`
  // means unknown; the API also returns this after every save so it stays
  // accurate if the backend fell back to a city/district approximation
  // instead (see backend/utils/geoUtils.js).
  const [locationInfo, setLocationInfo] = useState(null); // { source, lat, lng } | null
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getMyProfile();
        if (cancelled) return;
        const p = data.profile;
        setForm({
          displayName: p.displayName || '',
          dateOfBirth: toDateInputValue(p.dateOfBirth),
          gender: p.gender || '',
          interestedIn: p.interestedIn || [],
          datingIntention: p.datingIntention || '',
          city: p.city || '',
          district: p.district || '',
          profession: p.profession || '',
          education: p.education || '',
          bio: p.bio || '',
          interests: p.interests || [],
          languages: p.languages || [],
          lifestyle: {
            smoking: p.lifestyle?.smoking || '',
            drinking: p.lifestyle?.drinking || '',
            diet: p.lifestyle?.diet || '',
          },
          personalityPrompts: p.personalityPrompts || [],
          instagramHandle: p.instagramHandle || '',
        });
        setPhotos(p.photos || []);
        setCompletion(p.profileCompletionPercentage || 0);
        setHints(p.completionHints || []);
        setLocationInfo(p.location ? { source: p.locationSource, ...p.location } : null);
      } catch (err) {
        // No profile yet (404) is the expected "first-time builder" case.
        if (!cancelled && !/not found/i.test(err.message || '')) {
          setError(err.message || 'Could not load your profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInterestedIn(value) {
    setForm((prev) => {
      const has = prev.interestedIn.includes(value);
      return {
        ...prev,
        interestedIn: has
          ? prev.interestedIn.filter((v) => v !== value)
          : [...prev.interestedIn, value],
      };
    });
  }

  function addPromptAnswer() {
    if (!promptAnswer.trim()) return;
    if (form.personalityPrompts.length >= MAX_PROMPTS) return;
    if (form.personalityPrompts.some((p) => p.prompt === promptChoice)) return;
    update('personalityPrompts', [
      ...form.personalityPrompts,
      { prompt: promptChoice, answer: promptAnswer.trim() },
    ]);
    setPromptAnswer('');
    const remaining = PERSONALITY_PROMPTS.find(
      (opt) => opt !== promptChoice && !form.personalityPrompts.some((p) => p.prompt === opt)
    );
    if (remaining) setPromptChoice(remaining);
  }

  function removePromptAnswer(prompt) {
    update(
      'personalityPrompts',
      form.personalityPrompts.filter((p) => p.prompt !== prompt)
    );
  }

  // Shared by the "Next" button (saves progress after every step, so
  // stepping back and forth or leaving mid-way never loses anything) and the
  // final step's "Finish" button. Returns whether the save succeeded so
  // callers can decide whether to advance.
  async function saveProfile({ silent = false } = {}) {
    setError('');
    if (!silent) setSuccess('');

    // Client-side mirror of backend/routes/profile.js's instagramHandle
    // validation — same regex, same "strip a leading @" normalization —
    // so an invalid handle is caught before the round-trip.
    const normalizedInstagram = normalizeInstagramHandle(form.instagramHandle);
    if (normalizedInstagram && !INSTAGRAM_HANDLE_REGEX.test(normalizedInstagram)) {
      setError(
        'Instagram username must be 1-30 characters using only letters, numbers, periods, and underscores'
      );
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        lifestyle: {
          smoking: form.lifestyle.smoking || null,
          drinking: form.lifestyle.drinking || null,
          diet: form.lifestyle.diet || null,
        },
        instagramHandle: normalizedInstagram || null,
      };
      const data = await api.saveMyProfile(payload);
      setCompletion(data.profile.profileCompletionPercentage);
      setHints(data.profile.completionHints || []);
      setPhotos(data.profile.photos || []);
      update('instagramHandle', data.profile.instagramHandle || '');
      // City/district changes may have triggered the backend's approximate-
      // location fallback (backend/utils/geoUtils.js) — refresh so the
      // location status message below stays accurate.
      setLocationInfo(
        data.profile.location ? { source: data.profile.locationSource, ...data.profile.location } : null
      );
      if (!silent) setSuccess('Profile saved');
      return true;
    } catch (err) {
      setError(err.message || 'Could not save your profile');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function stepValidationError() {
    if (STEPS[step].key === 'basic') {
      if (!form.displayName.trim()) return 'Please enter a display name';
      if (!form.dateOfBirth) return 'Please enter your date of birth';
      if (!form.gender) return 'Please select your gender';
    }
    return null;
  }

  async function handleNext() {
    const validationError = stepValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }
    const ok = await saveProfile({ silent: true });
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleFinish(e) {
    e.preventDefault();
    const ok = await saveProfile();
    if (ok) navigate('/dashboard');
  }

  async function handleAddPhotoUrl() {
    if (!photoUrlInput.trim()) return;
    setPhotoBusy(true);
    setError('');
    try {
      const data = await api.addProfilePhoto({ url: photoUrlInput.trim() });
      setPhotos(data.profile.photos);
      setCompletion(data.profile.profileCompletionPercentage);
      setHints(data.profile.completionHints || []);
      setPhotoUrlInput('');
    } catch (err) {
      setError(err.message || 'Could not add photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  // Task #14 — "Use my current location" (real device coordinate capture,
  // V2, user-requested). Deliberately opt-in and explicit: nothing on this
  // page ever calls the geolocation API on its own; this only runs when the
  // user clicks the button, and the browser's own native permission prompt
  // is the actual consent gate. Manual city/district entry above always
  // remains available regardless of whether this succeeds, is denied, or is
  // never used at all — see backend/utils/geoUtils.js's city-approximation
  // fallback for what happens when it isn't.
  function handleUseCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Location access is not available in this browser — your city/district below is used instead.');
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await api.updateProfileLocation(latitude, longitude);
          setLocationInfo(
            data.profile.location
              ? { source: data.profile.locationSource, ...data.profile.location }
              : null
          );
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
            ? 'Location permission denied — your city/district below will be used as an approximate location instead.'
            : 'Could not determine your location — try again, or rely on your city/district below.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const [, base64] = String(reader.result).split(',');
        const data = await api.addProfilePhoto({ imageBase64: base64, mimeType: file.type });
        setPhotos(data.profile.photos);
        setCompletion(data.profile.profileCompletionPercentage);
        setHints(data.profile.completionHints || []);
      } catch (err) {
        setError(err.message || 'Could not add photo');
      } finally {
        setPhotoBusy(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-secondary">Loading…</p>
      </div>
    );
  }

  const usedPrompts = new Set(form.personalityPrompts.map((p) => p.prompt));
  const availablePrompts = PERSONALITY_PROMPTS.filter((p) => !usedPrompts.has(p));

  const instagramPreviewHandle = normalizeInstagramHandle(form.instagramHandle);
  const instagramPreviewValid =
    instagramPreviewHandle && INSTAGRAM_HANDLE_REGEX.test(instagramPreviewHandle);

  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;
  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        {/* Compact header: small avatar + step dots, no page-length wall of text */}
        <div className="mb-6 flex items-center gap-4">
          <Avatar src={photos.find((p) => p.isPrimary)?.url} name={form.displayName} size="md" />
          <div className="flex-1">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-text-secondary">
              <span>
                Step {step + 1} of {STEPS.length}
              </span>
              <span className="text-primary">{completion}% complete</span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= step ? 'bg-primary' : 'bg-primary-subtle'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-text-primary">{currentStep.title}</h1>
          <p className="text-sm text-text-secondary">{currentStep.subtitle}</p>
        </div>

        {hints.length > 0 && (
          <p className="mb-4 rounded-lg bg-primary-subtle px-3 py-2 text-xs text-primary">
            💡 {hints[0]}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}
        {success && (
          <p className="mb-4 rounded-lg bg-success-subtle px-3 py-2 text-sm text-success">
            {success}
          </p>
        )}

        <form onSubmit={handleFinish}>
          {/* Basic info */}
          {currentStep.key === 'basic' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="grid gap-4">
              <TextField
                label="Display name"
                required
                value={form.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="What should we call you?"
              />
              <TextField
                label="Date of birth"
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => update('dateOfBirth', e.target.value)}
                helperText="You must be 18 or older"
              />
              <TextField
                as="select"
                label="Gender"
                required
                value={form.gender}
                onChange={(e) => update('gender', e.target.value)}
                options={[{ value: '', label: 'Select gender' }, ...GENDERS]}
              />
              <TextField
                label="Profession"
                value={form.profession}
                onChange={(e) => update('profession', e.target.value)}
                placeholder="e.g. Software Engineer"
              />
              <TextField
                label="Education"
                value={form.education}
                onChange={(e) => update('education', e.target.value)}
                placeholder="e.g. B.Tech, NIT Raipur"
              />
            </div>
            <div className="mt-4">
              <span className="mb-1 block text-sm font-medium text-text-primary">
                Who do you want to meet?
              </span>
              <div className="flex flex-wrap gap-2">
                {INTERESTED_IN_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => toggleInterestedIn(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      form.interestedIn.includes(opt.value)
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-text-primary hover:bg-primary-subtle'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
          )}

          {/* Dating intention */}
          {currentStep.key === 'intention' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="grid gap-2.5">
              {DATING_INTENTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => update('datingIntention', opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                    form.datingIntention === opt.value
                      ? 'border-primary bg-primary-subtle text-primary'
                      : 'border-border bg-surface text-text-primary hover:bg-primary-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* Location */}
          {currentStep.key === 'location' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="grid gap-4">
              <TextField
                label="City / town"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="e.g. Bhilai"
              />
              <TextField
                as="select"
                label="District"
                value={CG_DISTRICTS.includes(form.district) ? form.district : ''}
                onChange={(e) => update('district', e.target.value)}
                options={[
                  { value: '', label: 'Select district' },
                  ...CG_DISTRICTS.map((d) => ({ value: d, label: d })),
                  ...(form.district && !CG_DISTRICTS.includes(form.district)
                    ? [{ value: form.district, label: `${form.district} (custom)` }]
                    : []),
                ]}
              />
              <TextField
                label="Other district / town (not listed above)"
                value={CG_DISTRICTS.includes(form.district) ? '' : form.district}
                onChange={(e) => update('district', e.target.value)}
                placeholder="Type any Chhattisgarh district or town"
                helperText="Not limited to major cities — any CG district/town works"
              />
            </div>

            {/* Task #14 — real coordinate capture (V2, user-requested).
                Optional and explicit-consent only: used for distance-based
                match preferences (Settings > Discovery Preferences). If you
                never click this, your city/district above is used to
                estimate an approximate location instead — see
                MOCK_FEATURES.md (no geocoding API is configured). */}
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs text-text-secondary">
                {locationInfo?.source === 'device' &&
                  '📍 Using your device’s current location for distance-based matches.'}
                {locationInfo?.source === 'approximate_city' &&
                  '📍 Using an approximate location from your city/district above. Share your device location for more accurate distance matching.'}
                {!locationInfo &&
                  'Add your city/district above for an approximate location, or share your exact device location below for more accurate distance-based matches.'}
              </p>
              <Button
                type="button"
                variant="secondary"
                loading={locationBusy}
                onClick={handleUseCurrentLocation}
              >
                📍 Use my current location
              </Button>
            </div>
          </section>
          )}

          {/* Photos */}
          {currentStep.key === 'photos' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="mb-4 text-xs text-text-secondary">
              Photos are stored as a URL or a local image you pick, up to {MAX_PHOTOS}.
            </p>
            <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {photos.map((photo) => (
                <div key={photo.id || photo.url} className="relative">
                  <img
                    src={photo.url}
                    alt="Profile"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  {photo.isPrimary && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Primary
                    </span>
                  )}
                </div>
              ))}
              {photos.length === 0 && (
                <p className="col-span-full text-sm text-text-secondary">No photos yet.</p>
              )}
            </div>
            {photos.length < MAX_PHOTOS && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <TextField
                    containerClassName="flex-1"
                    value={photoUrlInput}
                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                    placeholder="Paste an image URL"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    loading={photoBusy}
                    onClick={handleAddPhotoUrl}
                  >
                    Add
                  </Button>
                </div>
                <label className="block text-sm text-text-secondary">
                  or{' '}
                  <span className="cursor-pointer font-medium text-primary underline">
                    upload from your device
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileSelected}
                      className="hidden"
                    />
                  </span>
                </label>
              </div>
            )}
          </section>
          )}

          {/* Bio + interests + languages */}
          {currentStep.key === 'bio' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <TextField
              as="textarea"
              label="Bio"
              rows={4}
              maxLength={BIO_MAX_LENGTH}
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="Tell people a bit about yourself…"
              helperText={`${form.bio.length}/${BIO_MAX_LENGTH}`}
            />
            <TagField
              label="Interests"
              values={form.interests}
              onChange={(v) => update('interests', v)}
              placeholder="e.g. Cricket, Cooking, Traveling"
              max={MAX_INTERESTS}
              helperText="Press Enter or Add — at least 3 helps your profile strength"
            />
            <TagField
              label="Languages"
              values={form.languages}
              onChange={(v) => update('languages', v)}
              placeholder="e.g. Hindi, Chhattisgarhi, English"
            />
            <div>
              <h3 className="mb-2 text-sm font-medium text-text-primary">Lifestyle</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  as="select"
                  label="Smoking"
                  value={form.lifestyle.smoking}
                  onChange={(e) => update('lifestyle', { ...form.lifestyle, smoking: e.target.value })}
                  options={[{ value: '', label: 'Prefer not to say' }, ...SMOKING_OPTIONS]}
                />
                <TextField
                  as="select"
                  label="Drinking"
                  value={form.lifestyle.drinking}
                  onChange={(e) => update('lifestyle', { ...form.lifestyle, drinking: e.target.value })}
                  options={[{ value: '', label: 'Prefer not to say' }, ...DRINKING_OPTIONS]}
                />
                <TextField
                  as="select"
                  label="Diet"
                  value={form.lifestyle.diet}
                  onChange={(e) => update('lifestyle', { ...form.lifestyle, diet: e.target.value })}
                  options={[{ value: '', label: 'Prefer not to say' }, ...DIET_OPTIONS]}
                />
              </div>
            </div>
          </section>
          )}

          {/* Social (Instagram handle) — post-MVP, user-requested; see MOCK_FEATURES.md.
              Self-reported only, not real Instagram OAuth (no Meta Developer app
              registered for this project — same mock-integration pattern already used
              for SMS/OTP, Cloudinary, Razorpay). */}
          {currentStep.key === 'social' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-3">
            <TextField
              label="Instagram username"
              value={form.instagramHandle}
              onChange={(e) => update('instagramHandle', e.target.value)}
              placeholder="yourusername"
              helperText="Optional — shown as a link on your profile. We don't verify you own this account."
            />
            {instagramPreviewValid && (
              <a
                href={`https://www.instagram.com/${instagramPreviewHandle}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary hover:opacity-80"
              >
                📷 @{instagramPreviewHandle}
              </a>
            )}
          </section>
          )}

          {/* Personality prompts */}
          {currentStep.key === 'prompts' && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="mb-4 text-xs text-text-secondary">
              Answer up to {MAX_PROMPTS} prompts to help others get to know you.
            </p>

            {form.personalityPrompts.length > 0 && (
              <ul className="mb-4 space-y-2">
                {form.personalityPrompts.map((p) => (
                  <li
                    key={p.prompt}
                    className="rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-text-primary">{p.prompt}</span>
                      <button
                        type="button"
                        onClick={() => removePromptAnswer(p.prompt)}
                        className="text-xs text-error hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="text-text-secondary">{p.answer}</p>
                  </li>
                ))}
              </ul>
            )}

            {availablePrompts.length > 0 && form.personalityPrompts.length < MAX_PROMPTS && (
              <div className="space-y-2">
                <TextField
                  as="select"
                  value={promptChoice}
                  onChange={(e) => setPromptChoice(e.target.value)}
                  options={availablePrompts.map((p) => ({ value: p, label: p }))}
                />
                <TextField
                  as="textarea"
                  rows={2}
                  maxLength={300}
                  value={promptAnswer}
                  onChange={(e) => setPromptAnswer(e.target.value)}
                  placeholder="Your answer"
                />
                <Button type="button" variant="secondary" onClick={addPromptAnswer}>
                  Add prompt
                </Button>
              </div>
            )}
          </section>
          )}

          <div className="mt-6 flex gap-3">
            {!isFirstStep && (
              <Button type="button" variant="secondary" onClick={handleBack}>
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button type="submit" loading={saving} className="flex-1">
                Finish
              </Button>
            ) : (
              <Button type="button" loading={saving} className="flex-1" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
          {!isLastStep && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mt-3 w-full text-center text-xs text-text-secondary hover:text-primary"
            >
              I'll finish this later
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default ProfileBuilder;
