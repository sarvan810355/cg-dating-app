import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import TextField from '../components/TextField';
import VerificationBadge from '../components/VerificationBadge';

// Verification screen (Task #9 in the internal TaskList; = docs/ROADMAP.md's
// Phase 7) — two independent flows: mobile OTP and photo/selfie. Each is
// driven entirely off its own `status` enum
// (NOT_VERIFIED/PENDING/VERIFIED/REJECTED/EXPIRED, see
// backend/constants/verificationOptions.js) rather than separate local
// "step" state machines that could drift out of sync with the server.

const STATUS_COPY = {
  NOT_VERIFIED: { label: 'Not verified', tone: 'text-text-secondary' },
  PENDING: { label: 'Pending', tone: 'text-warning' },
  VERIFIED: { label: 'Verified', tone: 'text-success' },
  REJECTED: { label: 'Rejected', tone: 'text-error' },
  EXPIRED: { label: 'Expired', tone: 'text-error' },
};

function StatusPill({ status }) {
  const copy = STATUS_COPY[status] || STATUS_COPY.NOT_VERIFIED;
  return <span className={`text-xs font-semibold ${copy.tone}`}>{copy.label}</span>;
}

// --- Mobile OTP verification -------------------------------------------------

function MobileVerification({ mobileVerification, onUpdate }) {
  // Which step to show is derived from the server's status, not tracked as
  // independent local state, so a page refresh mid-flow (e.g. OTP already
  // sent) lands on the right step automatically.
  const derivedStep =
    mobileVerification.status === 'VERIFIED'
      ? 'verified'
      : mobileVerification.status === 'PENDING'
        ? 'otp'
        : 'phone';

  const [step, setStep] = useState(derivedStep);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    setStep(derivedStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileVerification.status]);

  async function handleRequestOtp(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const trimmed = phone.trim();
      const data = await api.requestMobileOtp(trimmed || undefined);
      setDevOtp(data.devOtp || null);
      setInfo(`OTP sent to ${data.phone}. It expires in ${Math.round(data.expiresInSeconds / 60)} minutes.`);
      setOtp('');
      setStep('otp');
      onUpdate({ status: 'PENDING', verifiedAt: null, phone: data.phone });
    } catch (err) {
      setError(err.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.verifyMobileOtp(otp.trim());
      setOtp('');
      setDevOtp(null);
      onUpdate(data.mobileVerification);
    } catch (err) {
      const msg = err.message || 'Incorrect OTP. Please try again.';
      setError(msg);
      if (/expired/i.test(msg)) {
        // The OTP itself expired server-side — send the user back to
        // request a fresh one rather than letting them keep retrying a
        // dead code.
        onUpdate({ status: 'EXPIRED', verifiedAt: null, phone: mobileVerification.phone });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Mobile Number</h2>
        <StatusPill status={mobileVerification.status} />
      </div>
      <p className="mb-4 text-xs text-text-secondary">
        Verify your mobile number with a one-time code (OTP).
      </p>

      {step === 'verified' && (
        <div className="flex items-center gap-3 rounded-xl bg-success-subtle p-4">
          <VerificationBadge type="mobile" size="md" />
          <p className="text-sm text-text-primary">
            {mobileVerification.phone || 'Your number'} is verified.
          </p>
        </div>
      )}

      {step === 'phone' && (
        <form onSubmit={handleRequestOtp} className="space-y-3">
          {mobileVerification.status === 'REJECTED' && (
            <p className="rounded-lg bg-error-subtle px-3 py-2 text-xs text-error">
              Your last attempt didn&rsquo;t go through. Please try again.
            </p>
          )}
          {mobileVerification.status === 'EXPIRED' && (
            <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning">
              That OTP expired. Request a new one below.
            </p>
          )}
          {mobileVerification.phone && (
            <p className="text-xs text-text-secondary">
              Number on file: <span className="font-medium">{mobileVerification.phone}</span> —
              enter a number below to verify it (or a new one).
            </p>
          )}
          <TextField
            id="verify-phone"
            label="Mobile number"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required={!mobileVerification.phone}
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Send OTP
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          {info && <p className="rounded-lg bg-success-subtle px-3 py-2 text-xs text-success">{info}</p>}
          {devOtp && (
            <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning">
              Dev mode — no SMS provider configured, your OTP is <strong>{devOtp}</strong>.
            </p>
          )}
          <TextField
            id="verify-otp"
            label="Enter the 6-digit code"
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            required
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <Button type="submit" loading={loading} disabled={otp.length !== 6} className="w-full">
            Verify
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-text-secondary hover:underline"
            onClick={() => {
              setStep('phone');
              setError('');
              setInfo('');
            }}
          >
            Didn&rsquo;t get a code? Resend / use a different number
          </button>
        </form>
      )}
    </section>
  );
}

// --- Photo / selfie verification ---------------------------------------------

function PhotoVerification({ photoVerification, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');

  async function submitPayload(payload) {
    setError('');
    setLoading(true);
    try {
      const data = await api.submitPhotoVerification(payload);
      onUpdate(data.photoVerification);
      setUrlInput('');
    } catch (err) {
      setError(err.message || 'Could not submit your photo. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = String(reader.result).split(',');
      submitPayload({ imageBase64: base64, mimeType: file.type });
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  function handleUrlSubmit(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    submitPayload({ url: urlInput.trim() });
  }

  const canSubmit = ['NOT_VERIFIED', 'REJECTED', 'EXPIRED'].includes(photoVerification.status);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Photo Verification</h2>
        <StatusPill status={photoVerification.status} />
      </div>
      <p className="mb-4 text-xs text-text-secondary">
        Submit a selfie so our team can confirm it&rsquo;s really you. This is reviewed
        manually — there&rsquo;s no automated face-match in this version.
      </p>

      {photoVerification.status === 'VERIFIED' && (
        <div className="flex items-center gap-3 rounded-xl bg-success-subtle p-4">
          <VerificationBadge type="photo" size="md" />
          <p className="text-sm text-text-primary">Your photo is verified.</p>
        </div>
      )}

      {photoVerification.status === 'PENDING' && (
        <div className="flex items-center gap-3 rounded-xl bg-warning-subtle p-4">
          {photoVerification.submittedPhotoUrl && (
            <img
              src={photoVerification.submittedPhotoUrl}
              alt="Submitted selfie"
              className="h-14 w-14 rounded-lg object-cover"
            />
          )}
          <p className="text-sm text-text-primary">
            Your photo is pending review. We&rsquo;ll update this once it&rsquo;s checked.
          </p>
        </div>
      )}

      {canSubmit && (
        <div className="space-y-3">
          {photoVerification.status === 'REJECTED' && (
            <p className="rounded-lg bg-error-subtle px-3 py-2 text-xs text-error">
              Your last submission wasn&rsquo;t approved. Please try again with a clear, recent
              selfie.
            </p>
          )}
          {photoVerification.status === 'EXPIRED' && (
            <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning">
              That submission expired before review. Please submit again.
            </p>
          )}

          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-6 text-sm text-text-secondary hover:bg-primary-subtle">
            {loading ? 'Uploading…' : 'Take or upload a selfie'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={loading}
              onChange={handleFileSelected}
            />
          </label>

          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <TextField
              id="photo-url"
              placeholder="…or paste an image URL"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              containerClassName="flex-1"
            />
            <Button type="submit" variant="secondary" loading={loading} disabled={!urlInput.trim()}>
              Submit
            </Button>
          </form>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}
    </section>
  );
}

// --- Page --------------------------------------------------------------------

function Verification() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getVerificationStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your verification status');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateMobile(partial) {
    setStatus((prev) => ({ ...prev, mobileVerification: { ...prev.mobileVerification, ...partial } }));
  }
  function updatePhoto(partial) {
    setStatus((prev) => ({ ...prev, photoVerification: { ...prev.photoVerification, ...partial } }));
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Get Verified</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Home
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && status && (
          <div className="space-y-4">
            <MobileVerification mobileVerification={status.mobileVerification} onUpdate={updateMobile} />
            <PhotoVerification photoVerification={status.photoVerification} onUpdate={updatePhoto} />
          </div>
        )}

        <Link to="/dashboard">
          <Button variant="ghost" className="mt-4 w-full">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default Verification;
