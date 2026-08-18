# Bug Tracker — CG-Dating-App

This file tracks known bugs (open and fixed) so fixes can be turned into regression
tests and so we never re-introduce the same issue silently. Add a new entry using the
template below whenever a bug is found; update its `Status` as it moves through the
pipeline instead of deleting it.

## Severity Legend

- **P0 — Critical:** App/feature is unusable, data loss, security vulnerability, or
  production outage. Fix immediately.
- **P1 — High:** Major feature broken or badly degraded for many users, no reasonable
  workaround. Fix before next release.
- **P2 — Medium:** Feature partially broken or broken in an edge case; workaround
  exists. Fix in a normal work cycle.
- **P3 — Low:** Cosmetic, minor UX annoyance, or very low-impact edge case. Fix when
  convenient.

## Entry Template

```
### BUG-XXX: <short title>
- Severity: P0 | P1 | P2 | P3
- Steps to reproduce:
  1.
  2.
- Expected behavior:
- Actual behavior:
- Status: Open | In Progress | Fixed | Won't Fix | Duplicate
- Fix: <link to commit/PR once fixed>
- Regression test: <link to the test added to prevent recurrence>
```

## Open / Known Bugs

### BUG-001: No rate limiting beyond login/signup, and no security-headers middleware
- Severity: P1
- Steps to reproduce:
  1. Send a large burst of requests (>100) to any authenticated route other than
     `POST /api/auth/login` / `POST /api/auth/signup` (e.g. repeatedly `POST` a chat
     message via `POST /api/matches/:matchId/messages`, or hammer any other route) from
     a single client.
  2. Observe there is no `429` response at any volume — `backend/server.js` has no
     general-purpose rate-limiting middleware mounted, and no individual route outside
     `routes/auth.js` (fixed in Task #6, see `docs/SECURITY_AUDIT.md`) and the OTP
     endpoints (already had their own bespoke DB-backed limiter, see
     `backend/utils/verificationUtils.js`) has one either.
  3. Separately, inspect any response's headers (`curl -i http://localhost:5000/api/
     health`) — there is no `helmet` (or equivalent) middleware setting standard
     security headers (`X-Content-Type-Options`, `Strict-Transport-Security` in
     production, a restrictive `Content-Security-Policy`, etc.).
- Expected behavior: per `docs/ARCHITECTURE.md`'s security requirements ("Rate
  limiting on sensitive endpoints (auth, OTP, messaging, AI endpoints)") and
  `docs/TESTING_STRATEGY.md`'s security checklist, messaging and other
  higher-volume authenticated endpoints should have reasonable rate limits, and
  standard security response headers should be present on every response.
- Actual behavior: only `POST /api/auth/login` and `POST /api/auth/signup` are rate
  limited (added in Task #6's security audit pass, see `docs/SECURITY_AUDIT.md`); OTP
  requests have their own separate limiter. Nothing else is rate limited, and no
  security-headers middleware exists anywhere in `backend/server.js`.
- Status: Open
- Fix: Not yet — this is Phase 14 (Security Hardening, cross-cutting, not yet started
  per `docs/ROADMAP.md`)'s scope, not a quick fix; deliberately not attempted piecemeal
  in Task #6's polish pass to avoid a half-done hardening effort. Suggested next steps
  when Phase 14 starts: mount `helmet()` globally in `backend/server.js`; add a
  moderate per-user (not just per-IP, since authenticated routes have `req.user.id`)
  rate limiter to the message-send route and any other high-frequency authenticated
  endpoint; revisit the wide-open CORS policy (`app.use(cors())`, no origin allowlist)
  at the same time, since production HTTPS/hosting setup (`docs/ARCHITECTURE.md`'s
  Phase 15) will fix the frontend's real origin.
- Regression test: none yet — no automated test suite exists in this project yet (see
  `docs/TESTING_STRATEGY.md`, `TODO.md`'s "Before real production launch" section).
