import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import CompatibilityBadge from '../components/CompatibilityBadge';
import MatchModal from '../components/MatchModal';
import NotificationBell from '../components/NotificationBell';
import SafetyMenu from '../components/SafetyMenu';
import VerificationBadge from '../components/VerificationBadge';
import { DATING_INTENTIONS } from '../constants/profileOptions';
import { MAX_DISTANCE_KM_CAP } from '../constants/discoveryOptions';

function intentionLabel(value) {
  return DATING_INTENTIONS.find((d) => d.value === value)?.label || value;
}

// Single discovery card: photo, name/age, city, dating-intention chip, bio,
// and a couple of interests — per docs/DESIGN_SYSTEM.md's ProfileCard. Also
// carries the Report/Block entry point (Task #10) as a small overlay menu
// on the photo, per the task spec's "reachable from a user's profile card"
// requirement.
function DiscoveryCard({ profile, onBlocked }) {
  const photo = profile.photos?.find((p) => p.isPrimary)?.url || profile.photos?.[0]?.url;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="relative aspect-[4/5] w-full bg-primary-subtle">
        {photo ? (
          <img
            src={photo}
            alt={profile.displayName || 'Profile photo'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl font-semibold text-primary">
            {(profile.displayName || '?')[0]}
          </div>
        )}
        <SafetyMenu
          variant="overlay"
          className="absolute right-3 top-3"
          userId={profile.userId}
          userName={profile.displayName}
          onBlocked={onBlocked}
        />
      </div>
      <div className="p-5">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-text-primary">
            {profile.displayName || 'Someone new'}
          </h2>
          {profile.age != null && <span className="text-lg text-text-secondary">{profile.age}</span>}
        </div>
        {(profile.mobileVerified || profile.photoVerified || profile.compatibility?.score > 0) && (
          <div className="mb-2 flex flex-wrap gap-1">
            {profile.mobileVerified && <VerificationBadge type="mobile" />}
            {profile.photoVerified && <VerificationBadge type="photo" />}
            {/* Task #19 — weighted discovery ranking (V2, user-requested).
                Reuses Task #15's CompatibilityBadge component as-is; ranking
                itself stays invisible (no score/order shown), this is only
                the same "Why You Match" transparency Matches.jsx already
                shows, now also on Discovery cards since it's already
                computed per-candidate for ranking. Only shown once there's
                a genuine (>0) score, same convention as Matches.jsx — never
                fabricated. */}
            {profile.compatibility?.score > 0 && (
              <CompatibilityBadge score={profile.compatibility.score} />
            )}
          </div>
        )}
        {profile.compatibility?.reasons?.length > 0 && (
          <p className="mb-2 text-xs text-text-secondary">
            {profile.compatibility.reasons[0]}
          </p>
        )}
        {(profile.city || profile.district) && (
          <p className="mb-2 text-sm text-text-secondary">
            {[profile.city, profile.district].filter(Boolean).join(', ')}
            {/* Task #14 — distance-based match preferences (V2, user-requested).
                Only shown when both sides have a resolvable location (real or
                approximate city-center) — see backend/utils/geoUtils.js. */}
            {profile.distanceKm != null && ` · ${Math.round(profile.distanceKm)} km away`}
          </p>
        )}
        {profile.datingIntention && (
          <span className="mb-3 inline-block rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary">
            {intentionLabel(profile.datingIntention)}
          </span>
        )}
        {profile.bio && (
          <p className="mb-3 line-clamp-3 text-sm text-text-primary">{profile.bio}</p>
        )}
        {profile.interests?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {profile.interests.slice(0, 3).map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary"
              >
                {interest}
              </span>
            ))}
          </div>
        )}
        {profile.instagramHandle && (
          // Post-MVP, user-requested — self-reported only, not verified
          // ownership (see MOCK_FEATURES.md). Stops propagation so tapping
          // the badge doesn't trigger anything the card wraps it in.
          <a
            href={`https://www.instagram.com/${profile.instagramHandle}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-subtle"
          >
            📷 @{profile.instagramHandle}
          </a>
        )}
      </div>
    </div>
  );
}

function Discovery() {
  const [queue, setQueue] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [error, setError] = useState('');
  const [matchInfo, setMatchInfo] = useState(null);
  // Task #12 — Subscription scaffolding: set when POST /api/discovery/swipe
  // returns 429 { upgradeRequired: true } (the free-tier daily like limit —
  // see docs/BUSINESS_PLAN.md). Shown as a friendly upgrade prompt instead
  // of a raw error message.
  const [limitReached, setLimitReached] = useState(false);
  // Task #14 — one-off "search wider" override (V2, user-requested: location
  // preference filtering). Does NOT persist to the caller's saved
  // preferences (PUT /api/profile/me) — it's a per-request query-param
  // override on GET /api/discovery/feed, exactly the "search wider" UX the
  // task spec called for. Reset your saved radius on the dedicated
  // Discovery Preferences page (Settings) if you want this to stick.
  const [searchWider, setSearchWider] = useState(false);

  const loadPage = useCallback(
    async (nextPage) => {
      try {
        const data = await api.getDiscoveryFeed({
          page: nextPage,
          ...(searchWider ? { maxDistanceKm: MAX_DISTANCE_KM_CAP } : {}),
        });
        setQueue((prev) => [...prev, ...data.profiles]);
        setHasMore(data.hasMore);
        setPage(nextPage);
      } catch (err) {
        setError(err.message || 'Could not load discovery feed');
      }
    },
    [searchWider]
  );

  function handleSearchWider() {
    setSearchWider(true);
    setQueue([]);
    setPage(0);
    setHasMore(true);
    setLoading(true);
  }

  // Re-fetch page 1 from scratch whenever "search wider" is turned on.
  useEffect(() => {
    if (!searchWider) return;
    let cancelled = false;
    async function reload() {
      await loadPage(1);
      if (!cancelled) setLoading(false);
    }
    reload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchWider]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      await loadPage(1);
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch the next page once we're running low on cards.
  useEffect(() => {
    if (!loading && queue.length <= 2 && hasMore) {
      loadPage(page + 1);
    }
  }, [queue.length, hasMore, loading, page, loadPage]);

  const current = queue[0];

  // Task #10 (Safety — Report/Block): a successful block from the current
  // card's SafetyMenu removes that person from the queue immediately —
  // they're excluded server-side from now on anyway, so leaving their card
  // visible until the next reload would be a confusing UI lie.
  function handleBlocked(blockedUserId) {
    setQueue((prev) => prev.filter((p) => p.userId !== blockedUserId));
  }

  async function handleSwipe(action) {
    if (!current || swiping) return;
    setSwiping(true);
    setError('');
    setLimitReached(false);
    try {
      const data = await api.swipe(current.userId, action);
      setQueue((prev) => prev.slice(1));
      if (data.matchCreated) {
        // Carry the new match's id along so MatchModal's "Start a
        // conversation" CTA (Task #5) can route straight into the real
        // chat screen instead of just the matches list.
        setMatchInfo({ ...current, matchId: data.match?.id });
      }
    } catch (err) {
      // Task #12 — Subscription scaffolding: the free-tier daily like limit
      // (backend/routes/discovery.js's POST /swipe) responds 429 with
      // `upgradeRequired: true` — checked via `err.data` (attached by
      // frontend/src/api.js), not by guessing from the message text, unlike
      // the 409 "already swiped" case below. The card stays in the queue
      // (the swipe was never recorded) so the user can act on it later —
      // e.g. after upgrading — without losing their place.
      if (err.status === 429 && err.data?.upgradeRequired) {
        setLimitReached(true);
      } else if (/already swiped/i.test(err.message || '')) {
        // A 409 "already swiped" shouldn't normally happen from this UI
        // (the card is removed from the queue right after a successful
        // swipe), but if it does — e.g. a duplicate tap — just drop the
        // card instead of showing a scary error.
        setQueue((prev) => prev.slice(1));
      } else {
        setError(err.message || 'Could not record your swipe');
      }
    } finally {
      setSwiping(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Discover</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/matches" className="font-medium text-primary hover:underline">
              Matches
            </Link>
            <Link to="/dashboard" className="text-text-secondary hover:underline">
              Home
            </Link>
            <NotificationBell />
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {limitReached && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-3">
            <p className="text-sm font-medium text-text-primary">
              You&rsquo;ve hit today&rsquo;s like limit
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Upgrade to CG_PLUS for unlimited likes, or come back tomorrow — you can still Pass.
            </p>
            <div className="mt-2 flex gap-2">
              <Link to="/subscription">
                <Button className="text-xs" onClick={() => setLimitReached(false)}>
                  Upgrade
                </Button>
              </Link>
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => setLimitReached(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <p className="py-16 text-center text-text-secondary">Finding people near you…</p>
        )}

        {!loading && current && (
          <>
            <DiscoveryCard profile={current} onBlocked={handleBlocked} />
            <div className="mt-5 flex justify-center gap-4">
              <Button
                variant="secondary"
                className="rounded-full! px-8! py-3! text-base"
                disabled={swiping}
                onClick={() => handleSwipe('pass')}
              >
                Pass
              </Button>
              <Button
                className="rounded-full! px-8! py-3! text-base"
                disabled={swiping}
                onClick={() => handleSwipe('like')}
              >
                Like
              </Button>
            </div>
          </>
        )}

        {!loading && !current && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-2 text-lg font-semibold text-text-primary">You&rsquo;re all caught up</p>
            <p className="text-sm text-text-secondary">
              No new profiles right now — check back later, search a wider distance, or update
              your Discovery Preferences.
            </p>
            {!searchWider && (
              <Button variant="secondary" className="mt-4 w-full" onClick={handleSearchWider}>
                Search wider ({MAX_DISTANCE_KM_CAP} km, this time only)
              </Button>
            )}
            <Link to="/settings/discovery-preferences">
              <Button variant="ghost" className="mt-2 w-full">
                Discovery Preferences
              </Button>
            </Link>
            <Link to="/profile/edit">
              <Button variant="secondary" className="mt-2 w-full">
                Edit your profile
              </Button>
            </Link>
          </div>
        )}
      </div>

      <MatchModal otherUser={matchInfo} onClose={() => setMatchInfo(null)} />
    </div>
  );
}

export default Discovery;
