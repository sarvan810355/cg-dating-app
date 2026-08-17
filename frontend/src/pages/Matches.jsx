import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';

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
          <div className="flex gap-4 text-sm">
            <Link to="/discover" className="font-medium text-primary hover:underline">
              Discover
            </Link>
            <Link to="/dashboard" className="text-text-secondary hover:underline">
              Home
            </Link>
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
                {/* Chat (Task #5) isn't built yet — this routes to a
                    "coming soon" placeholder, per the design system's
                    "fast not long" direction rather than a dead end. */}
                <Link
                  to={`/chat/${m.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:bg-primary-subtle"
                >
                  <Avatar src={m.otherUser.photo} name={m.otherUser.displayName} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">
                      {m.otherUser.displayName || 'CG Dating user'}
                      {m.otherUser.age != null ? `, ${m.otherUser.age}` : ''}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {[m.otherUser.city, m.otherUser.district].filter(Boolean).join(', ') ||
                        'Matched'}
                    </p>
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
