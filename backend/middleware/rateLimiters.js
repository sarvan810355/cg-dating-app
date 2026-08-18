// Rate limiters for the auth endpoints (Task #6 — final polish / security
// audit). Nothing in this codebase limited login/signup attempts before this
// pass — see docs/ARCHITECTURE.md's security requirements ("Rate limiting on
// sensitive endpoints (auth, OTP, messaging, AI endpoints)") and
// docs/TESTING_STRATEGY.md's security checklist ("Rate limit checks on auth,
// OTP, messaging, and AI endpoints"). OTP requests already have their own
// bespoke rate limiting (backend/utils/verificationUtils.js, per-user and
// DB-backed since it needs to survive across server restarts); this file
// covers the simpler per-IP case for auth, which has no other natural key
// before a user is authenticated.
//
// Scope note: this pass only wires up login/signup, the highest-severity gap
// (unlimited credential-stuffing / mass-account-creation attempts against an
// unauthenticated endpoint). A full sweep of every "sensitive endpoint" in
// docs/ARCHITECTURE.md's list (messaging, etc.) is Phase 14 (Security
// Hardening, cross-cutting, not yet started per docs/ROADMAP.md) — tracked as
// BUG-001 in BUGS.md rather than attempted wholesale here.
const rateLimit = require('express-rate-limit');

// 20 attempts per 15 minutes per IP is generous enough not to lock out a
// household/office NAT sharing one IP under normal use, while still cutting
// off scripted brute-force/credential-stuffing attempts, which typically
// need far more than 20 tries to be useful.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
});

// Signup abuse (mass fake-account creation) is lower-frequency by nature; a
// slightly tighter window is fine.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many signup attempts from this network. Please try again later.' },
});

module.exports = { loginLimiter, signupLimiter };
