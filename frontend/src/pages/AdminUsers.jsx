import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import AdminNav from '../components/AdminNav';
import Button from '../components/Button';
import TextField from '../components/TextField';

// Basic user management (Task #11 in the internal TaskList; = docs/
// ROADMAP.md's Phase 9) — a simple search-by-email list with suspend/
// reinstate actions, per the task spec ("don't over-build a full user table
// with every field"). Backed by GET /api/admin/users (an addition beyond the
// task's originally-listed backend routes — see backend/routes/admin.js's
// route comment) and PATCH .../suspend / .../reinstate.
function UserRow({ user, onSuspend, onReinstate, busy }) {
  const suspended = user.accountStatus === 'SUSPENDED';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">
          {user.displayName || 'CG Dating user'}{' '}
          {user.role !== 'USER' && (
            <span className="ml-1 rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              {user.role}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-text-secondary">{user.email}</p>
        <p className="text-xs text-text-secondary">
          {suspended ? (
            <span className="font-medium text-error">Suspended</span>
          ) : (
            <span className="font-medium text-success">Active</span>
          )}
          {' · '}
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </p>
      </div>
      {suspended ? (
        <Button variant="secondary" loading={busy} onClick={() => onReinstate(user.id)}>
          Reinstate
        </Button>
      ) : (
        <Button variant="destructive" loading={busy} onClick={() => onSuspend(user.id)}>
          Suspend
        </Button>
      )}
    </li>
  );
}

function AdminUsers() {
  const [email, setEmail] = useState('');
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load(searchEmail) {
    setLoading(true);
    setError('');
    api
      .getAdminUsers({ email: searchEmail || undefined, limit: 20 })
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message || 'Could not load users'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    load(email);
  }

  async function handleSuspend(userId) {
    setBusyId(userId);
    setError('');
    try {
      await api.suspendAdminUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, accountStatus: 'SUSPENDED' } : u))
      );
    } catch (err) {
      setError(err.message || 'Could not suspend this user — try again');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReinstate(userId) {
    setBusyId(userId);
    setError('');
    try {
      await api.reinstateAdminUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, accountStatus: 'ACTIVE' } : u))
      );
    } catch (err) {
      setError(err.message || 'Could not reinstate this user — try again');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Exit admin
          </Link>
        </div>

        <AdminNav />

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <TextField
            containerClassName="flex-1"
            placeholder="Search by email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && users?.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-1 text-lg font-semibold text-text-primary">No users found</p>
            <p className="text-sm text-text-secondary">Try a different email search.</p>
          </div>
        )}

        {users?.length > 0 && (
          <ul className="space-y-3">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                busy={busyId === u.id}
                onSuspend={handleSuspend}
                onReinstate={handleReinstate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminUsers;
