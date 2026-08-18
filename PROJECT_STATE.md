Project: CG-Dating-App
Current Phase: MVP (Phases 0-10 per docs/ROADMAP.md) is **complete**. Task #6 (Final
polish, security audit, documentation wrap-up) closed out the last of the 12 internal
tasks that made up the MVP build. Since then, post-MVP V2 features have been added by
explicit user request: Instagram profile linking (self-reported handle, not OAuth),
Why-You-Match + Smart Icebreakers (Task #15, deterministic heuristics, not real AI),
and a Referral program / "Invite & Earn" (Task #17 — see "Current Task" below and
MOCK_FEATURES.md). Other V2 work (Safe Date/Date Planner, Boost/Priority Like, etc.)
may be in progress concurrently on this branch — check `git log` for the true current
state rather than trusting this narrative alone.
Phases 13/14/15 (Testing, full Security Hardening, Deployment) remain cross-cutting
work not yet started — see "Remaining Features" below and docs/ROADMAP.md.
Current Task: **V2 feature, user-requested: Task #17 — Referral program ("Invite &
Earn")**, added 2026-08-18. Every user gets a unique, human-shareable 7-character
referral code (uppercase alphanumeric, excluding ambiguous `0`/`O`/`1`/`I`) generated
at signup time (`backend/utils/referralUtils.js#generateUniqueReferralCode()` —
pre-checked uniqueness with retry-on-collision, the schema's own `unique` index as
the final guard). `POST /api/auth/signup` (`backend/routes/auth.js`) accepts an
optional `referralCode` in the body: a valid, existing code links the new user's
`referredBy` (ref `User`, `backend/models/User.js`, `immutable: true` — schema-level,
settable exactly once, ever) to the code owner, and **synchronously grants both sides
a reward** — 7 days of `CG_PLUS` each, via a new `Subscription` document
(`paymentProvider: 'referral_reward'`, added to `PAYMENT_PROVIDERS` in
`backend/constants/subscriptionOptions.js`) — reusing Task #12's existing
Subscription/Plan/`hasFeature()` entitlement system rather than inventing a new
currency (grepped the codebase at implementation time: neither "boost credits" nor
"priority likes" existed yet, so this was the documented safe default; see
`backend/utils/referralUtils.js#grantReferralReward()`/`grantMutualReferralReward()`).
**Documented UX choice:** an invalid-format or unknown/typo'd code never rejects the
signup — the account is still created (`201`), just without a referral link, only
logged as a warning server-side — the more user-friendly of the two options the task
spec offered, matching how real referral programs behave. New `GET /api/referrals/me`
(`backend/routes/referrals.js`) returns the caller's own code, a shareable invite
string (`"Join CG Dating with my code: <CODE>"` — no real deep-link infra, see
MOCK_FEATURES.md), their referral count (`User.countDocuments({ referredBy })`, not a
denormalized counter), and their latest few reward grants. No route anywhere can
retroactively link/relink a referral after signup (only `GET /me` exists on this
router; `referredBy`'s `immutable` schema constraint is the second, independent
guard). Frontend: new `frontend/src/pages/Referrals.jsx` ("Invite & Earn" — code
display, copy-to-clipboard invite text, referral count, recent rewards list), linked
from `frontend/src/pages/Settings.jsx`; `frontend/src/pages/Signup.jsx` gained an
optional "Referral code" field (prefillable from a `?ref=<CODE>` query param);
`frontend/src/context/AuthContext.jsx#signup()` and `frontend/src/api.js#signup()`
both extended additively (new optional trailing `referralCode` param). Concurrency
note: this task was built alongside Task #15 (Icebreakers, touching Match/matches.js)
and Task #18 (Safe Date/Date Planner, new files) on the same branch — this task's own
changes were scoped to `User.js`/`auth.js` plus new files, kept additive, and rebased
onto both other tasks' work before the final push (see `git log` for the merge). See
`IMPLEMENTATION_PROGRESS.md`'s newest entry for the full verification detail.
Before this, Task #15 — Smart Icebreakers + Why-You-Match, added 2026-08-18. Two
deterministic, heuristic-based features — this project has no `ANTHROPIC_API_KEY`
configured anywhere (see `backend/.env.example` — only
`PORT`/`MONGODB_URI`/`JWT_SECRET` exist), so neither calls a real LLM; both compare
the two participants' actual `Profile` documents and fill fixed templates. Backend:
`backend/utils/compatibilityUtils.js` (new — `computeCompatibility(profileA,
profileB)` returns `{ score: 0-100, reasons: string[] (0-5) }`), `backend/utils/
icebreakerUtils.js` (new — `generateIcebreakers(profileA, profileB)` returns a pool
of 3-6 template-filled conversation starters), `backend/routes/matches.js` (each row
of `GET /api/matches` now includes a `compatibility` field; new
`GET /api/matches/:matchId/compatibility` and `GET /api/matches/:matchId/
icebreakers`). Frontend: `frontend/src/components/CompatibilityBadge.jsx` (new),
`frontend/src/components/MatchModal.jsx`, `frontend/src/pages/Matches.jsx`,
`frontend/src/pages/Chat.jsx`, `frontend/src/api.js` (new
`getMatchCompatibility()`/`getMatchIcebreakers()`). See `IMPLEMENTATION_PROGRESS.md`
for the full detail on this earlier entry.
Before that, post-MVP feature addition: Instagram profile linking, added 2026-08-18 by
explicit user request after the MVP had already shipped. Self-reported
`instagramHandle` field on Profile — **not real Instagram OAuth** (no Meta Developer
app registered for this project, same mocked-external-integration pattern as SMS/OTP,
Cloudinary, Razorpay, FCM). Backend: `backend/models/Profile.js` (new nullable field +
schema-level format validator), `backend/routes/profile.js` (extended the existing
`PUT /api/profile/me` partial-merge body, no new endpoint), `backend/utils/
profileSerializers.js` (included in both the own- and public-profile serializers —
also surfaces on the discovery feed, which reuses the public serializer directly),
`backend/utils/profileUtils.js` (+5 bonus to `profileCompletionPercentage` when
filled, never required). Frontend: `frontend/src/pages/ProfileBuilder.jsx` (new
"Social" section, client-side validation mirroring the backend regex),
`frontend/src/pages/Discovery.jsx` (a small `📷 @handle` badge linking out to
Instagram, `target="_blank"`/`rel="noopener noreferrer"`).
Before that, Task #6 — Final polish, security/performance audit, documentation
wrap-up (the last of the original MVP build). Scope actually covered: (1) full
build/lint/boot verification pass across frontend and backend; (2) a security audit
against docs/ARCHITECTURE.md's security requirements and docs/TESTING_STRATEGY.md's
security checklist, with two real findings fixed directly (see below) and one larger
gap formally tracked as BUG-001 rather than half-fixed; (3) a light UI consistency
spot-check across Discovery/Matches/Chat/Notifications/Admin (found already-solid —
every screen already has loading/error/empty states via a single shared `api.js`
request() helper, and dark-mode tokens are already wired consistently — no changes
needed there); (4) this full documentation wrap-up pass (PROJECT_STATE.md,
IMPLEMENTATION_PROGRESS.md, TODO.md, MOCK_FEATURES.md, README.md, docs/ROADMAP.md,
BUGS.md, and the new docs/SECURITY_AUDIT.md).
Completed Features: Project scaffold (Express backend, React/Vite/Tailwind frontend,
Mongoose placeholder models, README, .gitignore) — commit fd72a17; Authentication
(signup/login/JWT, protected /me) — commit 3f440ca; Profile system (model, CRUD API,
completion score, multi-step profile builder UI) — commit 00c29f3; Discovery +
Matching (Like/Match models, discovery feed with pagination + basic filters, swipe API
with mutual-match detection, matches list, discovery/match UI) — commit f86267a; Chat
(Message model, GET/POST/PATCH /api/matches/:matchId/messages, Socket.IO real-time
layer with JWT handshake auth, typing indicator, read receipts, real chat UI) — commit
f027d73; Notifications (Notification model, GET/PATCH/PUT /api/notifications* routes,
match/like/message notification creation with per-type preference gating, live
notification:new Socket.IO event, bell/badge + dropdown notification center, Settings
preference toggles) — commit cc7fb76; Verification (mobile OTP + photo verification
sub-documents/routes, MOCK/DEV-ONLY SMS delivery, verification badges) — commit
0d724fe; Safety (Report + Block models/routes, bidirectional block exclusion across
discovery/matches/messages/sockets, Safety Center) — commit 2ab2aca; Subscription
scaffolding (Plan/Subscription models, GET /api/plans, GET/POST /api/subscription/*,
server-side hasFeature() entitlement check, MOCK checkout) — commit 9319600; Admin
Panel (role/accountStatus on User, role-gated /api/admin/* routes, AuditLog on every
mutation, role-gated /admin frontend section) — commit 093d0bc; **Final polish,
security audit, and documentation wrap-up (Task #6, this pass)** — see this entry's
own commit: `User.password` now `select: false` (with `POST /api/auth/login` updated
to `.select('+password')` explicitly) as a defense-in-depth hardening (no active leak
existed — every route already built hand-picked response objects, verified by
spot-checking every serializer in the codebase); rate limiting added to `POST
/api/auth/login` (20/15min/IP) and `POST /api/auth/signup` (10/hour/IP) via
`backend/middleware/rateLimiters.js` (`express-rate-limit`) — previously *zero* rate
limiting existed on either endpoint; `bcrypt` upgraded `5.1.1` → `6.0.0`, closing a
critical transitive `npm audit` finding in `node-tar` (`backend/`'s `npm audit` now
reports 0 vulnerabilities); new `docs/SECURITY_AUDIT.md` documenting the full audit;
BUG-001 (P1) filed for the larger, deliberately-not-attempted-here remaining gap
(no rate limiting beyond auth, no `helmet`/security-headers middleware — real Phase 14
scope). See docs/SECURITY_AUDIT.md for the complete audit writeup.
Features In Progress: None — the MVP (Phases 0-10) is complete. Next work is either V2
feature scope or the cross-cutting Phases 13-15 (Testing, full Security Hardening,
Deployment) — see "Next Exact Task" below.
Remaining Features (all deliberately out of MVP scope, not gaps in this pass): AI
Profile Coach and AI Date Ideas (V2, would need a real Claude API integration — see
MOCK_FEATURES.md; Why-You-Match and Smart Icebreakers are now implemented as
deterministic heuristics instead — see "Current Task" above), Private/Invisible
browsing, advanced filters, Profile Boost, Priority Like, real Razorpay integration,
voice/video calling (all V2 — Referral program is now implemented, see "Current Task"
above; Safe Date mode and Date Planner may also be implemented or in progress
concurrently on this branch by now; check `git log` rather than trusting this line);
CG Connect/Events, advanced Trust Engine, ML
recommendations, advanced admin
analytics, statewide/national expansion, city-scale SEO pages, Capacitor native wrapper
(all V3). Also still deferred within already-shipped MVP features (unchanged from
before this pass, see TODO.md for the full list): a persisted `preferences` collection
(age range/distance filters), unmatch, "who liked you" reveal screen, image/voice chat
messages, matches-list last-message preview/unread badge, real FCM push delivery, real
SMS/OTP provider delivery, real Razorpay integration, report evidence file upload,
automated spam/scam/abuse detection ("Trust Engine"), `GET /api/admin/audit-logs` (the
model/index exist, nothing reads them back yet), permanent ban/account-deletion (suspend/
reinstate only, reversible).
Known Bugs: BUG-001 (P1) — no rate limiting beyond login/signup, no security-headers
middleware; see BUGS.md and docs/SECURITY_AUDIT.md. No other bugs found in this pass's
audit/consistency check.
Known Technical Debt: MongoDB connection has **never** been verified against a live
database in any sandbox session across this entire project (no mongod/Docker/network
access to MongoDB binaries available in any of these sandboxes) — this remains the
single largest item blocking real end-to-end verification of every index, every
`select: false` field, every unique constraint (Block's compound unique index,
Match's canonical-pair unique index, User.email's unique index) in this codebase; see
"Before real production launch" in TODO.md. `users.phone` is still not unique-indexed.
Cloudinary/Firebase/Razorpay/Claude API integrations remain unconfigured — see
MOCK_FEATURES.md for the complete, consolidated list (photo storage, SMS/OTP delivery,
FCM push, Razorpay checkout are all MOCK/TEMPORARY). Discovery has no geo/distance
filtering yet. Chat is text-only. Report evidence is plain strings, no file upload. No
automated test suite exists in either backend/ or frontend/ (see
docs/TESTING_STRATEGY.md). BUG-001 (rate limiting/security headers beyond auth) is
newly tracked in this pass — see above.
Last Successful Test (Task #17 — Referral program, this pass): Backend —
`node -e "require('./server.js')"` boots cleanly (both alone and alongside Task #18's
concurrently-added `safeDates`/`dateIdeas` routers already present on the shared
`server.js`), no import/syntax errors; `GET /api/health` 200; `curl` with no
`Authorization` header on `GET /api/referrals/me` returned 401. A standalone Node
script (`backend/__verify_referrals_tmp.js`, run from inside `backend/` so
`node_modules` resolved, deleted before commit per this project's established
convention) did two things without any live DB connection: (1) loaded the REAL
`backend/models/User.js` Mongoose schema directly and proved `referredBy`'s
`immutable: true` constraint actually blocks reassignment (both plain-property
assignment and `.set()`) once a document is no longer new, while still allowing the
initial set on a brand-new document, and confirmed the schema declares `unique: true`
on `referralCode`; (2) hijacked `require.cache` for `models/User.js`/`Plan.js`/
`Subscription.js` with fake in-memory stores and mounted the REAL
`backend/routes/auth.js` + `backend/routes/referrals.js` over real HTTP (same
fake-model-over-real-route pattern already used in this project's Task #6 security
verification) to exercise the full flow end-to-end: a referrer signup with no code
gets a 7-char code and `referredBy: null`; a referee signup with that valid code
succeeds, links `referredBy` to the referrer, and creates exactly 2 new
`Subscription` rows (`paymentProvider: 'referral_reward'`, `CG_PLUS`, ~7-day
`expiresAt`) — one per side; a malformed code (`"nope!!"`) and a well-formed-but-
unknown code (`"ZZZZZZZ"`) both still let signup succeed with no referral link and no
reward rows created; `GET /api/referrals/me` for the referrer returned the correct
code, a `shareText` containing it, `referralCount: 1`, and exactly 1 reward entry
(`planCode: 'CG_PLUS'`); the same route without a token returned 401. All 26 checks
passed. Frontend — `npm run build` clean (no errors); `npm run lint` (oxlint) — 0
errors, the same 2 pre-existing `only-export-components` warnings carried forward, no
new warnings.
Last Successful Test (Task #15 — Why-You-Match + Smart Icebreakers, prior pass):
Backend — the already-running dev server (`nodemon`) picked up the new route file
changes cleanly (no crash/restart-loop); `GET /api/health` 200; `curl` with no
`Authorization` header on `GET /api/matches`, `GET /api/matches/:matchId/compatibility`,
and `GET /api/matches/:matchId/icebreakers` all returned 401 as expected. A standalone
Node script (`backend/_verify_task15.js`, deleted before commit per this project's
established convention) exercised `computeCompatibility()` and `generateIcebreakers()`
directly with realistic fake `Profile` objects, no DB connection needed: identical
profiles scored 100 with 5 reasons covering every category (intention/city/interests/
language/lifestyle/prompts); fully disjoint profiles scored exactly 0 with an empty
`reasons` array (no fabricated reasons) and an icebreaker pool drawn entirely from the
generic fallback list (never "Hi"/"Hello"); a partial-overlap case correctly omitted
the dating-intention reason once that field was made to differ, and correctly capped
the interest-list reason at 3 shared interests, joined naturally ("A, B and C"); a
missing/null profile on either side never threw, returning a neutral zero-score/empty
result for compatibility and the generic fallback pool for icebreakers; icebreaker
pools were confirmed duplicate-free and always within the documented 3-6 size range.
All checks passed — see IMPLEMENTATION_PROGRESS.md's newest entry for the full detail.
Frontend — `npm run build` clean; `npm run lint` (oxlint) — 0 errors, same 2
pre-existing warnings carried forward (unrelated to this change).
Last Successful Test (Instagram linking, prior pass): Backend — `node -e
"require('./server.js')"` boots cleanly, no import/syntax errors; `GET /api/health`
200; `curl -X PUT /api/profile/me` with no `Authorization` header still returns 401.
A standalone Node script (deleted before commit, per this project's established
convention) loaded the real `constants/profileOptions.js`, `models/Profile.js` (via
`validateSync()`, no DB connection), `utils/profileSerializers.js`, and
`utils/profileUtils.js` directly: confirmed the `instagramHandle` format regex
accepts/rejects the documented edge cases, the Mongoose schema validator matches it,
the route-level `@`-stripping/trimming normalization behaves as documented, both
serializers include the field (returning `null` rather than `undefined` when unset),
and the completion-score bonus is exactly +5 and never required to reach 100%. All
checks passed. Frontend — `npm run build` clean; `npm run lint` (oxlint) — 0 errors,
same 2 pre-existing warnings carried forward. See IMPLEMENTATION_PROGRESS.md's
newest entry for the full detail.
Last Successful Test (Task #6, prior pass): Frontend — `npm install` (no changes),
`npm run build` (clean, `dist/index.html` + JS/CSS chunks produced, no errors),
`npm run lint` (oxlint — 0 errors, the same 2 pre-existing `only-export-components`
warnings on AuthContext.jsx/NotificationContext.jsx carried forward from every prior
pass, no new warnings). Backend — `npm install` (bcrypt bumped to 6.0.0,
express-rate-limit added; `npm audit` now 0 vulnerabilities, was 3 [2 high, 1
critical] before this pass), `node -e "require('./server.js')"` boots cleanly and logs
"CG Dating backend listening on port 5000" with no syntax/import errors, `GET
/api/health` returns 200 `{"status":"ok","service":"cg-dating-app-backend"}`, server
process cleanly killable (no lingering port). Security fixes verified without a live
DB per this project's established convention: (1) a standalone script mounted a fake
in-memory `User` model (respecting `select`/`select('+password')` semantics) under the
REAL `backend/routes/auth.js` over real HTTP — signup, login (correct password, 200),
login (wrong password, 401), and `GET /api/auth/me` (200) all verified to never
include a `password` key in any response, and `role` still present on `/me`; (2) a
second standalone script mounted the real `loginLimiter` middleware on a minimal
Express app (no DB dependency) and sent 25 requests — the first 20 returned 200, the
remaining 5 returned 429, exactly as configured; (3) `bcrypt.hash`/`.compare`/
`.hashSync`/`.compareSync` round-tripped correctly post-upgrade via a standalone
script. Both scripts deleted before commit per this project's established "verify with
throwaway scripts, never commit them" convention. Security/consistency audit itself:
grepped the full codebase for hardcoded secrets (none found outside `.env.example`
placeholders), confirmed `backend/.env`/`frontend/.env` have never been committed
(`git log --all --full-history` empty for both), spot-checked every route file for
`requireAuth`/`requireRole` coverage (complete), spot-checked every response
serializer for raw-document leakage (none found), spot-checked regex-construction
sites for injection safety (both escape input correctly), spot-checked `:id` route
params for ObjectId validation (consistently present). Frontend consistency
spot-check: dark-mode/design-token usage confirmed consistent (no hardcoded hex colors
found outside `index.css`'s token definitions across any `.jsx` file), loading/error/
empty states confirmed present on Discovery, Matches, Chat, NotificationBell, and all
four Admin screens (all funnel through `frontend/src/api.js`'s single `request()`
helper, which attaches `.status`/`.data` to thrown errors consistently) — no changes
needed.
Last Modified Files (Task #17 — Referral program, this pass): backend/constants/
referralOptions.js (new), backend/utils/referralUtils.js (new), backend/routes/
referrals.js (new), backend/models/User.js (new referralCode/referredBy fields +
indexes), backend/routes/auth.js (signup accepts optional referralCode, generates a
code for every new user, links + rewards on a valid code), backend/constants/
subscriptionOptions.js (added 'referral_reward' to PAYMENT_PROVIDERS), backend/
server.js (mounted referralsRouter), frontend/src/api.js (signup() gained an optional
referralCode param, new getMyReferrals()), frontend/src/context/AuthContext.jsx
(signup() passes referralCode through), frontend/src/pages/Signup.jsx (optional
referral code field, prefillable from ?ref=), frontend/src/pages/Referrals.jsx (new —
"Invite & Earn" page), frontend/src/pages/Settings.jsx (new "Invite & Earn" link),
frontend/src/App.jsx (new /referrals route), docs/DATABASE_SCHEMA.md,
docs/API_DOCUMENTATION.md, docs/BUSINESS_PLAN.md, MOCK_FEATURES.md, TODO.md, this
file, IMPLEMENTATION_PROGRESS.md.
Last Modified Files (Task #15 — Why-You-Match + Smart Icebreakers, prior pass):
backend/utils/compatibilityUtils.js (new), backend/utils/icebreakerUtils.js (new),
backend/routes/matches.js (compatibility field on GET /api/matches, new
GET /:matchId/compatibility + GET /:matchId/icebreakers routes),
frontend/src/components/CompatibilityBadge.jsx (new),
frontend/src/components/MatchModal.jsx (fetches + shows compatibility/icebreaker),
frontend/src/pages/Matches.jsx (compatibility badge per match card),
frontend/src/pages/Chat.jsx (compatibility badge, "Why you match" reasons strip,
icebreaker suggestion bar with Use/Generate another), frontend/src/api.js (new
getMatchCompatibility/getMatchIcebreakers), docs/DATABASE_SCHEMA.md,
docs/API_DOCUMENTATION.md, docs/ROADMAP.md, MOCK_FEATURES.md, TODO.md, this file,
IMPLEMENTATION_PROGRESS.md.
Last Modified Files (Instagram linking, prior pass): backend/constants/
profileOptions.js (new INSTAGRAM_HANDLE_REGEX), backend/models/Profile.js (new
instagramHandle field + validator), backend/routes/profile.js (PUT /me accepts
instagramHandle), backend/utils/profileSerializers.js (both serializers include it),
backend/utils/profileUtils.js (+5 completion-score bonus), frontend/src/constants/
profileOptions.js (mirrored regex + normalizeInstagramHandle helper),
frontend/src/pages/ProfileBuilder.jsx (new Social section), frontend/src/pages/
Discovery.jsx (Instagram badge on the discovery card), docs/DATABASE_SCHEMA.md,
docs/API_DOCUMENTATION.md, MOCK_FEATURES.md, TODO.md, this file,
IMPLEMENTATION_PROGRESS.md.
Last Modified Files (Task #6, prior pass): backend/models/User.js (password field now
`select: false`), backend/routes/auth.js (login route: `.select('+password')`; both
signup/login routes: rate limiter middleware applied), backend/middleware/
rateLimiters.js (new — loginLimiter/signupLimiter), backend/package.json /
package-lock.json (bcrypt 5.1.1 → 6.0.0, express-rate-limit added), docs/
SECURITY_AUDIT.md (new), BUGS.md (BUG-001 added), PROJECT_STATE.md (this file),
IMPLEMENTATION_PROGRESS.md, TODO.md, MOCK_FEATURES.md, README.md, docs/ROADMAP.md (all
updated to reflect final MVP-complete state — see git log for the exact diff).
Database Status: `User` gained `referralCode` (unique, sparse) and `referredBy`
(nullable ref, `immutable`) fields this pass (Task #17 — Referral program); `Profile`
gained `instagramHandle` in a prior pass. MongoDB/Mongoose schemas implemented for
User, Profile, Like, Match,
Message, Notification, Block, Report, Plan, Subscription, and AuditLog; no live DB
connection has ever been verified in any sandbox session across this entire project —
this remains the top technical-debt item (see "Known Technical Debt" and TODO.md's
"Before real production launch" section).
Backend Status: Express + Socket.IO server (same HTTP server) running with auth +
profile + discovery + matches + notifications + verification + reports + blocks +
subscription + referrals + admin routes (plus whatever Task #18 has added
concurrently — check `git log`). This pass added `GET /api/referrals/me` and
extended `POST /api/auth/signup` with an optional `referralCode` body field; every
other route unchanged in behavior. Boots cleanly; `GET /api/health` confirmed live.
Frontend Status: All screens from every prior pass unchanged this pass (consistency
spot-check found nothing requiring a fix — dark mode tokens and loading/error/empty
states already solid throughout). `npm run build`/`npm run lint` both clean.
Authentication Status: Implemented (signup/login/JWT/me endpoint), now with rate
limiting on both signup and login and the password hash never selected by default —
unchanged otherwise.
AI Status: **Why-You-Match and Smart Icebreakers implemented this pass (Task #15)** —
`backend/utils/compatibilityUtils.js` / `backend/utils/icebreakerUtils.js`, exposed via
`GET /api/matches` (`compatibility` field) and `GET /api/matches/:matchId/
compatibility` / `.../icebreakers`. **Not a real Claude API integration** — no
`ANTHROPIC_API_KEY` is configured anywhere in this project (see
`backend/.env.example`), so both are deterministic, server-side profile-comparison
heuristics instead; see MOCK_FEATURES.md for the full explanation and what a real
upgrade would need. AI Profile Coach and AI Date Ideas remain not started by this
session (see docs/ROADMAP.md Phase 11) — Date Ideas may have separate work in
progress elsewhere on this branch concurrently; check `git log` for its true status.
Payment Status: Subscription scaffolding implemented — MOCK checkout, not real
Razorpay yet (unchanged this pass; still explicitly not production-ready as-is, see
MOCK_FEATURES.md). This pass added a second, non-payment way a `Subscription` row can
be created: the Task #17 referral reward (`paymentProvider: 'referral_reward'`,
7 days of `CG_PLUS`, granted for free on a successful referred signup) — a real
`Subscription` row gated by the same real `hasFeature()` entitlement check as a paid
plan, just not itself a payment.
Admin Status: Implemented — role/accountStatus on User, role-gated /api/admin/* routes
(dashboard, reports queue, photo-verification queue, suspend/reinstate, SUPER_ADMIN-only
role change), AuditLog on every mutation, role-gated /admin frontend section (unchanged
this pass).
Deployment Status: Not started (planned: Render/Railway + MongoDB Atlas +
Vercel/Netlify + Cloudinary — Phase 15, cross-cutting, not yet started).
Next Exact Task: **The MVP (Phases 0-10) is genuinely complete and buildable
end-to-end, modulo the standing untested-live-database caveat.** This project is
explicitly **not production-ready** as-is — see TODO.md's "Before real production
launch" section for the concrete list (live MongoDB Atlas connection + testing, real
Cloudinary/Firebase/Razorpay/SMS provider credentials, real `.env` production secrets,
a seeded real `SUPER_ADMIN` account, an automated test suite per
docs/TESTING_STRATEGY.md, a unique index on `User.phone`, HTTPS/hosting setup per
docs/ARCHITECTURE.md's Phase 15, and closing BUG-001). Despite that standing caveat,
the user has explicitly requested V2 feature work directly (Instagram linking, Task
#15 — Why-You-Match + Smart Icebreakers, and now Task #17 — Referral program), so V2
work is actively happening on this branch by explicit request, ahead of the
MVP-first sequencing principle's default recommendation below. Remaining V2 scope not
yet done by this session: AI Profile Coach, AI Date Ideas (both would need a real
Claude API integration — see MOCK_FEATURES.md), Private/Invisible browsing, advanced
filters, Profile Boost, Priority Like, real Razorpay integration, voice/video calling
— see docs/ROADMAP.md's V2 section. **No TaskList tool was available in this session
to check the live task graph before writing this** — Safe Date mode and Date Planner
(Task #18) may already be done or in progress by concurrent work on this branch;
check `git log` and any TaskList tooling available to whoever picks this up next for
the authoritative current state rather than trusting this line alone. Absent a
specific next user-requested V2 item, the "Before real production launch" gaps above
remain the recommended default next focus, per this project's own MVP-first
sequencing principle (docs/ROADMAP.md's "Notes on sequencing").
Next Recommended Action: Get a real MongoDB connection (Atlas free tier is enough)
verified in whatever environment picks this project up next — every DB-dependent
behavior in this entire codebase (10 feature tasks' worth of indexes, `select: false`
fields, unique constraints, aggregation queries) has only ever been verified via
code inspection, standalone fake-model scripts, and server-boot smoke tests across
every single task in this project's history, never against a real database. That one
missing piece of verification is the actual gate on calling this "tested", not any
remaining code work.
