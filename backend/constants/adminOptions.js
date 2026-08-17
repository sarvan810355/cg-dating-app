// Shared enums/config for the Admin panel (Task #11 in the internal
// TaskList; = docs/ROADMAP.md's Phase 9). Kept in one place so the User
// model, adminAuth middleware, and admin routes all agree on the same
// values — same convention as backend/constants/safetyOptions.js /
// verificationOptions.js.

// User roles. Simplified from docs/DATABASE_SCHEMA.md's originally-drafted
// 6-value enum (USER, SUPER_ADMIN, ADMIN, MODERATOR, SUPPORT, ANALYST) down
// to the 4 values this basic moderation panel actually needs — SUPPORT and
// ANALYST have no routes/permissions defined anywhere in this pass (no
// analytics dashboard yet, that's the future Task #13/Phase 12; no
// dedicated support-only queue), so adding them now would just be two enum
// values nothing ever checks. They can be reintroduced, and this enum
// widened, whenever a route actually needs to distinguish them — see the
// divergence note this task adds to docs/DATABASE_SCHEMA.md.
const USER_ROLES = ['USER', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

// Roles that can reach ANY /api/admin route at all (the broadest tier —
// individual routes further restrict to a subset of this list, e.g.
// suspend/reinstate/role-change require more than MODERATOR — see
// backend/routes/admin.js and docs/API_DOCUMENTATION.md's Admin section for
// the exact role required per route). Also used by the frontend's role gate
// (frontend/src/components/AdminRoute.jsx) to decide whether the admin
// section is even shown in navigation.
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

// Roles allowed to suspend/reinstate a user account — tighter than the full
// ADMIN_ROLES set (a MODERATOR can review reports/verifications but not
// take an account-level suspension action).
const SUSPEND_ROLES = ['SUPER_ADMIN', 'ADMIN'];

// Account status — a suspended account is blocked at login (backend/routes/
// auth.js) and excluded from discovery (backend/routes/discovery.js).
// Deliberately just two values for this basic pass — no BANNED/DELETED yet
// (see docs/DATABASE_SCHEMA.md's `users.status` draft for the fuller future
// enum); suspension is reversible (PATCH /api/admin/users/:userId/reinstate)
// and there is no permanent-ban or account-deletion flow built in this pass.
const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED'];

module.exports = { USER_ROLES, ADMIN_ROLES, SUSPEND_ROLES, ACCOUNT_STATUSES };
