// Role-checking middleware for the Admin panel (Task #11 in the internal
// TaskList; = docs/ROADMAP.md's Phase 9). Deliberately does NOT re-verify
// the JWT itself — it always runs AFTER backend/middleware/auth.js's
// `requireAuth`, which already decoded the token and set `req.user.id`, and
// there is exactly one place in this codebase that owns JWT secret/token
// handling (see auth.js's own header comment, also shared with the
// Socket.IO handshake). This file only adds the extra "does this
// already-authenticated user have an allowed role" check on top.

const User = require('../models/User');

// Returns an Express middleware that 403s unless the caller's `role` is one
// of `allowedRoles`. Usage: `router.get('/dashboard', requireAuth,
// requireRole('ADMIN', 'SUPER_ADMIN', 'MODERATOR'), handler)`.
//
// Loads the user's current `role`/`accountStatus` fresh from the database on
// every call (rather than trusting anything from the JWT payload, which only
// ever carries `{ id }` — see backend/middleware/auth.js) so a role change
// or suspension takes effect immediately on the next request, not only after
// the caller's token expires and they log in again. The loaded user is
// attached to `req.adminActor` (and `role` merged onto `req.user`) so
// downstream route handlers — which all need to know "who is the acting
// admin" for audit logging — don't have to re-fetch it themselves.
function requireRole(...allowedRoles) {
  return async function adminAuth(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        // Should be unreachable in practice (requireAuth always runs first
        // and already 401s), but fail closed rather than assume.
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
      }

      const user = await User.findById(req.user.id).select('role email accountStatus');
      if (!user) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: 'You do not have permission to perform this action' });
      }

      req.user.role = user.role;
      req.user.email = user.email;
      req.adminActor = user;
      return next();
    } catch (err) {
      console.error('adminAuth error:', err);
      return res.status(500).json({ message: 'Something went wrong, please try again' });
    }
  };
}

module.exports = { requireRole };
