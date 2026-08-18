import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';

// Invite & Earn (Task #17 — Referral program, V2 scope; see
// docs/BUSINESS_PLAN.md's Growth Strategy). Shows the caller's own referral
// code, a copy-to-clipboard shareable text (no real deep-link
// infrastructure — see MOCK_FEATURES.md), and how many people they've
// referred + the latest reward grants they've earned from it
// (GET /api/referrals/me, backend/routes/referrals.js).

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyReferrals()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your referral info');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS/older browser) —
      // the code is still shown on-screen to copy manually, so this is a
      // soft failure, not blocking.
      setError('Could not copy automatically — please copy the code manually.');
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Invite &amp; Earn</h1>
          <Link to="/settings" className="text-sm text-text-secondary hover:underline">
            Settings
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && data && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-1 text-lg font-semibold text-text-primary">Your referral code</h2>
              <p className="mb-4 text-xs text-text-secondary">
                Share your code with friends. When they sign up with it, you both get 7 days of
                CG Plus, free.
              </p>

              <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary bg-primary-subtle px-4 py-3">
                <span className="flex-1 text-center text-xl font-bold tracking-[0.3em] text-primary">
                  {data.referralCode}
                </span>
              </div>

              <Button variant="primary" className="mt-3 w-full" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy invite message'}
              </Button>

              <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-text-secondary">
                {data.shareText}
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">Your referrals</h2>
                <span className="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
                  {data.referralCount} joined
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {data.referralCount === 0
                  ? 'Nobody has signed up with your code yet — share it to start earning.'
                  : `${data.referralCount} ${data.referralCount === 1 ? 'person has' : 'people have'} joined CG Dating using your code.`}
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-1 text-lg font-semibold text-text-primary">Rewards earned</h2>
              <p className="mb-4 text-xs text-text-secondary">
                Your most recent referral rewards (7 days of CG Plus each).
              </p>

              {data.rewards.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  No rewards yet — you&rsquo;ll see them here as soon as someone joins with your
                  code.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.rewards.map((reward) => (
                    <li
                      key={reward.id}
                      className="flex items-center justify-between rounded-lg bg-background px-3 py-2"
                    >
                      <span className="text-sm font-medium text-text-primary">
                        {reward.planName || reward.planCode || 'Reward'}
                      </span>
                      <span className="text-xs text-text-secondary">
                        Granted {formatDate(reward.grantedAt)} · until {formatDate(reward.expiresAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <Link to="/settings">
          <Button variant="ghost" className="mt-4 w-full">
            Back to Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default Referrals;
