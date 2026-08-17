import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Roles allowed into the /admin section — matches backend/constants/
// adminOptions.js's ADMIN_ROLES exactly (kept as a small local copy rather
// than fetched from the API, same as frontend/src/constants/safetyOptions.js
// mirroring backend/constants/safetyOptions.js — this is UI-only gating,
// never the actual authorization boundary, which is enforced server-side by
// every /api/admin/* route via backend/middleware/adminAuth.js regardless of
// what this component does).
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

// Role-gated variant of ProtectedRoute.jsx (Task #11 — Admin panel, see
// docs/ROADMAP.md's Phase 9) — same loading/redirect-to-login shape, plus an
// additional check against `user.role` (now returned by `GET /api/auth/me`,
// see backend/routes/auth.js's toPublicUser()). A logged-in non-admin is
// redirected to /dashboard, not shown a "forbidden" screen — per the task
// spec, the admin section must be effectively invisible to regular users,
// not just blocked, so there is nothing here (no error message, no flash of
// admin UI before redirecting) that reveals the section exists.
function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!ADMIN_ROLES.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default AdminRoute;
