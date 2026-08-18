import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import CompatibilityBadge from '../components/CompatibilityBadge';
import NotificationBell from '../components/NotificationBell';
import VerificationBadge from '../components/VerificationBadge';

function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getMatches()
      .then((data) => {
        if (!cancelled) setMatches(data.matches);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your matches');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Matches</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/discover" className="font-medium text-primary hover:underline">
              Discover
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

        {loading && <p className="py-16 text-center text-text-secondary">Loading your matches…</p>}

        {!loading && !error && matches.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-2 text-lg font-semibold text-text-primary">No matches yet</p>
            <p className="mb-4 text-sm text-text-secondary">
              Keep swiping — your matches will show up here.
            </p>
            <Link to="/discover">
              <Button className="w-full">Start discovering</Button>
            </Link>
          </div>
        )}

        {matches.length > 0 && (
          <ul className="space-y-3">
            {matches.map((m) => (
              <li key={m.id}>
                {/* Opens the real chat screen (Task #5) for this match — see
                    frontend/src/pages/Chat.jsx. Per-match last-message
                    preview / unread badges aren't wired into this list yet
                    (would need GET /api/matches to return that data); left
                    for a future pass so this task stays focused on chat
                    itself working end-to-end. */}
                <Link
                  to={`/chat/${m.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:bg-primary-subtle"
                >
                  <Avatar
                    src={m.otherUser.photo}
                    name={m.otherUser.displayName}
                    size="md"
                    verified={m.otherUser.photoVerified}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">
                      {m.otherUser.displayName || 'CG Dating user'}
                      {m.otherUser.age != null ? `, ${m.otherUser.age}` : ''}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {[m.otherUser.city, m.otherUser.district].filter(Boolean).join(', ') ||
                        'Matched'}
                    </p>
                    {(m.otherUser.mobileVerified ||
                      m.otherUser.photoVerified ||
                      m.compatibility?.score > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.otherUser.mobileVerified && <VerificationBadge type="mobile" />}
                        {m.otherUser.photoVerified && <VerificationBadge type="photo" />}
                        {/* Task #15 — Smart Icebreakers + Why-You-Match
                            (V2, user-requested): a deterministic,
                            heuristic-based score, not real AI — see
                            MOCK_FEATURES.md. Only shown once there's a
                            genuine (>0) score to report. */}
                        {m.compatibility?.score > 0 && (
                          <CompatibilityBadge score={m.compatibility.score} />
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Matches;
