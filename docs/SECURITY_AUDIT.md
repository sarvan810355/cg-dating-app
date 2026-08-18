# Security Audit — CG-Dating-App (Task #6, Final Polish Pass)

Audit performed 2026-08-18, at the end of the MVP build (all 11 prior feature tasks
landed — see `PROJECT_STATE.md`/`IMPLEMENTATION_PROGRESS.md`). Scope: the security
requirements listed in `docs/ARCHITECTURE.md`'s "Security & Privacy" section and
`docs/TESTING_STRATEGY.md`'s security checklist, checked against the actual code in
`backend/` as it exists today. This is a point-in-time review of the code, not a
penetration test, and — like every other DB-dependent check in this project's history
— could not be exercised against a live MongoDB (see `MOCK_FEATURES.md`'s standing
sandbox-limitation note).

## Summary

The codebase is in good shape. Every route requiring authentication uses
`requireAuth`; every admin route additionally uses role-gated `requireRole(...)`;
sensitive fields (OTP hashes/timestamps, report review notes) already use Mongoose's
`select: false`; regex inputs are escaped before being used in queries; `:id`/`:userId`
route params are validated with `mongoose.Types.ObjectId.isValid()` before use; no
secrets are hardcoded anywhere in the codebase or git history. Two real gaps were
found and fixed directly in this pass (see below); the remaining gaps are pre-existing,
already-scoped-out MVP items (already tracked as unchecked in `TODO.md` before this
pass) that are correctly deferred to Phase 14 (Security Hardening, cross-cutting, not
yet started per `docs/ROADMAP.md`) rather than silently left undocumented — see
`BUGS.md` for the one now formally tracked.

## Checks performed

### 1. Hardcoded secrets

```
grep -rE "(API_KEY|SECRET|PASSWORD|PRIVATE_KEY|TOKEN)\s*[:=]\s*['\"][A-Za-z0-9+/=_-]{8,}" \
  --include=*.js --include=*.jsx --include=*.json backend frontend docs
```

No matches outside `node_modules` and `.env.example`. `backend/.env.example` and
`frontend/.env.example` contain only placeholder values (`replace_this_with_a_long_
random_secret`, a local `mongodb://localhost:27017/...` URI, etc.) — no real
credentials. `JWT_SECRET` is read exclusively from `process.env.JWT_SECRET`
(`backend/middleware/auth.js`, `backend/routes/auth.js`) with **no hardcoded fallback
default** — a missing env var fails token signing/verification loudly rather than
silently signing with a guessable constant, which is the safer failure mode.

**Result: pass, no findings.**

### 2. `.env` never committed

```
git log --all --full-history -- backend/.env
git log --all --full-history -- frontend/.env
git ls-files | grep -i '\.env$'
```

All three commands return empty. No `.env` file has ever existed in git history on
any branch, and both are correctly listed in the root `.gitignore`.

**Result: pass, no findings.**

### 3. Every sensitive route uses `requireAuth`; admin routes use `requireRole`

Every route file was checked (`grep -nE "router\.(get|post|patch|put|delete)\("` across
`backend/routes/*.js`, cross-referenced against the route body). Findings:

- `GET /api/health` and `GET /api/plans` are the only two routes with no auth — both
  intentionally public (health check; plan listing needs to be visible pre-signup for
  a pricing page). Everything else — profile, discovery, matches, chat messages,
  notifications, verification, reports, blocks, subscription actions — uses
  `requireAuth`.
- Every route under `backend/routes/admin.js` uses `requireRole(...)` on top of
  `requireAuth` (`backend/middleware/adminAuth.js`), with three correctly separated
  tiers: `MODERATOR`+ for the dashboard/reports-queue/verification-queue, `ADMIN`+ for
  suspend/reinstate/user-list, `SUPER_ADMIN`-only for role changes — matching
  `docs/API_DOCUMENTATION.md`'s Admin section. `adminAuth.js` re-reads `role`/
  `accountStatus` from the database on every request rather than trusting the JWT
  payload (which only ever carries `{ id }`), so a demotion/suspension takes effect on
  the very next request, not only after the token expires.

**Result: pass, no findings.**

### 4. Sensitive fields never serialized to clients

- `User.password` — **did not have `select: false`** at the schema level (see Findings
  below); fixed in this pass.
- `User.mobileVerification.otpHash` / `.otpExpiresAt` / `.otpRequestTimestamps` — already
  `select: false` (`backend/models/User.js`).
- `User.photoVerification.reviewNotes` / `.reviewedBy` / `.reviewedAt` — already
  `select: false`.
- `Report.reviewNotes` — already `select: false`
  (`backend/models/Report.js`); `backend/routes/reports.js` explicitly documents ("never
  includes reviewNotes") that the reporter-facing response is a hand-built whitelist
  object, and `backend/routes/admin.js` is the only place that opts back in via
  `.select('+reviewNotes')`, exclusively on admin-only routes.

Spot-checked every serializer function actually used to build a client response
(`toPublicUser()` in `routes/auth.js`, `toOwnProfileJSON()`/`toPublicProfileJSON()` in
`utils/profileSerializers.js`, the inline whitelisted objects in `routes/admin.js`'s
user-list/report/verification handlers, `utils/subscriptionSerializers.js`): all of
them build a new object from named fields rather than returning a raw Mongoose
document or spreading `...user.toObject()`, so even before this pass's `select: false`
fix, the password hash was never actually reachable from any response in the current
codebase. The `select: false` addition (below) is defense-in-depth against a *future*
route being added carelessly, not a fix for an active leak.

**Result: one defense-in-depth gap found and fixed (see Findings).**

### 5. Injection / query-construction safety

Every place user input is used to build a Mongoose query filter was checked
(`grep -rn "new RegExp\|\.find({" backend/routes backend/utils`):

- The two places a client-supplied string becomes a `RegExp` (`routes/admin.js`'s
  email search, `routes/discovery.js`'s city filter) both pass the input through a
  local `escapeRegExp()` helper first — no ReDoS or regex-injection surface.
- No route splices `req.body`/`req.query`/`req.params` directly into a `.find()`
  filter object — every filter is built field-by-field from validated/coerced values
  (e.g. `filter.city = new RegExp(...)`, not `filter = req.query`), which also rules
  out a client injecting Mongo operators (`$where`, `$gt`, etc.) via a query param.
- Every route accepting an `:id`/`:userId`/`:matchId` path param validates it with
  `mongoose.Types.ObjectId.isValid(...)` before querying, avoiding both a raw
  `CastError` 500 and any malformed-input surface.

**Result: pass, no findings.**

### 6. Rate limiting on auth endpoints

`POST /api/auth/login` and `POST /api/auth/signup` had **no rate limiting at all** —
an unlimited number of login attempts (credential stuffing / brute force) or signups
(mass fake-account creation) could be made from a single IP. This is a real gap
against `docs/ARCHITECTURE.md`'s explicit security requirement ("Rate limiting on
sensitive endpoints (auth, OTP, messaging, AI endpoints)") and was already flagged as
an open, unchecked MVP item in `TODO.md` ("Rate limiting on auth endpoints") going
into this pass — not a regression introduced here, but a genuine, previously-known-but-
unaddressed hole.

Mobile OTP requests (`POST /api/verification/mobile/request-otp`) already have their
own bespoke, DB-backed, per-user rate limiting (max 3 requests per rolling 10-minute
window — `backend/utils/verificationUtils.js`), so that endpoint was not part of this
finding.

**Result: real finding, fixed in this pass for the two highest-severity unauthenticated
endpoints — see Findings below.** Rate limiting the remaining "sensitive endpoints"
`docs/ARCHITECTURE.md` names (chat messaging, and any future AI endpoints) is left to
Phase 14 and tracked as BUG-001 rather than attempted here (see "What was flagged
instead of fixed").

### 7. Dependency vulnerabilities

`npm audit` in `backend/` reported 3 vulnerabilities (2 high, 1 critical) in `tar`
(pulled in transitively by `bcrypt@5.x`'s native-binary installer, `@mapbox/node-pre-
gyp`) — install-time supply-chain risk (arbitrary file write during `npm install` via a
malicious tarball), not a runtime risk for the deployed app, but still worth closing.
`frontend/` reported 0 vulnerabilities.

**Result: fixed in this pass — see Findings.**

## Findings

### Fixed directly in this pass

1. **`User.password` now has `select: false`** (`backend/models/User.js`), with the one
   route that needs the hash — `POST /api/auth/login` (`backend/routes/auth.js`) —
   updated to `.select('+password')` explicitly. Verified with a standalone script
   (fake in-memory `User` model mounted under the real `routes/auth.js`, following this
   project's established "fake model over real HTTP" convention — see
   `IMPLEMENTATION_PROGRESS.md`'s prior entries) that: signup, login (correct
   password), login (wrong password → 401), and `GET /api/auth/me` all still work
   correctly and none of their responses ever contain a `password` key. Script deleted
   before commit per project convention.
2. **Rate limiting added to `POST /api/auth/login` and `POST /api/auth/signup`**
   (`backend/middleware/rateLimiters.js`, using `express-rate-limit`): login capped at
   20 attempts / 15 minutes per IP, signup at 10 / hour per IP, both returning `429`
   with a plain-language message once exceeded. Verified with a standalone script
   (rate limiter mounted on a minimal Express app, no DB dependency needed) sending 25
   requests: the first 20 returned `200`, the remaining 5 returned `429`, exactly as
   configured. Script deleted before commit.
3. **`bcrypt` upgraded `5.1.1` → `6.0.0`** to close the transitive `tar`/`node-pre-gyp`
   critical vulnerability (`npm audit fix` alone wouldn't take it, since it's a major
   version bump — done manually and verified). `npm audit` now reports 0
   vulnerabilities in `backend/`. Verified `bcrypt.hash`/`.compare`/`.hashSync`/
   `.compareSync` all still work correctly via a standalone script (hash a password,
   confirm a correct-password compare returns `true` and a wrong-password compare
   returns `false`) — bcrypt 6's public API (`hash`/`compare`/`genSalt`, sync
   variants) is unchanged from 5.x, only its minimum supported Node version moved to
   Node 18+ (this project already targets Node 20+, see `SETUP.md`). Also confirmed the
   backend still boots cleanly (`node -e "require('./server.js')"`) after the bump.

None of these three required a live MongoDB to verify (the rate limiter has no DB
dependency at all; the password-select change was verified via the fake-model
convention; the bcrypt bump was verified with pure hash/compare calls) — see
"Known remaining gap: live-DB verification" below for what's still outstanding.

### What was flagged instead of fixed

One gap was judged too large to fix directly in a polish pass (would mean building out
a chunk of Phase 14 — Security Hardening — rather than auditing/polishing the existing
MVP) and is now tracked as **BUG-001** in `BUGS.md` (P1):

- **No rate limiting beyond login/signup**, and **no `helmet` (or equivalent) security-
  headers middleware**, anywhere in `backend/server.js`. `docs/ARCHITECTURE.md`'s
  security list also calls out rate limiting on messaging and (future) AI endpoints,
  and general "input validation on all endpoints" beyond the field-level checks each
  route already does inline. This is legitimately Phase 14's whole scope (cross-
  cutting, not yet started per `docs/ROADMAP.md`) — see BUG-001 for the full writeup
  and suggested next steps.

### Known remaining gap: live-DB verification

Every check and fix in this audit was verified either by direct code inspection, a
standalone script against a fake in-memory model (this project's established
convention when no real MongoDB is reachable), or a server-boot + `curl` smoke test.
**None of it has been exercised against a real MongoDB** — this is the same standing
sandbox limitation every prior task in this project has hit (see `MOCK_FEATURES.md`'s
first entry), not something new to this pass. In particular, `select: false`'s actual
projection behavior happens at the MongoDB query-execution layer; the fake-model
script confirms the *application logic* around it is correct, but the very first time
this runs against a real database should include a quick manual check (`GET /api/auth/
me` response, or a `mongosh` `findOne` vs. the API response) that `password` is indeed
absent.

## Not re-litigated in this pass

The following were already correctly implemented by prior tasks and were spot-checked
but not changed:

- Password hashing uses `bcrypt` with `SALT_ROUNDS = 10` (`routes/auth.js`) — reasonable
  for this stage; no plaintext password storage anywhere.
- JWTs are signed with `HS256` (jsonwebtoken's default) using `JWT_SECRET`, 7-day
  expiry, verified in exactly one place (`middleware/auth.js#verifyToken()`) reused by
  both the HTTP middleware and the Socket.IO handshake — no duplicate/divergent
  verification logic to drift out of sync.
- Login intentionally returns the same generic "Invalid email or password" message for
  a wrong password, a nonexistent email, *and* a wrong password against a suspended
  account — anti-enumeration and anti-status-leak, both already correct.
- CORS is currently wide open (`app.use(cors())`, no origin allowlist) — acceptable for
  this stage since auth is bearer-token-only (`Authorization` header, no cookies), so
  there's no CSRF surface from permissive CORS the way there would be with cookie-based
  sessions; still worth tightening to an explicit origin allowlist before real
  production deployment (folded into `TODO.md`'s "Before real production launch"
  section as part of the general hosting/HTTPS setup).
