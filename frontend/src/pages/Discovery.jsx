import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import MatchModal from '../components/MatchModal';
import NotificationBell from '../components/NotificationBell';
import VerificationBadge from '../components/VerificationBadge';
import { DATING_INTENTIONS } from '../constants/profileOptions';

function intentionLabel(value) {
  return DATING_INTENTIONS.find((d) => d.value === value)?.label || value;
}

// Single discovery card: photo, name/age, city, dating-intention chip, bio,
// and a couple of interests — per docs/DESIGN_SYSTEM.md's ProfileCard.
function DiscoveryCard({ profile }) {
  const photo = profile.photos?.find((p) => p.isPrimary)?.url || profile.photos?.[0]?.url;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="aspect-[4/5] w-full bg-primary-subtle">
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
      </div>
      <div className="p-5">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-text-primary">
            {profile.displayName || 'Someone new'}
          </h2>
          {profile.age != null && <span className="text-lg text-text-secondary">{profile.age}</span>}
        </div>
        {(profile.mobileVerified || profile.photoVerified) && (
          <div className="mb-2 flex flex-wrap gap-1">
            {profile.mobileVerified && <VerificationBadge type="mobile" />}
            {profile.photoVerified && <VerificationBadge type="photo" />}
          </div>
        )}
        {(profile.city || profile.district) && (
          <p className="mb-2 text-sm text-text-secondary">
            {[profile.city, profile.district].filter(Boolean).join(', ')}
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
          <div className="flex flex-wrap gap-2">
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

  const loadPage = useCallback(async (nextPage) => {
    try {
      const data = await api.getDiscoveryFeed({ page: nextPage });
      setQueue((prev) => [...prev, ...data.profiles]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || 'Could not load discovery feed');
    }
  }, []);

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

  async function handleSwipe(action) {
    if (!current || swiping) return;
    setSwiping(true);
    setError('');
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
      // A 409 "already swiped" shouldn't normally happen from this UI (the
      // card is removed from the queue right after a successful swipe), but
      // if it does — e.g. a duplicate tap — just drop the card instead of
      // showing a scary error.
      if (/already swiped/i.test(err.message || '')) {
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

        {loading && (
          <p className="py-16 text-center text-text-secondary">Finding people near you…</p>
        )}

        {!loading && current && (
          <>
            <DiscoveryCard profile={current} />
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
              No new profiles right now — check back later, or update your profile to widen your
              reach.
            </p>
            <Link to="/profile/edit">
              <Button variant="secondary" className="mt-4 w-full">
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
