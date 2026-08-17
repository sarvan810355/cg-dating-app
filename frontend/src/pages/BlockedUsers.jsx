import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';

// "Manage blocked users" screen (Task #10, see docs/ROADMAP.md's Phase 8) —
// lists everyone the caller currently has blocked (GET /api/blocks) with an
// Unblock action per row (DELETE /api/blocks/:userId). Reachable from
// Settings.jsx.
function BlockedUsers() {
  const [blocks, setBlocks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getBlockedUsers()
      .then((data) => {
        if (!cancelled) setBlocks(data.blocks);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your blocked users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnblock(userId) {
    setUnblockingId(userId);
    setError('');
    try {
      await api.unblockUser(userId);
      setBlocks((prev) => prev.filter((b) => String(b.blockedUserId) !== String(userId)));
    } catch (err) {
      setError(err.message || 'Could not unblock this user — try again');
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Blocked Users</h1>
          <Link to="/settings" className="text-sm text-text-secondary hover:underline">
            Settings
          </Link>
        </div>

        <p className="mb-4 text-xs text-text-secondary">
          People you&rsquo;ve blocked can&rsquo;t see your profile, match with you, or message you,
          and you won&rsquo;t see them either. Unblocking someone lets both of you see each other
          again.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && blocks?.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-1 text-lg font-semibold text-text-primary">No blocked users</p>
            <p className="text-sm text-text-secondary">
              Anyone you block will show up here so you can unblock them later.
            </p>
          </div>
        )}

        {blocks?.length > 0 && (
          <ul className="space-y-3">
            {blocks.map((b) => (
              <li
                key={b.blockedUserId}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <Avatar src={b.photo} name={b.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {b.displayName || 'CG Dating user'}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Blocked {new Date(b.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  loading={unblockingId === b.blockedUserId}
                  onClick={() => handleUnblock(b.blockedUserId)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Link to="/settings">
          <Button variant="ghost" className="mt-6 w-full">
            Back to Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default BlockedUsers;
