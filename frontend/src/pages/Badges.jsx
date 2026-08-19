import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';

// Achievements/Badges (Task #20 — Engagement, V2 scope; see
// docs/BUSINESS_PLAN.md's Brand personality section for why this exists as
// the deliberately non-manipulative alternative to an original "make it
// addictive" request). Shows the full catalog — unlocked badges celebrated
// plainly, locked ones shown with a cheap progress hint where one is
// meaningfully computable (GET /api/badges, backend/routes/badges.js) — no
// countdowns, no "you're about to lose it" framing anywhere on this screen.

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function BadgeCard({ badge }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        badge.unlocked
          ? 'border-primary/30 bg-primary-subtle'
          : 'border-border bg-background opacity-70'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl ${
          badge.unlocked ? 'bg-surface' : 'bg-surface grayscale'
        }`}
        aria-hidden="true"
      >
        {badge.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{badge.label}</p>
        <p className="text-xs text-text-secondary">{badge.description}</p>
        {badge.unlocked ? (
          <p className="mt-0.5 text-[11px] font-medium text-primary">
            Unlocked {formatDate(badge.unlockedAt)}
          </p>
        ) : (
          badge.progress && (
            <div className="mt-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{
                    width: `${Math.min(100, (badge.progress.current / badge.progress.target) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {badge.progress.current}/{badge.progress.target}
              </p>
            </div>
          )
        )}
      </div>
    </li>
  );
}

function Badges() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getBadges()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your badges');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unlocked = data?.badges?.filter((b) => b.unlocked) || [];
  const locked = data?.badges?.filter((b) => !b.unlocked) || [];

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Achievements</h1>
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
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">Your badges</h2>
                <span className="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
                  {data.unlockedCount}/{data.totalCount}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                Little markers of real milestones — a first match, a verified profile, a
                completed Safe Date. No pressure, nothing to lose — they&rsquo;re yours once
                you&rsquo;ve earned them.
              </p>
            </section>

            {unlocked.length > 0 && (
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold text-text-primary">Unlocked</h2>
                <ul className="space-y-2">
                  {unlocked.map((b) => (
                    <BadgeCard key={b.code} badge={b} />
                  ))}
                </ul>
              </section>
            )}

            {locked.length > 0 && (
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold text-text-primary">Still to unlock</h2>
                <ul className="space-y-2">
                  {locked.map((b) => (
                    <BadgeCard key={b.code} badge={b} />
                  ))}
                </ul>
              </section>
            )}
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

export default Badges;
