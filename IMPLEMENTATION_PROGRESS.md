# Implementation Progress Log

Purpose: this file is an append-only running log of completed and in-progress checkpoints
for CG-Dating-App. After every meaningful completed task, append a new entry at the TOP
of the log below (newest first). Never delete or rewrite history — if something is later
reverted or changed, add a new entry describing that instead of editing the old one.

Each entry should include: date, phase, task, files touched, tests performed, and the
next task that follows from it.

---

## 2026-08-18 — Safe Date mode + Date Planner (Task #18, V2, user-requested)

- **Phase:** Phase 12 — Growth & Engagement Features (`docs/ROADMAP.md`). V2 feature
  addition requested directly by the user, built concurrently with Task #15
  (Icebreakers/Why-You-Match, already committed — touched `Match`/`matches.js`) and
  Task #17 (Referral program, touched `User.js`/`auth.js`) on the same branch. This
  task's own backend changes were entirely new files plus one small additive mount in
  `server.js`; frontend changes touched `App.jsx`/`Settings.jsx`/`Chat.jsx`
  additively alongside those other two tasks' own changes to the same three files.
- **Task:** Implement Safe Date mode (a safety plan a user creates for meeting a
  match in person — public location note, a time window, an optional trusted
  contact, check-in/complete/cancel actions, and an "overdue"/"missed check-in"
  signal) and the Date Planner (a small heuristic date-idea suggestion generator).
- **Safe Date — backend:** `backend/models/SafeDate.js` (new) — `user` (ref `User`),
  optional `match` (ref `Match`), `location` (free text, required, max 200 chars —
  an "approximate public location", **never** GPS coordinates, per the product
  spec's explicit privacy requirement — no device-location field exists on this
  model at all), `plannedStartAt`/`plannedEndAt`, optional
  `trustedContactName`/`trustedContactPhone` (the phone is stored but **never**
  actually used to send an SMS — no SMS provider is configured in this project, same
  established MOCK/DEV-ONLY gap as mobile-OTP delivery), `status` enum
  (`PLANNED`/`CHECKED_IN`/`COMPLETED`/`MISSED_CHECKIN`/`CANCELLED`), `checkedInAt`/
  `completedAt`/`cancelledAt`, and `reminderNotifiedAt` (gates the one-time reminder
  notification below). `backend/constants/safeDateOptions.js` (new) — the status
  enum plus the three read-time-computation windows: `CHECKIN_GRACE_MINUTES` (30),
  `MISSED_CHECKIN_GRACE_MINUTES` (120), `REMINDER_WINDOW_MINUTES` (60).
  `backend/utils/safeDateUtils.js` (new) — `computeSafeDateStatus(doc, now)`, a PURE
  function (no DB/IO) returning `{ effectiveStatus, statusChanged, isOverdue,
  isReminderWindow }`, and `applySafeDateComputation(doc, { io })`, the DB-touching
  wrapper the routes call that persists a `PLANNED` → `MISSED_CHECKIN` transition
  when warranted and creates a one-time in-app `Notification` (type `'safety'`,
  reusing the existing `backend/utils/notificationUtils.js#createNotification()` —
  the same helper `match`/`like`/`message` notifications already use, including the
  live `notification:new` Socket.IO emit) the first time a read lands inside the
  reminder window. `backend/routes/safeDates.js` (new) — `POST /api/safe-dates`
  (create, with full field validation including "end after start" and "start not in
  the past"), `GET /api/safe-dates` (owner's own list, past + upcoming, with the
  read-time computation applied per item), `GET /api/safe-dates/:id` (owner-only,
  `404` — not `403` — for another user's plan, matching this codebase's existing
  "don't leak existence of another user's record" convention), `PATCH .../check-in`,
  `PATCH .../complete`, `PATCH .../cancel` (each owner-only, each rejecting an
  already-terminal plan with `400`).
- **Safe Date — the "missed check-in" / reminder design decision (documented up
  front, not discovered mid-build):** there is no background job scheduler anywhere
  in this codebase (no `node-cron`, no task queue) and no real SMS/push provider
  configured, so a true "watch the clock and alert someone" implementation isn't
  possible in this pass. Instead, both signals are computed **fresh on every read**
  (`GET /api/safe-dates`/`GET /api/safe-dates/:id`) rather than faked as
  always-accurate: `isOverdue` and the `MISSED_CHECKIN` transition are derived from
  `now` vs. `plannedStartAt`/`plannedEndAt` at request time, and the reminder
  `Notification` is real (persisted, live-delivered) but only fires if/when a read
  happens to land inside the window — there is no guarantee it fires close to
  `plannedStartAt` the way a real scheduled push would. **No SMS/call is ever sent
  to the trusted contact** — this is explicitly deferred, not mocked with a fake
  "sent" response; see `MOCK_FEATURES.md`'s new Safe Date entry for the full,
  explicit wording.
- **Date Planner — backend:** `backend/constants/dateIdeaOptions.js` (new) — budget
  (`low`/`medium`/`high`) and activity-type
  (`coffee`/`food`/`outdoor`/`movie`/`walk`/`other`) enums.
  `backend/utils/datePlanUtils.js` (new) — a 10-item in-code curated list of
  Chhattisgarh-relevant date ideas (coffee + evening walk, local food + a
  photography spot, public park visit, multiplex movie, public-lake boating, a
  museum/science-centre visit, a busy market walk, high tea, fine dining, a
  botanical garden/zoo) and `getDateIdeaSuggestions({ budget, activityType, city })`,
  a pure function returning 2-4 suggestions with progressive filter relaxation
  (exact match → budget-only → activity-only → a small default set) so the response
  is never empty or single-item; `city`, when given, only personalizes the returned
  description text (no places/maps API is integrated). **Every curated idea is a
  public place/activity** — cafés, restaurants, parks, multiplexes, public
  lakes/gardens — per the product spec's explicit "never encourage first meetings in
  isolated/private locations" safety rule; this is enforced by hand-curating the
  list itself (verified by a keyword scan in this pass's verification script, see
  below), not a runtime filter. `backend/routes/dateIdeas.js` (new) —
  `GET /api/date-ideas?budget=&activityType=&city=`, protected, stateless (nothing
  persisted — no `date_plans` collection exists, see `docs/DATABASE_SCHEMA.md`'s
  divergence note), explicitly **not real AI** (no `ANTHROPIC_API_KEY` configured,
  same constraint already documented for Task #15's Icebreakers/Why-You-Match).
- **`backend/server.js`:** mounted `safeDatesRouter` at `/api/safe-dates` and
  `dateIdeasRouter` at `/api/date-ideas` — additive alongside Task #17's
  already-present `referralsRouter` mount (re-read and merged onto the file rather
  than overwritten, after a `git`-modified-since-read conflict on the first attempt).
- **Frontend:** `frontend/src/api.js` (new `createSafeDate`/`getSafeDates`/
  `getSafeDate`/`checkInSafeDate`/`completeSafeDate`/`cancelSafeDate`/
  `getDateIdeas`), `frontend/src/constants/dateIdeaOptions.js` (new — mirrored
  budget/activity-type option lists for the two `<select>`s).
  `frontend/src/pages/PlanSafeDate.jsx` (new) — the planning form (location,
  start/end via `datetime-local` inputs, optional trusted-contact fields), reachable
  from Chat's new "Safe Date" header link (carrying `?matchId=`) or standalone from
  the Safe Dates list's "Plan a new Safe Date" button; a visible privacy note in the
  UI itself (not just code comments) states the app never tracks exact location.
  `frontend/src/pages/SafeDates.jsx` (new) — "My Safe Dates", upcoming/past
  sections, an overdue banner and a "starting soon" reminder banner both driven
  directly off the API's `isOverdue`/`isReminderWindow` fields (never computed
  client-side), Check-In/Complete/Cancel buttons gated by the plan's current status.
  `frontend/src/pages/DateIdeas.jsx` (new) — budget/activity-type/city filters,
  linked from the planning form's "need ideas?" and standalone from Settings.
  `frontend/src/App.jsx` (new `/safe-dates`, `/safe-dates/new`, `/date-ideas`
  routes), `frontend/src/pages/Settings.jsx` (new "My Safe Dates"/"Date Ideas"
  links, additive alongside Task #17's already-present "Invite & Earn" link),
  `frontend/src/pages/Chat.jsx` (new "Safe Date" header link, additive alongside the
  existing "Matches" link, Task #15's `CompatibilityBadge`, and `SafetyMenu`).
- **Tests performed:** Backend — `node -e "require('./server.js')"` boots cleanly
  (both alone and with Task #17's `referralsRouter` already mounted); `GET
  /api/health` 200; `curl` with no `Authorization` header on every new route (`POST`/
  `GET /api/safe-dates`, `GET`/`PATCH /api/safe-dates/:id`(`/check-in`|`/complete`|
  `/cancel`), `GET /api/date-ideas`) returned 401. Two standalone Node scripts (run
  from inside `backend/` so `node_modules` resolved, both deleted before commit):
  (1) `__verify_safedate.js` hijacked `require.cache` for `models/SafeDate.js` with
  a fake in-memory store (24-hex-char ids, so `mongoose.Types.ObjectId.isValid()`
  checks in the real route code pass exactly as they would against real ObjectIds)
  and mounted the REAL `backend/routes/safeDates.js` over real HTTP with two
  different JWT-bearing users — confirmed create → check-in → complete, the cancel
  path, validation errors (missing `location`, end-before-start, start-in-the-past),
  a `400` on re-cancelling/re-completing an already-terminal plan, `404` on an
  unknown-but-valid-format id, `400` on a malformed id, and — the specific
  ownership-enforcement ask for this task — that user B gets `404` reading (`GET
  /:id`) or mutating (`check-in`/`complete`/`cancel`) user A's plan, and that user
  A's plan never appears in user B's own `GET /api/safe-dates` list; 24 checks, all
  passed. (2) `__verify_safedate_logic.js` exercised `computeSafeDateStatus()`
  directly (pure function, no DB/HTTP) across 9 `now`/`plannedStartAt`/
  `plannedEndAt`/`status` combinations — far-future (not overdue, not reminder-due),
  inside the 60-min reminder window, just past `plannedStartAt` within the 30-min
  check-in grace (not yet overdue), past that grace but not yet past `plannedEndAt`
  + 120-min grace (`isOverdue: true`, status still `PLANNED`), past that deadline
  (persists `MISSED_CHECKIN`), one minute before that deadline (still `PLANNED`),
  and that `CHECKED_IN`/`COMPLETED`/`MISSED_CHECKIN` are all left alone — plus
  `getDateIdeaSuggestions()`: always 2-4 results (including the narrow-combo
  fallback-relaxation path for `budget=low&activityType=movie`, which no single
  curated idea satisfies), city personalization applied to every returned
  description, and a keyword scan (`"my place"`, `"isolated"`, `"secluded"`, `"hotel
  room"`, etc.) confirming no curated idea's own text suggests a private/isolated
  location; 30 checks, all passed. A live-server curl pass additionally confirmed
  `GET /api/date-ideas` with a real JWT returns sensible defaults, respects
  `budget`/`activityType`/`city` filters, personalizes descriptions with the given
  city, and 400s on an invalid `budget` value — and that mounting the two new
  routers didn't break any pre-existing route (`GET /api/matches`,
  `GET /api/referrals/me` still 401 with no auth). Frontend — `npm run build` clean
  (no errors); `npm run lint` (oxlint) — 0 errors, same 2 pre-existing
  `only-export-components` warnings carried forward (one `no-unused-vars` warning
  introduced by an unnecessary cancellation-tracking variable in `SafeDates.jsx` was
  caught by this same lint run and fixed before the final check).
- **Docs updated:** `docs/DATABASE_SCHEMA.md` (`safe_dates` marked `[IMPLEMENTED]`
  with the full divergence writeup from the original draft, `date_plans` marked
  "not implemented as a persisted collection" with the Date Planner explanation, the
  `Notes` section's geospatial-fields line corrected to exclude `safe_dates.location`
  now that it's free text, not GeoJSON), `docs/API_DOCUMENTATION.md` (new §14 with
  every route, the read-time-computation explanation reproduced as an explicit
  callout, and the Date Planner's "not real AI" + public-places-only safety rule),
  `docs/ROADMAP.md` (Phase 12 row updated to "In Progress", covering both this task
  and the already-implemented-but-previously-unreflected Task #17 Referral program),
  `MOCK_FEATURES.md` (two new entries under "Currently Mocked", using close to the
  exact wording requested for the "missed check-in" limitation), `TODO.md` (both
  "Safe Date mode" and "Date Planner" V2 checkboxes marked done, with a note
  distinguishing this heuristic Date Planner from a possible future real-AI "AI Date
  Ideas" item), `PROJECT_STATE.md`/this file (this entry).
- **Rebase note:** per this task's instructions, ran `git pull --rebase` before the
  final push, expecting to rebase onto Task #17 (Referral program) and/or Task #15
  (Icebreakers) if either had pushed in the meantime — see this session's final
  commit message / `git log` for whether a rebase was actually needed and, if so,
  what (if anything) required manual conflict resolution.
- **Next task:** Remaining V2 scope not yet done: AI Profile Coach, a real-AI
  version of "AI Date Ideas" (both need a real Claude API integration), Private/
  Invisible browsing, advanced filters, Profile Boost, Priority Like, real Razorpay
  integration, voice/video calling, real Instagram OAuth — see `docs/ROADMAP.md`'s
  V2 section and `TODO.md`. Absent a further specific user request, the "Before real
  production launch" gaps in `TODO.md` (top of that file) remain the recommended
  default next focus per this project's own MVP-first sequencing principle.

---

## 2026-08-18 — Referral program / "Invite & Earn" (Task #17, V2, user-requested)

- **Phase:** V2 (docs/ROADMAP.md's V2 section — "Referral program (Invite & Earn)"),
  explicit user request. Not one of the original 12 MVP tasks. Built concurrently on
  this branch alongside Task #15 (Icebreakers/Why-You-Match, touching `Match`/
  `matches.js`) and Task #18 (Safe Date + Date Planner, new files) — this task's own
  changes were kept scoped and additive to `User.js`/`auth.js` specifically to
  minimize rebase friction, per the concurrency instructions for this pass.
- **Task:** Every user gets a unique, short, human-shareable referral code at signup.
  An optional `referralCode` in the signup body links a new account to its referrer
  (once, ever) and rewards both sides. Reward mechanism reuses Task #12's existing
  Subscription/Plan/entitlement system rather than inventing a new currency — grepped
  the full `backend/` tree at implementation time and confirmed neither a "boost
  credits" nor a "priority likes" currency existed yet (Task #16 — Boost/Priority
  Like — had not landed), so the documented safe default applies: **7 days of
  `CG_PLUS`**, granted to both the referrer and the referee via a new `Subscription`
  document each.
- **Referral code generation:** `backend/utils/referralUtils.js#generateReferralCode()`
  draws 7 characters from an alphabet that deliberately excludes visually-ambiguous
  characters (`0`/`O`, `1`/`I` — see `backend/constants/referralOptions.js`), using
  `crypto.randomInt` (not `Math.random`, same reasoning already applied to OTP
  generation). `generateUniqueReferralCode()` pre-checks uniqueness against `User`
  with retry-on-collision (astronomically unlikely to ever loop — the code space is
  ~34 billion); `backend/models/User.js`'s schema-level `unique: true` index on
  `referralCode` is the final race-safe guard, and `backend/routes/auth.js`'s signup
  handler retries the whole `User.create()` call (regenerating a fresh code) on the
  rare genuine duplicate-key race.
- **`referredBy` — schema-enforced, one-time-ever link:** `backend/models/User.js`
  gained `referredBy` (nullable ref `User`, `immutable: true`). Mongoose's
  `immutable` allows the initial set on a brand-new document (at signup) but silently
  ignores any later reassignment on an already-saved document — verified directly
  against the real schema in the standalone test below. No route anywhere in this
  codebase can set/change `referredBy` after signup (`backend/routes/referrals.js`
  only implements a read-only `GET /me`), so retroactive referral-linking is
  structurally impossible, not just schema-blocked.
- **Signup flow (`backend/routes/auth.js`):** accepts an optional `referralCode` in
  the `POST /api/auth/signup` body. **Documented UX choice (per the task's explicit
  instruction to pick one and document it):** an invalid-format or unknown/typo'd
  code never rejects the signup — it's silently dropped (from the caller's
  perspective) and only logged as a warning server-side; the account is still
  created normally. This was chosen over the stricter "reject with 400" alternative
  because it matches how real-world referral programs behave (a mistyped code
  shouldn't block someone from creating an account) and was the task's own
  explicitly-preferred option. "Can't refer yourself" needs no separate check — the
  referrer must already have an account (and therefore an existing code) for their
  code to resolve to anyone, so a brand-new signup's own code doesn't exist yet at
  the moment the request body is checked.
- **Reward granting (`backend/utils/referralUtils.js`):**
  `grantReferralReward(userId)` looks up the (idempotently-seeded) `CG_PLUS` `Plan`
  and creates a new `Subscription` (`status: 'ACTIVE'`, `expiresAt: now + 7 days`,
  `paymentProvider: 'referral_reward'` — added to
  `backend/constants/subscriptionOptions.js#PAYMENT_PROVIDERS` alongside the existing
  `'mock_razorpay'` so every `Subscription` row's origin stays traceable from one
  enum). `grantMutualReferralReward()` grants both sides, each isolated in its own
  try/catch (same "isolate side-effect from the main success path" pattern already
  used by `notificationUtils.js`'s callers) — awaited synchronously in the signup
  handler (not fire-and-forget) so the reward is reliably granted before the
  response is sent, but a grant failure on either side never turns a successful
  signup into an error response. Granting never touches/shortens any subscription a
  user may already have — it's simply a new `Subscription` row, same "one document
  per checkout" pattern the model already uses;
  `entitlementUtils.js#getEffectiveSubscription()` naturally resolves to whichever
  row expires furthest out.
- **New route:** `GET /api/referrals/me` (`backend/routes/referrals.js`, auth
  required) — the caller's own `referralCode`, a `shareText` string (no real
  deep-link infra, just a copyable code + templated message — see
  `MOCK_FEATURES.md`), `referralCount` (`User.countDocuments({ referredBy: callerId
  })` — computed on demand, not a denormalized counter, avoiding counter-drift bugs),
  and the caller's own most recent reward grants (capped at 5).
- **Frontend:** `frontend/src/api.js` gained `signup(email, password, referralCode)`
  (additive optional 3rd param) and `getMyReferrals()`. `frontend/src/context/
  AuthContext.jsx#signup()` passes the referral code through unchanged otherwise.
  `frontend/src/pages/Signup.jsx` gained an optional "Referral code" text input,
  upper-cased as typed, prefillable from a `?ref=<CODE>` query param on `/signup`
  (via `useSearchParams`) so a shared `/signup?ref=CODE` link auto-fills the field.
  New `frontend/src/pages/Referrals.jsx` ("Invite & Earn" — code display, a
  copy-to-clipboard button for the invite text using `navigator.clipboard` with a
  graceful on-screen fallback if unavailable, referral count, and a recent-rewards
  list), routed at `/referrals` in `frontend/src/App.jsx` and linked from
  `frontend/src/pages/Settings.jsx`.
- **Tests performed:** Backend — `node -e "require('./server.js')"` boots cleanly
  (including alongside Task #18's concurrently-added `safeDates`/`dateIdeas`
  routers), no import/syntax errors; `GET /api/health` 200; `curl` with no
  `Authorization` header on `GET /api/referrals/me` returned 401; `POST
  /api/auth/signup` with a missing body still returns its existing 400 (unaffected
  by the additive `referralCode` param). A standalone Node script
  (`backend/__verify_referrals_tmp.js`, run from inside `backend/` so its
  `node_modules` resolved correctly, deleted before this commit per this project's
  established "verify with throwaway scripts, never commit them" convention) did two
  things without any live MongoDB connection: **(1)** loaded the REAL
  `backend/models/User.js` Mongoose schema directly (no DB) and constructed real
  `mongoose.Document` instances to prove `referredBy`'s `immutable: true` constraint
  actually works — the initial set on a brand-new document succeeds, but both a
  plain-property reassignment (`doc.referredBy = ...`) and `.set('referredBy', ...)`
  are silently ignored once `doc.isNew` is `false` (simulating an already-saved
  document, exactly what a real second `.save()` would see), including for a
  never-referred (`null`) user who can't be retroactively linked either; also
  confirmed the schema declares `unique: true` on `referralCode`. **(2)** hijacked
  `require.cache` for `models/User.js`/`Plan.js`/`Subscription.js` with hand-built
  fake in-memory stores (supporting the exact chainable query methods the real code
  calls — `.select()`, `.sort()`, `.limit()`, `.populate()`, plus `exists`/
  `countDocuments`/`create` with simulated unique-constraint duplicate-key errors)
  and mounted the REAL `backend/routes/auth.js` + `backend/routes/referrals.js` over
  real HTTP (same fake-model-over-real-route-over-real-HTTP pattern already
  established in this project's Task #6 security-audit verification script) to
  exercise the full flow end-to-end: a referrer signup with no code gets a
  7-character `referralCode` and `referredBy: null`; a referee signup using that
  valid code succeeds, links `referredBy` to the referrer's id, and creates exactly
  2 new `Subscription` rows — one per side, both `paymentProvider: 'referral_reward'`,
  both for the `CG_PLUS` plan, both expiring ~7.00 days after `startedAt`; a
  malformed code (`"nope!!"`, fails the format regex) and a well-formed-but-unknown
  code (`"ZZZZZZZ"`) both still let signup succeed (`201`) with `referredBy: null`
  and zero new reward rows created; `GET /api/referrals/me` for the referrer
  returned the correct `referralCode`, a `shareText` containing it, `referralCount:
  1` (only the one valid-code referee counts — the two rejected-code signups don't),
  and exactly 1 reward entry with `planCode: 'CG_PLUS'`; the same route without a
  token returned 401. All 26 checks passed. Frontend — `npm run build` clean (no
  errors, `dist/` produced); `npm run lint` (oxlint) — 0 errors, the same 2
  pre-existing `only-export-components` warnings on `AuthContext.jsx`/
  `NotificationContext.jsx` carried forward, no new warnings.
- **Rebase:** `git pull --rebase origin claude/new-dating-app-repo-r8al13` was run
  before the final push; see this entry's own commit message / `git log` for whether
  a rebase actually occurred and what, if anything, needed resolving (both other
  concurrent tasks' files — `Match`/`matches.js` for Task #15, and Task #18's new
  files — were left untouched by this task's own changes, so no overlapping-hunk
  conflicts were expected on `User.js`/`auth.js` specifically).
- **Files touched:** `backend/constants/referralOptions.js` (new),
  `backend/utils/referralUtils.js` (new), `backend/routes/referrals.js` (new),
  `backend/models/User.js`, `backend/routes/auth.js`,
  `backend/constants/subscriptionOptions.js`, `backend/server.js`,
  `frontend/src/api.js`, `frontend/src/context/AuthContext.jsx`,
  `frontend/src/pages/Signup.jsx`, `frontend/src/pages/Referrals.jsx` (new),
  `frontend/src/pages/Settings.jsx`, `frontend/src/App.jsx`,
  `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/BUSINESS_PLAN.md`,
  `MOCK_FEATURES.md`, `TODO.md`, `PROJECT_STATE.md`, this file.
- **Next task:** No specific next V2 item was requested alongside this one. Per this
  project's own MVP-first sequencing principle, the "Before real production launch"
  gaps in `TODO.md` remain the recommended default next focus absent a further
  explicit user request; concurrently, Task #15 and Task #18 may still be finishing
  up on this same branch — check `git log`/any TaskList tooling for the current
  state before picking up new work.

---

## 2026-08-18 — Why-You-Match + Smart Icebreakers (Task #15, V2, user-requested)

- **Phase:** V2 (docs/ROADMAP.md Phase 11 — AI Features), pulled forward by explicit
  user request ahead of Phases 13-15. Not one of the original 12 MVP tasks.
- **Task:** Add two deterministic, heuristic-based "AI-sounding" features — this
  project has no `ANTHROPIC_API_KEY` configured anywhere (checked `backend/
  .env.example`: only `PORT`/`MONGODB_URI`/`JWT_SECRET` exist), so no code path in this
  build ever calls the real Claude API or any other LLM. **Why-You-Match**: a
  compatibility score + short human-readable reasons between two users' profiles.
  **Smart Icebreakers**: personalized conversation-starter suggestions. Both are pure,
  server-side profile-comparison heuristics with a fixed, documented weighting/template
  set, matching the same "mock what can't be real given no credentials" pattern already
  used for every other external integration in this codebase (SMS/OTP, Cloudinary,
  Razorpay, FCM — see `MOCK_FEATURES.md`).
- **Backend:** `backend/utils/compatibilityUtils.js` (new) —
  `computeCompatibility(profileA, profileB)` returns `{ score: 0-100, reasons: string[]
  (0-5) }`. Weighting (documented in the file's top comment, since neither
  `docs/BUSINESS_PLAN.md` nor `docs/DATABASE_SCHEMA.md` sketch a concrete "CG Match
  Score" formula to reuse — defined fresh for this feature): same `datingIntention`
  +25 (biggest single weight — two people wanting different things is the largest
  real-world mismatch), same `city` +15 (local-first product per `docs/BUSINESS_PLAN.md`),
  shared `interests` +8 each capped at 3 shared (+24 max), shared `languages` +10 flat
  (not per-language), matching `lifestyle` fields (smoking/drinking/diet) +5 each
  capped at 3 (+15 max), shared `personalityPrompts` themes +8 each capped at 2 (+16
  max) — raw total caps at 105, clamped to 100 so an excellent-but-not-perfect match
  can still read as a clean 100. Reasons are only ever built from genuine overlap
  (never fabricated to pad the list to a target count), sorted by weight, capped at 5,
  and read as plain-language observations ("You both love Travel, Cricket and Cooking",
  "Same relationship goal: Serious dating", "Both in Raipur") — never clinical/
  algorithmic-sounding output, and never a claim of scientific/psychological accuracy.
  `backend/utils/icebreakerUtils.js` (new) — `generateIcebreakers(profileA, profileB)`
  returns a pool of 3-6 template-filled conversation-starter strings built from real
  shared interests (up to 2), shared personality-prompt themes with the partner's
  actual answer quoted (up to 2, truncated to 80 chars), same dating intention, same
  city, a shared language, and matching diet — falling back to a small
  generic-but-decent pool (deliberately never `"Hi"`/`"Hello"` — the whole point of the
  feature) to top up to at least 3 when there isn't enough real overlap to personalize
  from. `backend/routes/matches.js` — imported both utils; `GET /api/matches` now
  fetches the caller's own profile once (alongside the existing batched other-user
  profile/verification fetches) and includes a `compatibility` field on every match
  row; two new routes, `GET /api/matches/:matchId/compatibility` and
  `GET /api/matches/:matchId/icebreakers`, both protected and reusing the exact same
  `loadAuthorizedMatch()` participant/unmatch/block gate the message routes already
  use (no new authorization logic to review). No `exclude` param on the icebreakers
  route — chose the simpler of the two suggested designs (a larger pool the frontend
  cycles through locally) since the pool is already fully deterministic per pair, so a
  server round-trip for "another one" would only ever return the same list.
- **Frontend:** `frontend/src/components/CompatibilityBadge.jsx` (new) — the
  `CompatibilityBadge` component `docs/DESIGN_SYSTEM.md` already named in its Reusable
  Component Library list ("shows match/compatibility signal (esp. once AI 'Why You
  Match' ships in V2)"), built to the same dumb/presentational pattern as the existing
  `VerificationBadge.jsx`. `frontend/src/components/MatchModal.jsx` — on mount, fetches
  compatibility + one icebreaker suggestion for the new match (best-effort, non-blocking
  — a fetch failure never blocks "Start a conversation"), shown as a "Why you match"
  panel + a suggested-icebreaker line below the avatar. `frontend/src/pages/
  Matches.jsx` — a `CompatibilityBadge` per match card (only rendered when
  `score > 0`), alongside the existing verification badges. `frontend/src/pages/
  Chat.jsx` — `CompatibilityBadge` in the header next to the match's name; a "Why you
  match" reasons strip below the header (only rendered when there are genuine reasons);
  an icebreaker suggestion bar above the message form with "Use" (prefills the message
  box via the existing `text` state — never auto-sends, per the task's explicit
  requirement) and "Generate another" (cycles `icebreakerIndex` through the
  already-fetched pool locally, wrapping around — no re-fetch). `frontend/src/api.js`
  — new `getMatchCompatibility(matchId)` / `getMatchIcebreakers(matchId)`.
- **Tests performed:** Backend — the project's dev server (already running under
  `nodemon` in this sandbox) picked up the route changes with no crash; `GET
  /api/health` returned `200`; `curl` with no `Authorization` header against `GET
  /api/matches`, `GET /api/matches/:matchId/compatibility`, and `GET /api/matches/
  :matchId/icebreakers` all returned `401` as expected. A standalone Node script
  (`backend/_verify_task15.js`, deleted before commit per this project's established
  "verify with throwaway scripts, never commit them" convention) exercised both utils
  directly with realistic fake `Profile` objects (no DB connection needed, matching
  `backend/utils/matchUtils.js`'s existing "pure, DB-independent, standalone-testable"
  pattern): (1) identical profiles scored 100 with 5 reasons spanning every category;
  (2) fully disjoint profiles (different intention/city/interests/languages/lifestyle/
  prompts) scored exactly 0 with an empty `reasons` array — confirming no reason is
  ever fabricated — and produced an icebreaker pool drawn entirely from the generic
  fallback list; (3) a partial-overlap case (differing dating intention, 4 shared
  interests) correctly omitted the intention-match reason and correctly capped/joined
  the interest reason at the top 3 ("Travel, Cricket and Cooking"); (4) a missing/null
  profile on either side never threw — returned a neutral zero/empty compatibility
  result and the generic icebreaker fallback pool; (5) icebreaker pools were confirmed
  duplicate-free and always sized 3-6. All checks passed. Frontend — `npm run build`
  clean (no new warnings/errors); `npm run lint` (oxlint) — 0 errors, the same 2
  pre-existing `only-export-components` warnings on `AuthContext.jsx`/
  `NotificationContext.jsx` carried forward unrelated to this change.
- **Concurrency note:** two other background agents were working on this same branch
  concurrently (Task #17 — referral program; a Safe Date/Date Planner/Date Ideas task)
  — their in-progress, uncommitted changes were visible in this shared working tree at
  various points during this session (`backend/models/User.js`, `backend/routes/
  auth.js`, `backend/server.js`, `backend/constants/subscriptionOptions.js`,
  `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/Signup.jsx`, plus several
  new referral/safe-date/date-idea files) but were never touched, staged, or committed
  by this session — only the files listed above were staged. See this file's own commit
  for the exact diff, and `git log`/any rebase-conflict resolution note near this
  entry's own commit hash for how any overlap with their pushed commits was resolved.
- **Next task:** AI Profile Coach and AI Date Ideas remain the two not-yet-started V2
  AI items (see docs/ROADMAP.md Phase 11) — both would need the same real
  `ANTHROPIC_API_KEY` + backend-only Claude API call this entry's features
  deliberately did not attempt, given no credentials exist; see `docs/ARCHITECTURE.md`'s
  AI layer section for the intended design once real credentials are available. Beyond
  AI, the "Before real production launch" gaps in `TODO.md` remain the standing
  higher-priority default (live MongoDB verification, real provider credentials,
  automated test suite, etc.) absent a further specific user request for V2 scope.

---

## 2026-08-18 — Instagram profile linking (post-MVP, user-requested)

- **Phase:** Post-MVP feature addition — requested by the user after the MVP (all 12
  internal tasks, closed out by the entry below) had already shipped. Not part of the
  original 12-task plan; see `TODO.md`'s new "Post-MVP feature additions" section.
- **Task:** Add self-reported Instagram profile linking. **Scope decision (made up
  front, not re-litigated during the build):** a self-reported handle, not real
  Instagram OAuth — there is no Meta Developer app registered for this project (no
  client ID/secret, no redirect URI), and implementing real "Login with Instagram"
  would require Meta's external app-review process, which isn't in place. This
  mirrors the same mocked/simplified pattern already used for every other external
  integration in this codebase (SMS/OTP, Cloudinary, Razorpay, FCM — see
  `MOCK_FEATURES.md`).
- **Backend:** `instagramHandle` (nullable string, default `null`) added to
  `backend/models/Profile.js`, with a schema-level format validator
  (`backend/constants/profileOptions.js#INSTAGRAM_HANDLE_REGEX` — 1-30 chars,
  letters/numbers/periods/underscores, matching Instagram's real username rules) as
  defense-in-depth on top of route validation. `PUT /api/profile/me`
  (`backend/routes/profile.js`) extended to accept `instagramHandle` in the existing
  partial-merge body — no new endpoint — following the exact validate-then-`updates`
  pattern already used for every other optional field; a leading `@` is stripped
  before storage, the value is otherwise stored as-entered (not force-lowercased),
  and an empty string clears a previously-set handle. Both
  `toOwnProfileJSON`/`toPublicProfileJSON` (`backend/utils/profileSerializers.js`)
  now include `instagramHandle` — since `backend/routes/discovery.js`'s feed already
  reuses `toPublicProfileJSON` directly for its full card, the handle appears there
  too; `backend/routes/matches.js`'s match-list card builds its own deliberately
  minimal shape (it already omits `bio`) and was left unchanged for the same
  space-constrained reasoning. `backend/utils/profileUtils.js#computeProfileCompletion`
  gained a small `+5` bonus (`COMPLETION_WEIGHTS.instagram`) for a filled handle — the
  other weighted sections already sum to 100, so this is a genuine bonus, never a
  requirement (`Math.min(100, ...)` absorbs the overflow on an otherwise-full
  profile).
- **Frontend:** `frontend/src/constants/profileOptions.js` gained a mirrored
  `INSTAGRAM_HANDLE_REGEX` + a `normalizeInstagramHandle()` helper (strip leading
  `@`, trim). `frontend/src/pages/ProfileBuilder.jsx` gained a new "Social" section
  (reusing `TextField`/`Button`, no new styling patterns) with client-side format
  validation before save (mirrors the backend regex exactly) and a live badge preview
  once a valid handle is typed. `frontend/src/pages/Discovery.jsx`'s `DiscoveryCard`
  (the only existing "view someone else's public profile" surface in this codebase —
  there is no separate profile-detail screen/route yet, `GET /api/profile/:userId`
  exists in `frontend/src/api.js` as `getUserProfile()` but nothing calls it) gained a
  small `📷 @handle` badge linking to `https://www.instagram.com/<handle>/`
  (`target="_blank"`, `rel="noopener noreferrer"`) — a plain text badge, not an
  embedded/sourced Instagram logo asset, per the design-system guidance against
  introducing new asset types.
- **Tests performed:** Backend — `node -e "require('./server.js')"` boots cleanly, no
  import/syntax errors; `GET /api/health` 200; `curl -X PUT /api/profile/me` with no
  `Authorization` header returns 401 (auth gate unaffected). A standalone Node script
  (`backend/__verify_instagram.js`, deleted before this commit per this project's
  established convention) loaded the real `constants/profileOptions.js`,
  `models/Profile.js` (via `validateSync()`, no DB connection), `utils/
  profileSerializers.js`, and `utils/profileUtils.js` directly and checked: the regex
  accepts/rejects the documented edge cases (valid handles, empty string, 31-char
  handle, spaces, punctuation outside `._`, emoji); the Mongoose schema validator
  matches the regex exactly; the route's stripping/trimming normalization behaves as
  documented (`"@handle"` → `"handle"`, whitespace trimmed, case preserved, empty
  string → `null`, `@` + 31 chars still rejected after stripping); both serializers
  include `instagramHandle` (and return `null`, not `undefined`, when unset); the
  completion-score bonus is exactly `+5` on a partial profile and never pushes an
  already-100% profile above the cap or makes an otherwise-empty profile complete.
  All checks passed. Frontend — `npm run build` clean (no errors); `npm run lint`
  (oxlint) — 0 errors, the same 2 pre-existing `only-export-components` warnings
  carried forward, no new warnings.
- **Files touched:** `backend/constants/profileOptions.js`, `backend/models/
  Profile.js`, `backend/routes/profile.js`, `backend/utils/profileSerializers.js`,
  `backend/utils/profileUtils.js`, `frontend/src/constants/profileOptions.js`,
  `frontend/src/pages/ProfileBuilder.jsx`, `frontend/src/pages/Discovery.jsx`,
  `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `MOCK_FEATURES.md`,
  `TODO.md`, `PROJECT_STATE.md`, this file.
- **Next task:** None specifically required by this addition — it's additive and
  self-contained. The broader "Before real production launch" list in `TODO.md`
  (live MongoDB, real provider credentials, automated tests, etc.) is unchanged and
  still gates any real deploy; real Instagram OAuth/ownership verification is now
  tracked as a V2 item in `TODO.md`.

---

## 2026-08-18 — Final polish, security audit, and documentation wrap-up (Task #6) — MVP complete

- **Phase:** Cross-cutting wrap-up pass, closing out the last of the 12 internal tasks
  that made up the MVP build (Phases 0-10 per `docs/ROADMAP.md`). Not a new feature
  phase — this entry summarizes the whole MVP build's final state as much as this
  pass's own work, per this task's "final dated entry summarizing the whole MVP build"
  instruction.
- **Task:** (1) full build/lint/boot verification across frontend and backend; (2) a
  security audit against `docs/ARCHITECTURE.md`'s security requirements and
  `docs/TESTING_STRATEGY.md`'s security checklist; (3) a light UI consistency
  spot-check (dark mode / design tokens / loading-error-empty states) across
  Discovery, Matches, Chat, Notifications, and the four Admin screens; (4) finalizing
  every tracking doc to reflect true final MVP state.
- **MVP summary (all 12 internal tasks, commits `95aeb5b` through this pass's own):**
  repo/GitHub setup → project scaffold (`fd72a17`) → documentation set → authentication
  (`3f440ca`) → profile system (`00c29f3`) → discovery + matching (`f86267a`) → chat
  (`f027d73`) → notifications (`cc7fb76`) → verification (`0d724fe`) → safety/report/
  block (`2ab2aca`) → subscription scaffolding (`9319600`) → admin panel (`093d0bc`) →
  this final polish/audit/docs pass. Every MVP phase (0-10) is implemented and the app
  is buildable and boots cleanly end-to-end; see `PROJECT_STATE.md` for the full
  per-feature completion detail and every still-open divergence/scope-gap.
- **Files touched (this pass):** `backend/models/User.js` (`password` field now
  `select: false`), `backend/routes/auth.js` (login now `.select('+password')`; both
  signup/login routes gained rate-limiter middleware), `backend/middleware/
  rateLimiters.js` (new), `backend/package.json`/`package-lock.json` (`bcrypt` 5.1.1 →
  6.0.0 closing a critical transitive `npm audit` finding in `node-tar`;
  `express-rate-limit` added), `docs/SECURITY_AUDIT.md` (new), `BUGS.md` (BUG-001
  added, P1), `PROJECT_STATE.md`, `TODO.md`, `MOCK_FEATURES.md`, `README.md`,
  `docs/ROADMAP.md` (all finalized to reflect true MVP-complete state), this file.
  **No frontend code changed** — the consistency spot-check found the existing dark
  mode / design-token usage and loading/error/empty-state handling already solid
  throughout (every screen routes through `frontend/src/api.js`'s single `request()`
  helper, which already attaches structured error info consistently), so nothing
  needed fixing there.
- **Tests performed:** Frontend `npm install` (no changes needed), `npm run build`
  (clean — `dist/index.html` + JS/CSS chunks, no errors), `npm run lint` (oxlint — 0
  errors, the same 2 pre-existing `only-export-components` warnings on
  `AuthContext.jsx`/`NotificationContext.jsx` carried forward unchanged from every
  prior pass, no new warnings introduced). Backend: `npm install` (`npm audit` now 0
  vulnerabilities, was 3 [2 high, 1 critical] before this pass), `node -e
  "require('./server.js')"` boots cleanly ("CG Dating backend listening on port
  5000", no syntax/import errors), `GET /api/health` returns 200 with the expected
  body, process cleanly killable afterward (no lingering port — checked with `lsof -i
  :5000`). The three security fixes were each verified without a live database, per
  this project's established convention: (1) `User.password`'s new `select: false` +
  `routes/auth.js`'s `.select('+password')` — verified via a standalone script
  mounting a fake in-memory `User` model (respecting Mongoose `select` semantics)
  under the real `routes/auth.js` over real HTTP: signup (201), login with correct
  password (200), login with wrong password (401), and `GET /api/auth/me` (200) all
  confirmed to never include a `password` key in any JSON response, `role` still
  present on `/me`; (2) the new `loginLimiter`/`signupLimiter` — verified via a
  standalone script mounting the real rate-limiter middleware on a minimal Express app
  (no DB dependency) and sending 25 requests: first 20 returned 200, remaining 5
  returned 429, exactly as configured (20/15min); (3) the `bcrypt` 5→6 upgrade —
  verified `hash`/`compare`/`hashSync`/`compareSync` all round-trip correctly
  (correct password compares `true`, wrong password compares `false`) via a standalone
  script. All three scripts were deleted before this commit, per this project's
  established "verify with throwaway scripts, never commit them" convention. The
  broader security audit itself (secrets grep, `.env` git-history check, per-route
  auth/role-gate coverage, sensitive-field-serialization spot-check, regex-injection
  spot-check, ObjectId-validation spot-check) is documented in full, with every command
  run and its result, in the new `docs/SECURITY_AUDIT.md` — not repeated here.
- **Findings:** Two real, fixable-in-this-pass security gaps found and fixed (see
  above and `docs/SECURITY_AUDIT.md`'s "Findings" section for the full detail): no
  rate limiting at all on login/signup, and a defense-in-depth gap on
  `User.password`'s serialization guard (never an active leak — every response
  serializer in the codebase already builds a hand-picked object rather than
  returning a raw document — but worth closing before a future route is added
  carelessly). One larger gap — no rate limiting beyond auth, no `helmet`/
  security-headers middleware — was deliberately **not** fixed piecemeal in this pass
  (it's genuinely Phase 14 — Security Hardening — scope, cross-cutting and not yet
  started) and is instead formally tracked as BUG-001 (P1) in `BUGS.md`. No other bugs
  were found in the consistency/audit pass.
- **Known limitation carried forward (unchanged, not this pass's to fix):** MongoDB
  has never been reachable in any sandbox session across this entire project's
  history — no local `mongod`, no Docker, `mongodb-memory-server`'s binary download
  blocked. Every DB-dependent behavior in this codebase (10 feature tasks' worth of
  indexes, `select: false` fields, unique constraints) has only ever been verified via
  code inspection, standalone fake-model scripts, and server-boot smoke tests, never
  against a real database — this remains the single biggest gate on calling this
  project genuinely tested, and is explicitly called out as not-yet-done in
  `PROJECT_STATE.md`/`TODO.md` rather than glossed over.
- **Verdict:** the MVP is genuinely complete and buildable end-to-end (frontend build
  + lint clean, backend boots cleanly, all 10 feature areas implemented and
  cross-checked for auth coverage and consistency) — modulo the untested-live-database
  caveat above, which is a standing sandbox limitation, not a code defect. This project
  is explicitly **not "production ready"**: no live-DB testing has ever occurred, real
  Cloudinary/Razorpay/FCM/SMS credentials don't exist, there's no automated test suite,
  and BUG-001 (rate limiting/security headers beyond auth) is open. See TODO.md's
  "Before real production launch" section for the complete, concrete gap list.
- **Next task:** V2 feature scope (AI compatibility explanations, Smart Icebreakers,
  Profile Coach, Date Ideas, Safe Date mode, Date Planner, Profile Boost, Referral
  program, real Razorpay integration — see `docs/ROADMAP.md`'s V2 section) — not
  started, and per this project's own MVP-first sequencing principle, should not start
  until the "Before real production launch" gaps are closed on a real environment with
  a live database first.

---

## 2026-08-17 — Admin Panel, basic (Task #11) implemented

- **Phase:** Phase 9 — Admin Panel, basic (`docs/ROADMAP.md` numbering; same
  numbering as the internal TaskList's Task #11 for this project).
- **Task:** Role-based admin access and a minimal moderation dashboard —
  `role`/`accountStatus` fields on `User`, an `adminAuth` role-checking
  middleware, `/api/admin/*` routes (dashboard counts, reports moderation
  queue, photo-verification review queue, suspend/reinstate, a
  `SUPER_ADMIN`-only role-change route), an `AuditLog` model written on every
  admin mutation, and a matching role-gated `/admin` frontend section.
- **Concurrency note — this task ran in the same live working tree as
  Task #12 (Subscription scaffolding) at the same time, not in isolation.**
  The launch instructions anticipated two separate sessions/clones needing a
  later `git pull --rebase` if both #11 and #12 got picked up independently;
  what actually happened in this sandbox was one shared filesystem with two
  agent sessions editing concurrently, discovered mid-task when
  `backend/server.js` and `backend/models/User.js` changed on disk between a
  `Read` and the next `Edit` (the harness's own "file modified since read"
  check caught it). Six files ended up touched by both passes:
  `backend/models/User.js`, `backend/routes/discovery.js`,
  `backend/server.js`, `frontend/src/App.jsx`, `frontend/src/api.js`,
  `frontend/src/pages/Settings.jsx` (plus `docs/DATABASE_SCHEMA.md`/
  `TODO.md` at the documentation layer). Task #12 committed first (commit
  `9319600`), using a hunk-isolation technique of its own (`git
  hash-object`/`git update-index --cacheinfo` to stage a reconstructed
  "only this task's edits" blob per shared file, rather than `git add`ing
  the live working-tree file directly, which would have pulled in this
  task's still-uncommitted changes too). Once that commit landed, this
  task's own working tree was diffed against the new `HEAD`
  (`git diff HEAD -- <the six files>`) and confirmed the *only* remaining
  difference on every one of them was this task's own additions — no
  Task #12 content silently riding along, and nothing of Task #12's
  accidentally clobbered — so this task's commit could just `git add`/
  `git commit` normally on top, no reconstruction needed on this side.
- **Design decisions:**
  - **Role check is a separate middleware layered on top of
    `requireAuth`, not a rewrite of it.** `backend/middleware/adminAuth.js`'s
    `requireRole(...allowedRoles)` always runs *after*
    `backend/middleware/auth.js`'s `requireAuth` (which already decoded the
    JWT and set `req.user.id`) — it does not re-verify the token, it only
    adds a fresh database read of the caller's current `role` and checks it
    against the allowed list, 403ing otherwise. This keeps exactly one place
    in the codebase owning JWT secret/token-verification logic (per the task
    spec's explicit "reuse the existing JWT/user-loading pattern... don't
    duplicate token verification logic" instruction), while still reading
    `role` fresh on every request (not cached anywhere, not trusted from the
    JWT payload) so a role change or suspension takes effect on the
    affected user's very next request rather than only after their token
    expires.
  - **Role enum simplified from the originally-drafted 6 values to 4.**
    `docs/DATABASE_SCHEMA.md`'s draft `users.role` enum listed `USER`,
    `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT`, `ANALYST`. This task's
    own spec explicitly asked for just `USER`/`SUPER_ADMIN`/`ADMIN`/
    `MODERATOR`, and no route/permission built in this pass needs to
    distinguish a support-only or analyst-only role (no dedicated support
    queue, and the future analytics dashboard — Task #13/Phase 12 — isn't
    started), so `SUPPORT`/`ANALYST` were left out rather than added as two
    enum values nothing checks. Documented as a divergence in
    `docs/DATABASE_SCHEMA.md`, easy to widen back later.
  - **`accountStatus` (2 values: `ACTIVE`/`SUSPENDED`), not the draft's
    `status` (4 values: `ACTIVE`/`SUSPENDED`/`BANNED`/`DELETED`).** Named
    differently from the draft to avoid ambiguity with this document's other
    status-like fields (verification statuses, report statuses), and scoped
    down to a single reversible suspend/reinstate pair since the task spec
    only asked for suspend, not permanent ban/delete — a real ban/delete
    flow is future scope, not attempted here as a partial stand-in.
  - **Suspension is enforced in exactly two places, both already-existing
    surfaces extended rather than new gates invented:** `POST
    /api/auth/login` (`backend/routes/auth.js`) checks `accountStatus`
    *after* the password match succeeds (not before) — so a wrong-password
    attempt against a suspended account still gets the same generic
    "Invalid email or password" `401` as any other wrong password, never
    leaking suspension status to someone who doesn't actually know the
    password — and `GET /api/discovery/feed`
    (`backend/routes/discovery.js`) excludes suspended users in the same
    `$nin`-on-a-Set-of-excluded-ids shape already used for the blocked-user
    exclusion (Task #10), just adding one more source set
    (`User.find({accountStatus:'SUSPENDED'}).distinct('_id')`) to the
    existing `Promise.all`. Deliberately did **not** add a suspension check
    to `requireAuth` itself/globally — the task spec only asked for
    login-blocking and discovery-exclusion, and a suspended user's existing
    session (already-issued JWT, open Socket.IO connection) is documented
    as an accepted gap rather than silently over-scoped into "instantly
    revoke everything everywhere," see `PROJECT_STATE.md`'s Known Technical
    Debt.
  - **`AuditLog` over the draft's `moderation_actions` + `audit_logs` pair.**
    The original schema draft had two separate collections — a closed-enum
    `moderation_actions` log and a more generic `audit_logs` log. This task
    folds both into one `AuditLog` model with a free-string `action` field
    (e.g. `'user.suspended'`) instead of a closed enum, written from every
    state-changing route via a single `backend/utils/auditUtils.js
    #writeAuditLog()` helper — simpler for this basic pass, and a new admin
    action type never requires a schema migration. `writeAuditLog()` is
    deliberately isolated in its own try/catch (same "side effect can't turn
    an otherwise-successful mutation into a 500" pattern already used for
    notification creation in `backend/utils/notificationUtils.js`) — by the
    time it's called, the actual admin action (suspend, role change, etc.)
    has already fully succeeded, so a logging hiccup shouldn't roll that
    back or hide the success from the caller, though it is still logged
    server-side so a persistent audit-log failure isn't silent forever.
  - **`GET /api/admin/users` and the role-change route are additions beyond
    the task spec's explicit backend route list.** The task spec named
    suspend/reinstate routes but didn't spell out how an admin would find a
    target `userId` in the first place — `GET /api/admin/users?email=`
    (a simple case-insensitive partial-email search, `ADMIN`+) fills that
    gap, gated at the same role tier as suspend/reinstate since it's part of
    the same account-management surface. `PATCH
    /api/admin/users/:userId/role` (`SUPER_ADMIN`-only) implements the task
    spec's explicit "only SUPER_ADMIN can change a role" requirement — since
    the entire route is gated to `SUPER_ADMIN` by `requireRole('SUPER_ADMIN')`
    before the handler ever runs, there's no separate in-handler
    self-escalation check needed for ADMIN/MODERATOR: they're 403'd by the
    role middleware itself, so they can never reach the handler to attempt
    an escalation in the first place, including of their own account.
  - **Admin-only view of `photoVerification.submittedPhotoUrl` is an
    intentional, narrow exception to the "never expose the raw selfie"
    rule** stated in `docs/DATABASE_SCHEMA.md`'s `verifications` section —
    that rule was always scoped to *other, non-admin users' views* (the
    public profile view, discovery cards, match cards all only ever show
    the derived `photoVerified` boolean); `GET
    /api/admin/verifications/photo` is the one place designed from the
    start to need the actual photo, since a human reviewer can't approve or
    reject a submission they can't see.
- **Tests performed:**
  - Backend server boots cleanly (all route groups, including the
    concurrently-landed Task #12 subscription routes, no syntax/import
    errors) — confirmed both before and after Task #12's commit landed.
  - **A bug the fake-model-over-HTTP script below did NOT catch, and a real
    curl-equivalent check against the actual `server.js` did:** the first
    pass of `backend/server.js` added `const adminRouter =
    require('./routes/admin')` but the corresponding `app.use('/api/admin',
    adminRouter)` mount line was missed. Since the fake-model verification
    script mounts `backend/routes/admin.js` directly onto its own Express
    app (bypassing `server.js` entirely, same pattern every prior task's
    verification script used), it passed 64/64 despite this bug. A second,
    separate throwaway script that actually `require()`d the real
    `server.js` and issued real HTTP requests against it caught the missing
    mount immediately (`Cannot GET /api/admin/dashboard`, 404, instead of
    the expected `401`) — fixed by adding the missing `app.use()` line, then
    re-verified 401-for-no-auth against the real `server.js` for all nine
    admin routes. **Lesson for future passes:** a fake-model-over-HTTP
    script that mounts the router file directly is excellent for exercising
    business logic without a live DB, but it cannot catch a `server.js`
    wiring mistake (a forgotten `app.use()`, a wrong base path, route-order
    shadowing) — that needs a second check that boots the actual entrypoint.
  - A standalone Node script (`backend/__verify_admin_task11.js`, deleted
    before this commit per this project's established "verify with
    throwaway scripts, never commit them" convention) built a real Express
    app + real HTTP server mounting the ACTUAL `backend/routes/admin.js`,
    `auth.js`, and `discovery.js` files (only the Mongoose model modules —
    `User`/`Profile`/`Match`/`Message`/`Report`/`AuditLog`/`Like`/`Block` —
    swapped for tiny in-memory fakes via `require.cache` injection, since
    MongoDB is unreachable in this sandbox) and drove it over real HTTP with
    real signed JWTs for five seeded users (`USER`/`MODERATOR`/`ADMIN`/
    `SUPER_ADMIN` roles, plus one `SUSPENDED` user). 64/64 checks passed —
    see `PROJECT_STATE.md`'s "Last Successful Test" for the full breakdown
    (no-auth 401s, wrong-role 403s, role-tier enforcement across all nine
    routes, report review + audit logging, photo-verification approve/
    reject + audit logging, suspend/reinstate + self-suspend rejection +
    audit logging, `SUPER_ADMIN`-only role change + audit logging,
    `GET /api/admin/users?email=` search, login blocking a suspended account
    while a wrong password on that account still returns the generic `401`,
    `role` now present on both the login response and `GET /api/auth/me`,
    and the discovery feed excluding a suspended user).
  - A second throwaway script (`backend/__curl_check_task11.js`, also
    deleted before this commit) booted the REAL `backend/server.js` in the
    same process and issued real HTTP requests against it — this is the
    script that caught the missing `app.use()` bug described above, and
    confirmed all nine `/api/admin/*` routes correctly `401` with no auth
    against the actual entrypoint (the `403`-for-wrong-role case couldn't be
    exercised this way since `adminAuth`'s `User.findById()` genuinely needs
    a live database connection and just times out after 10s in this
    sandbox — a real Mongoose buffering timeout, not a route/wiring bug,
    same root cause noted throughout this project's history; that logic
    path is instead fully covered by the fake-model script above).
  - Frontend `npm run build` and `npm run lint` both pass with the new
    `AdminDashboard.jsx`/`AdminReports.jsx`/`AdminVerifications.jsx`/
    `AdminUsers.jsx` pages and `AdminNav.jsx`/`AdminRoute.jsx` components,
    re-run again after Task #12's commit landed to confirm nothing broke in
    the interim (same two pre-existing oxlint `only-export-components`
    warnings carried forward from prior sessions, no new warnings).
  - Not exercised (see `PROJECT_STATE.md`'s Known Technical Debt): real
    MongoDB persistence/index behavior for the new `role` index and
    `AuditLog.createdAt` index, and anything involving a real concurrent
    admin-mutation race (e.g. two moderators reviewing the same report at
    once) — no live database available in this sandbox.
- **Files touched:** see `PROJECT_STATE.md`'s "Last Modified Files" for this
  entry — not duplicated here to avoid drift between the two documents.
- **Next task:** Task #6 — Final polish (security hardening pass, input
  validation audit, consistent error-response format, a basic automated
  test suite) — see `PROJECT_STATE.md`'s "Next Exact Task" for the full
  scope and the note that a TaskList tool was not available in this session
  to cross-check the internal task graph directly.

---

## 2026-08-17 — Subscription scaffolding: Plans, mock checkout, entitlement checks (Task #12) implemented

- **Phase:** Roughly Phase 10-equivalent scope in `docs/ROADMAP.md`'s
  numbering (that doc doesn't yet have a dedicated Subscription phase
  number distinct from Payments — see the internal TaskList's Task #12,
  which is authoritative for this pass; `docs/ROADMAP.md` and the internal
  numbering are deliberately not 1:1, per this project's established note).
- **Task:** Subscription scaffolding (basic): configurable, admin-editable
  Plan model (seeded idempotently at startup, not hardcoded — per
  `docs/BUSINESS_PLAN.md`'s explicit requirement), a Subscription model,
  `GET /api/plans` (public paywall listing), `GET /api/subscription/me`,
  `POST /api/subscription/subscribe` (explicit MOCK checkout — no real
  Razorpay), `POST /api/subscription/cancel` (stays valid until
  `expiresAt`, standard SaaS behavior), and a server-side
  `hasFeature()` entitlement helper that always reads from the database and
  never trusts a client claim — demonstrated by gating the discovery feed's
  free-tier daily like limit (20/day) behind the `unlimited_likes` feature.
  Frontend: a Subscription/Upgrade page, a Membership status section (+
  Cancel) on Settings, and an upgrade prompt on Discovery when the daily
  limit is hit.
- **Concurrency note — built alongside another background agent's Task #11
  (Admin panel) in the SAME live working tree at the same time**, not
  separate clones each pushing independently as the task's own launch
  instructions anticipated (they described a `git pull --rebase`
  reconciliation step; that didn't apply here because there was only ever
  one working tree to begin with — both sessions' edits landed directly on
  disk as they happened). This was discovered mid-task via a "file modified
  since read" tool signal, not announced up front. Six files ended up
  touched by both passes: `backend/models/User.js`, `backend/routes/
  discovery.js`, `backend/server.js`, `frontend/src/App.jsx`, `frontend/src/
  pages/Settings.jsx`, `frontend/src/api.js`. In every case both passes'
  edits were structurally independent (different hunks in different parts
  of the same file — verified by diffing), so nothing was actually
  conflicting at the code level. To keep authorship cleanly separable in
  git history despite the shared working tree, this pass's commit does NOT
  `git add` the live (combined) version of those six files. Instead it
  reconstructs a "this-task's-hunks-only" version of each (starting from
  `git show HEAD:<path>`, re-applying only this pass's own edits — the
  exact same edits already made to the live file, in the same order) and
  stages that reconstructed blob directly via `git hash-object -w` +
  `git update-index --cacheinfo`, leaving the actual working-tree file
  (which still has both passes' combined edits) completely untouched on
  disk so the other agent's session can keep working in it and commit its
  own additions normally. Verified correct by diffing each reconstructed
  file against the live working-tree file and confirming the *only*
  remaining difference is the other agent's own (clearly Task #11-labeled,
  in their own code comments) additions — see the diff output captured in
  this session's transcript. All of this pass's fully-owned new files
  (`backend/constants/subscriptionOptions.js`, `backend/models/Plan.js`,
  `Subscription.js`, `backend/utils/entitlementUtils.js`,
  `subscriptionSerializers.js`, `backend/routes/subscription.js`,
  `frontend/src/pages/Subscription.jsx`) plus `frontend/src/pages/
  Discovery.jsx` (confirmed untouched by the other pass) were `git add`ed
  normally.
- **Files touched:** see `PROJECT_STATE.md`'s "Last Modified Files" entry
  for this pass for the complete, categorized list (new vs. additive
  changes to shared files) — not repeated here to avoid the two documents
  drifting out of sync on a list this long.
- **Tests performed:**
  - Backend: `node server.js` boots cleanly with every route group mounted
    (including the concurrent Task #11 admin routes — no syntax/import
    errors from either pass' files). Curled `GET /api/plans` (no auth
    required — confirmed by the absence of a 401; it does 500 in this
    sandbox, but confirmed via server logs to be a genuine ~10s Mongoose
    buffering timeout from the unreachable MongoDB, not a route/wiring bug
    — consistent with every prior pass' documented sandbox limitation) and
    `GET /api/subscription/me` / `POST /api/subscription/subscribe` /
    `POST /api/subscription/cancel` with no/bad auth, confirming `401` in
    all three cases (plus a bogus-JWT case separately confirming "Invalid
    or expired token").
  - A standalone Node script (`/tmp/.../verify_entitlement.js`, deleted
    before this commit per this project's established convention — never
    commit a scratch verification script) loaded the ACTUAL
    `backend/utils/entitlementUtils.js` with `Plan`/`Subscription`/`User`'s
    Mongoose model modules swapped for tiny in-memory fakes via
    `require.cache` injection (same "fake-model" spirit as prior passes'
    integration scripts, applied here directly to a pure-logic utility
    module rather than over HTTP, since `entitlementUtils.js` has no route
    layer of its own). 15/15 checks passed:
    - `seedDefaultPlans()`: first call creates all 3 default plans; a
      second call creates none (idempotent) AND does not clobber a
      simulated admin price edit made in between; all 3 plan codes present
      with the expected `features` arrays.
    - `hasFeature()`: `false` for a free-tier user; `true` for an ACTIVE
      CG_PLUS subscriber's `unlimited_likes` (and correctly `false` for
      that same user's `see_who_liked_you`, a CG_PRO-only feature — proving
      the check is plan-specific, not "any active subscription grants
      everything"); `true` for a CANCELLED-but-not-yet-`expiresAt`
      subscriber (proving cancel doesn't immediately revoke access); `false`
      for an EXPIRED-status subscriber; and `false` for that same
      CANCELLED-but-valid subscriber once evaluated at a point in time
      *after* their `expiresAt` actually passes (proving the check is
      time-based, not merely status-based).
    - `tryConsumeDailyLike()`: allows exactly the first 20 likes in a UTC
      calendar day and blocks the 21st (without incrementing the stored
      counter past 20); resets to a fresh count of 1 on the next UTC
      calendar day; does NOT reset mid-way through the same UTC day (23:59
      same-day check); and an `unlimited_likes` subscriber bypasses the
      counter entirely, confirmed by checking their `dailyLikeCount` stayed
      at 0 after a call that would otherwise have consumed quota.
  - Frontend: `npm run build` succeeded; `npm run lint` (oxlint) passed with
    the same two pre-existing `only-export-components` warnings carried
    forward from every prior pass, no new warnings introduced by
    `Subscription.jsx` or the `Settings.jsx`/`Discovery.jsx`/`api.js`
    changes.
- **Known limitation carried forward:** DB-touching behavior (actual
  Plan/Subscription persistence, the `Plan.code` unique index and the
  `Subscription` compound `(user, status, expiresAt)` index under real
  concurrent inserts, the startup seed actually running against a real
  database) could not be exercised end-to-end — same root cause
  (unreachable MongoDB in this sandbox) as every prior pass; see
  `PROJECT_STATE.md`'s Known Technical Debt.
- **Next task:** Per the task's own launch instructions, whichever of Task
  #9/#11 is still open, else Task #6 (Final polish). Task #9 (Verification)
  was already complete before this pass started. Task #11 (Admin panel)
  appeared complete or very nearly so by the time this pass finished (role
  fields, admin routes, admin frontend pages, and a Settings link were all
  observed live in the shared working tree) but this pass could not
  directly confirm the other agent's session reached a finished, committed
  state — whoever picks up next should verify that before assuming Task #6
  is unblocked. See `PROJECT_STATE.md`'s "Next Exact Task"/"Next Recommended
  Action" for the full reasoning.

---

## 2026-08-17 — Safety: Report/Block + Safety Center (Task #10) implemented

- **Phase:** Phase 8 — Safety (docs/ROADMAP.md numbering; internal TaskList
  numbering for this same task is #10).
- **Task:** Report and Block user flows plus a Safety Center screen —
  `POST /api/reports` (reason enum + optional details/evidence),
  `POST`/`DELETE`/`GET /api/blocks`, and bidirectional exclusion of blocked
  users from the discovery feed, matches list, and messaging (REST +
  Socket.IO), reachable from a Report/Block menu on Discovery cards and in
  Chat, plus a Blocked Users management screen and a static Safety Center
  screen.
- **Continuity note — recovered from a prior session's mid-task
  interruption.** A previous background session started this exact task and
  produced the entire backend (`backend/models/Block.js`, `Report.js`,
  `backend/routes/blocks.js`, `reports.js`, `backend/constants/
  safetyOptions.js`, `backend/utils/blockUtils.js`, and the discovery/
  matches/socket/server.js wiring) before hitting a session/API limit and
  stopping mid-task, leaving that work uncommitted in the working tree. This
  session picked it up: reviewed every backend file line-by-line against the
  task spec (found it solid — correct validation, dedup, 404s, consistent
  bidirectional-exclusion logic, well-commented) rather than rewriting or
  second-guessing it, re-verified it independently with a fresh integration
  test (see "Tests performed" below, which is new work in this pass, not
  inherited), and then built the entire frontend + this doc pass on top,
  which had not been started yet. This is the project's own
  credit-interruption protocol working as intended — flagged here explicitly
  per that protocol's own convention, same as PROJECT_STATE.md's "Current
  Task" line for this entry.
- **Design decisions:**
  - **Blocking is one-directional to create, bidirectional in effect.**
    `backend/models/Block.js` only ever records the blocker's own decision —
    if the blocked user also wants to block back, they create their own
    separate document. But *nothing else* about a block is one-directional:
    `backend/utils/blockUtils.js#getBlockedUserIds()`/`#isBlockedEitherWay()`
    are the single source of truth for "does a block affect this pair",
    consumed identically by the discovery feed, the matches list, all three
    message routes' `loadAuthorizedMatch()`, and Socket.IO's `match:join` —
    so a blocked user can never see or reach the blocker through any
    surface, and vice versa, regardless of who blocked whom.
  - **Blocking doesn't mutate `Match` (or anything else) — it's a
    query-time filter only.** Unlike unmatch (a permanent, mutating action
    that sets `unmatched`/`unmatchedAt`/`unmatchedBy` on the `Match`
    document itself), a block's effect on an existing match is enforced
    entirely by filtering at read time. This was a deliberate choice (kept
    from the inherited backend work, and endorsed on review): it means
    unblocking is a clean, total undo — the match, its full message history,
    and read receipts all reappear exactly as they were, with nothing to
    "restore" because nothing was ever touched.
  - **Blocking is silent; reporting is confidential.** `POST /api/blocks`
    never creates a `Notification` for the blocked user — they simply stop
    being able to reach or be reached by the blocker, with no explanation
    surfaced anywhere. `POST /api/reports` never notifies the reported user
    either, and nothing about a report is visible to anyone but the
    reporter (their own `POST` response) and, later, an admin — there's no
    `GET /api/reports` "my reports" list, since nothing asked for one and
    the response to the `POST` is the report's only client-visible moment.
  - **Report evidence is plain strings, no automated moderation.** Kept the
    inherited backend's choice not to build a file-upload path for report
    evidence (`evidence` is capped free-text/URL strings) and not to add any
    automated spam/scam/abuse-detection signal — both are explicitly
    documented as out of scope in `MOCK_FEATURES.md`'s two new entries for
    this pass, with automated detection specifically deferred to the
    already-planned V3 "Trust Engine" (see `docs/ROADMAP.md`/`TODO.md`), not
    invented as a new scope decision in this pass.
  - **Frontend: one shared `SafetyMenu` component, not two separate
    Report/Block UIs.** Discovery (report/block a profile card) and Chat
    (report/block the other person in a match) both need the identical
    "⋯ -> Report / Block" interaction against a different target user each
    time — built once as `frontend/src/components/SafetyMenu.jsx` (which
    itself owns opening `ReportModal.jsx` and the block confirm+API call)
    and reused from both places with just `userId`/`userName`/`onBlocked`
    props, rather than duplicating the menu, the confirm dialog, and the
    error handling in each page.
  - **Block confirmation is a plain `window.confirm`, not a custom
    Dialog component.** Per the task spec's explicit allowance
    ("doesn't need to be fancy") and to avoid building a full generic
    Dialog/Modal component (docs/DESIGN_SYSTEM.md lists one but nothing has
    built it yet) just for this one consequential-but-simple confirmation;
    `ReportModal.jsx` still gets a proper Modal-style overlay since it's a
    real form, following `MatchModal.jsx`'s existing pattern.
- **Backend files touched (inherited from the interrupted prior session,
  reviewed and independently re-verified in this pass — see "Continuity
  note" above):** `backend/constants/safetyOptions.js` (new), `backend/
  models/Block.js` (new), `backend/models/Report.js` (new), `backend/utils/
  blockUtils.js` (new), `backend/routes/blocks.js` (new), `backend/routes/
  reports.js` (new), `backend/routes/discovery.js` (feed exclusion),
  `backend/routes/matches.js` (matches-list exclusion + message-route
  authorization), `backend/socket.js` (`match:join` authorization),
  `backend/server.js` (mounted the two new route groups).
- **Frontend files touched (new work this pass):** `frontend/src/
  constants/safetyOptions.js` (new), `frontend/src/api.js` (`reportUser`/
  `blockUser`/`unblockUser`/`getBlockedUsers`), `frontend/src/components/
  ReportModal.jsx` (new), `frontend/src/components/SafetyMenu.jsx` (new),
  `frontend/src/pages/Discovery.jsx` (SafetyMenu overlay on the card photo;
  a successful block removes that card from the queue immediately),
  `frontend/src/pages/Chat.jsx` (SafetyMenu in the header; a successful
  block navigates to `/matches`), `frontend/src/pages/BlockedUsers.jsx`
  (new), `frontend/src/pages/SafetyCenter.jsx` (new, static content),
  `frontend/src/pages/Settings.jsx` (Safety Center + Blocked Users links),
  `frontend/src/App.jsx` (`/safety-center`, `/settings/blocked-users`
  routes).
- **Tests performed (all new work this pass — none of this was inherited):**
  - Backend boots cleanly with `/api/reports` and `/api/blocks` mounted
    alongside the existing seven route groups, no syntax/import errors.
  - Curled `POST/GET/DELETE /api/blocks` and `POST /api/reports` with
    no/bad auth — all return `401`.
  - A standalone Node script (65/65 checks, no live DB) built a REAL
    Express app + real HTTP server + real Socket.IO server mounting the
    ACTUAL `backend/routes/blocks.js`, `reports.js`, `discovery.js`,
    `matches.js`, and `backend/socket.js` files (only the Mongoose model
    modules swapped for tiny in-memory fakes via `require.cache`
    injection, since MongoDB is unreachable in this sandbox — same
    workaround pattern used for every DB-touching test in this project so
    far) and drove it over real HTTP plus one real Socket.IO client<->
    server round trip (`socket.io-client` installed transiently via
    `npm install --no-save --no-package-lock`, used for exactly this test,
    then removed again — never added to `package.json`/`package-lock.json`,
    confirmed via `git status`/`git diff --stat` afterward). Covered: Block
    create-dedup (duplicate `POST` is `200` idempotent, same document, not
    a new one; self-block and invalid-id `400`), Report reason-enum
    validation (all 9 real values from `REPORT_REASONS` round-trip
    correctly; an invalid reason, self-report, and missing reason all
    `400`), and — the core of this task — bidirectional blocking exclusion
    end-to-end with a three-user (A/B/C) setup where A blocks B and C is an
    uninvolved control: B disappears from A's discovery feed AND A
    disappears from B's feed (C's feed unaffected), the A↔B match
    disappears from `GET /api/matches` for BOTH A and B (the unrelated A↔C
    match stays visible for both as a control), `GET`/`POST`-message and
    `PATCH`-read-receipt all `403` for both A and B on the blocked match
    (with zero `Message` documents created), a real Socket.IO
    `match:join` acks `{ok:false}` for both A and B on the blocked match
    while acking `{ok:true}` on the unaffected A↔C match, and after
    `DELETE /api/blocks/:userId` the match reappears and messaging/`GET`
    succeed again (`200`) for both, with a repeat unblock correctly `404`ing.
  - Frontend `npm run build` and `npm run lint` both pass with the new
    `SafetyMenu.jsx`/`ReportModal.jsx`/`BlockedUsers.jsx`/`SafetyCenter.jsx`
    and the Discovery/Chat/Settings/App.jsx wiring; no new lint warnings
    (the two pre-existing `only-export-components` warnings in
    `AuthContext.jsx`/`NotificationContext.jsx` are unrelated and already
    an accepted pattern from prior sessions).
  - The standalone verification script and the transiently-installed
    `socket.io-client` package were both removed before committing — same
    "no scratch/debug files in the tree" convention every prior session on
    this project has followed; confirmed via `git status`/`git diff --stat`
    that only intended app-code/doc files are staged.
  - Not exercised (see PROJECT_STATE.md's Known Technical Debt): real
    MongoDB persistence of `Block`/`Report` (including the `Block` unique
    compound index under real concurrent inserts), and anything involving
    automated abuse detection or file-upload evidence (neither exists —
    both are intentionally out of scope, see `MOCK_FEATURES.md`).
- **Next task:** Task #11 — Admin Panel (basic) (see PROJECT_STATE.md's
  "Next Exact Task" for the full scope breakdown and the note that a
  TaskList tool was not available in this session to cross-check the
  internal task graph directly).

---

## 2026-08-17 — Verification (Task #9) implemented

- **Phase:** Phase 7 — Verification (docs/ROADMAP.md numbering; internal
  TaskList numbering for this same task is #9).
- **Task:** Two independent verification levels for a user's account: mobile
  OTP verification and photo/selfie verification, each with a
  `NOT_VERIFIED`/`PENDING`/`VERIFIED`/`REJECTED`/`EXPIRED` state machine,
  plus `mobileVerified`/`photoVerified` badges surfaced on other users'
  views of a profile (public profile, discovery feed cards, match list
  cards). SMS delivery for the OTP is MOCK/DEV-ONLY (no real provider
  configured); photo verification has no automated face-match and only
  reaches `PENDING` in this pass (approve/reject is a future Admin-panel
  job).
- **Design decisions:**
  - **Verification state lives on `User`, not a separate `verifications`
    collection.** `docs/DATABASE_SCHEMA.md` originally drafted a standalone
    `verifications` collection keyed by `(userId, type)`. Implemented
    instead as two sub-documents directly on `backend/models/User.js`
    (`mobileVerification`, `photoVerification`) — same simplification
    already used for `notificationPreferences` and the `role` field: a
    1:1-with-user, always-fetched-together piece of account trust state
    doesn't need its own collection, and the two levels have different
    enough shapes (one has OTP hashing/expiry, the other has a submitted
    photo + moderation fields) that flattening them into one generic
    `(userId, type, status)` row would have meant a lot of type-conditional
    field access anyway.
  - **Real OTP logic, mocked delivery only.** OTP generation
    (`crypto.randomInt`, not `Math.random()`), hashing (bcrypt, same cost
    factor as password hashing), 10-minute expiry, and a 3-requests-per-
    10-minute sliding-window rate limit are all real, non-mocked logic
    (`backend/utils/verificationUtils.js`). Only the SMS *send* is mocked —
    the OTP is logged to the server console and, **only when
    `NODE_ENV !== 'production'`**, echoed back in the `request-otp`
    response as a `devOtp` field. This was directly verified two ways: a
    real-HTTP integration test with `NODE_ENV=development` confirms
    `devOtp` is present and correct, and a separate run with
    `NODE_ENV=production` confirms it's completely absent from the
    response (while still being logged) — see "Tests performed" below.
  - **Internal fields are `select: false` on the schema, not just omitted
    by a serializer.** `mobileVerification.otpHash`/`otpExpiresAt`/
    `otpRequestTimestamps` and `photoVerification.reviewNotes`/
    `reviewedBy`/`reviewedAt` are marked `select: false` in
    `backend/models/User.js`, so a default `User.findById()` anywhere else
    in the codebase (e.g. a future route someone adds) can't accidentally
    load and leak them — the verification routes that *do* need the OTP
    fields explicitly opt back in via
    `.select('+mobileVerification.otpHash ...')`. This is defense-in-depth
    on top of the explicit-whitelist serializers
    (`toOwnVerificationStatusJSON()`/`toPublicVerificationBadges()` in
    `backend/utils/verificationUtils.js`), not a replacement for them.
  - **Photo verification reuses the existing mock photo-storage pattern,
    factored into a shared helper.** Rather than re-inlining the same
    URL/base64/data-URI validation `backend/routes/profile.js`'s
    `POST /me/photos` already has, pulled it into
    `backend/utils/mockImageUpload.js#resolveMockImageUrl()` and had
    `backend/routes/verification.js`'s photo/submit route call that. Left
    `profile.js` itself untouched (still has its own inline copy) to avoid
    touching a working, already-tested route in an unrelated task — a
    natural follow-up would be to have `profile.js` adopt the shared helper
    too, but that's out of scope here.
  - **Verification badges added to three call sites, not just the one the
    task named.** The task brief only explicitly named
    `GET /api/profile/:userId`, but the frontend brief separately asked for
    badges on Discovery and Matches cards too — since
    `backend/utils/profileSerializers.js#toPublicProfileJSON()` is already
    the shared "public profile" shape reused by
    `backend/routes/discovery.js`'s feed and (indirectly, via the same
    badge-boolean helper) `backend/routes/matches.js`'s `otherUser`, all
    three were updated together (each bulk-fetching verification status for
    its page of results in one query, not N+1) so the frontend requirement
    could actually be met without a follow-up backend task.
  - **`GET /api/profile/me` deliberately does NOT get verification badges
    added to it.** The caller's own badges are served by the already-built
    `GET /api/verification/status` instead, so verification data has one
    authoritative response shape rather than being duplicated (and
    potentially drifting) across two endpoints.
  - **Signup was not changed to collect a phone number.** The task
    described this as a flow that could reuse "whatever signup already
    captures" — signup (`backend/routes/auth.js`) is email/password only,
    so the mobile verification flow collects/confirms the phone number
    itself, via an optional `phone` field on `request-otp`. `users.phone`
    is therefore not unique-indexed (no cross-account collision check in
    this pass) — flagged as technical debt in PROJECT_STATE.md, since the
    original schema draft assumed phone-based signup which never happened.
- **Backend files touched:** `backend/constants/verificationOptions.js`
  (new), `backend/utils/verificationUtils.js` (new), `backend/utils/
  mockImageUpload.js` (new — shared with profile photos in spirit, not code,
  see above), `backend/routes/verification.js` (new — `POST mobile/
  request-otp`, `POST mobile/verify-otp`, `POST photo/submit`,
  `GET status`), `backend/models/User.js` (added `mobileVerification`/
  `photoVerification`), `backend/routes/profile.js` (public `GET /:userId`
  now includes badges), `backend/routes/discovery.js` (feed cards now
  include badges, bulk-fetched), `backend/routes/matches.js` (`otherUser`
  now includes badges, bulk-fetched), `backend/utils/profileSerializers.js`
  (`toPublicProfileJSON()` takes an optional verification-source param),
  `backend/server.js` (mounted `/api/verification`).
- **Frontend files touched:** `frontend/src/api.js` (four new verification
  calls), `frontend/src/components/VerificationBadge.jsx` (new),
  `frontend/src/pages/Verification.jsx` (new — status-driven mobile OTP +
  photo/selfie flows), `frontend/src/App.jsx` (added `/verification` route),
  `frontend/src/pages/Dashboard.jsx` (own badges + a "Get Verified"/
  "Verification" link), `frontend/src/pages/Settings.jsx` (Verification
  link), `frontend/src/pages/Discovery.jsx` (badges on discovery cards),
  `frontend/src/pages/Matches.jsx` (badges + a verified ring on the match
  list's Avatar).
- **Tests performed:**
  - Backend boots cleanly with the new `/api/verification` route group
    mounted alongside the existing six, no syntax/import errors.
  - Curled all four new routes with no/bad auth — all four return `401`.
  - A standalone Node script (38/38 checks, no live DB) directly exercised
    `backend/constants/verificationOptions.js`,
    `backend/utils/verificationUtils.js`, and
    `backend/utils/mockImageUpload.js` in isolation: OTP entropy/format,
    phone masking, phone-format validation, the pure sliding-window
    rate-limit check (allows under the cap, blocks at the cap, prunes
    entries outside the 10-minute window, exact-boundary pruning), OTP
    expiry math, both serializers never leaking any internal/moderation
    field even when the field is deliberately present on the input object,
    the mock image-upload validator's URL/base64/size-cap handling, and
    Mongoose schema-level checks — enum acceptance across all 5 statuses on
    both sub-documents, rejection of an invalid enum value, and (via
    `User.schema.path(...).options.select`) confirming the six internal
    fields are genuinely `select: false` while the client-safe fields are
    not.
  - A second standalone script built a REAL Express app mounting the ACTUAL
    `backend/routes/verification.js` file (only `backend/models/User.js`
    swapped for an in-memory fake via `require.cache` injection, since
    MongoDB is unreachable in this sandbox — same workaround pattern used
    for every DB-touching test in this project so far) and drove it over
    real HTTP with a real signed JWT: 33/33 checks covering request-otp
    (happy path, invalid-phone rejection, missing-phone rejection, rate
    limiting blocking exactly the 4th request in a 10-minute window,
    already-verified short-circuit, allowing verification of a genuinely
    different number even when already verified), verify-otp (correct OTP
    accepted and flips to `VERIFIED`, wrong OTP rejected without changing
    status, expired OTP rejected and flips status to `EXPIRED`, a used OTP
    cannot be replayed, missing OTP body rejected), photo/submit (happy
    path incl. the base64->data-URI path, `409` while already `PENDING`),
    and `GET /status` (correct shape, reflects real state, never leaks
    `otpHash`/`reviewNotes` even when both are deliberately present on the
    fake user).
  - That same request-otp flow was additionally run as a separate
    `NODE_ENV=production` process and confirmed the response body contains
    only `message`/`phone`/`expiresInSeconds` — no `devOtp` key at all —
    while the OTP is still logged server-side, directly verifying the
    "dev-only, never in production" requirement both ways.
  - Frontend `npm run build` and `npm run lint` both pass; no new lint
    warnings introduced (the two pre-existing `only-export-components`
    warnings in `AuthContext.jsx`/`NotificationContext.jsx` are unrelated
    and already an accepted pattern from prior sessions).
  - Not exercised (see PROJECT_STATE.md's Known Technical Debt): real
    MongoDB persistence of the new User fields (including confirming
    `select: false` behavior against an actual query rather than only the
    schema-level `.options.select` check), real concurrent-OTP-request
    races, and anything involving a real SMS/photo-moderation provider
    (neither exists — both are intentionally out of scope, see
    `MOCK_FEATURES.md`).
- **Next task:** Task #10 — Report/Block + Safety Center (see
  PROJECT_STATE.md's "Next Exact Task" for the full scope breakdown and the
  note that a TaskList tool was not available in this session to
  cross-check the internal task graph directly).

---

## 2026-08-17 — Notifications (Task #6) implemented

- **Phase:** Phase 6 — Notifications (docs/ROADMAP.md numbering; internal
  TaskList numbering for this same task was #8 — see the numbering note in
  PROJECT_STATE.md's "Next Exact Task").
- **Task:** Basic in-app notifications for match/like/message events, plus
  per-type preferences: a `Notification` model + REST API, notification
  creation wired into the existing swipe/match and message-send code paths,
  a live `notification:new` Socket.IO event, and a frontend bell/badge +
  dropdown notification center + a new minimal Settings page for the
  preference toggles. Real push delivery (Firebase Cloud Messaging) is
  explicitly out of scope for this pass and marked MOCK/TEMPORARY/deferred.
- **Design decisions:**
  - **No identity in `like` notifications.** Checked `docs/BUSINESS_PLAN.md`
    per the task brief — "see who liked you" is listed as a premium-tier
    (`CG_PLUS`/`CG_PRO`/`CG_ELITE`) reveal. A `like` notification's
    `payload` is therefore always `{}`; only a `match` notification (which
    already mutually reveals both sides) carries `fromUserId`/
    `fromUserName`. There's no premium-reveal code path yet (Subscription
    is Task #10/Phase 10, not started) — when it lands, it can add an
    *additional* enriched notification without changing this shape.
  - **Preferences live on `User`, not a new collection.** A
    `notificationPreferences` sub-document
    (`matchNotifications`/`likeNotifications`/`messageNotifications`, all
    default `true`) was added directly to `backend/models/User.js` — same
    simplification already used for the `role` field (`admin_users`) in
    `docs/DATABASE_SCHEMA.md`. Preference gating is enforced once, centrally,
    inside `backend/utils/notificationUtils.js#createNotification()` (via
    the pure, DB-independent `isNotificationTypeEnabled()`), not duplicated
    at each of the three trigger call sites.
  - **Safety-critical types can't be disabled — by construction, not by a
    runtime check.** `verification`/`safety`/`subscription` simply have no
    entry in `PREFERENCE_FIELD_BY_TYPE`
    (`backend/constants/notificationOptions.js`), so there's no field for a
    client to even attempt to toggle for them; `isNotificationTypeEnabled()`
    always returns `true` for any type not in that map. No code path creates
    those types yet (future phases), so this is future-proofing.
  - **Message-notification suppression reuses existing Socket.IO room
    bookkeeping.** Rather than adding separate presence tracking, every
    socket already auto-joins a per-match room (`match:<id>`) when actively
    viewing a chat (existing Task #5 behavior) — a new
    `backend/socket.js#isUserInRoom()` helper checks that room's connected
    sockets for the recipient before creating a `message` notification, so
    an already-open chat doesn't also produce redundant notification noise.
  - **New per-user Socket.IO room for delivery.** Every connected socket now
    also auto-joins `user:<userId>` on connect (`backend/socket.js`), a
    second room alongside the existing per-match ones. Emitting
    `notification:new` to a room with no connected sockets is a no-op, which
    is exactly "only push live if the recipient is actively connected" from
    the task spec — no separate online/presence check needed.
  - **Frontend socket lifecycle changed.** Previously only `Chat.jsx`
    connected the shared Socket.IO client (on mount) and disconnected it (on
    unmount) — fine when sockets only mattered inside a chat screen, but
    notifications need live delivery from *any* authenticated screen. The
    new `NotificationContext` now connects the socket for the whole
    authenticated session (as soon as `user` is set) and
    `AuthContext.logout()` is what disconnects it; `Chat.jsx` still
    connects defensively if needed but no longer tears the connection down
    on unmount. This is called out explicitly as a technical-debt item to
    re-verify once a real two-browser-session DB-backed test is possible.
- **Backend files touched:** `backend/models/Notification.js` (new),
  `backend/constants/notificationOptions.js` (new — `NOTIFICATION_TYPES`,
  `PREFERENCE_FIELD_BY_TYPE`, pagination defaults), `backend/utils/
  notificationUtils.js` (new — `createNotification()`,
  `isNotificationTypeEnabled()`, `toNotificationJSON()`),
  `backend/routes/notifications.js` (new — `GET /`, `GET /unread-count`,
  `GET`/`PUT /preferences`, `PATCH /read-all`, `PATCH /:id/read`),
  `backend/models/User.js` (added `notificationPreferences`),
  `backend/socket.js` (added `userRoomName()`/`isUserInRoom()`, auto-join on
  connect), `backend/routes/discovery.js` (match/like notification
  creation, wrapped in try/catch), `backend/routes/matches.js` (message
  notification creation with room-presence suppression, wrapped in
  try/catch), `backend/server.js` (mounted `/api/notifications`).
- **Frontend files touched:** `frontend/src/api.js` (six new notification
  API functions), `frontend/src/context/NotificationContext.jsx` (new),
  `frontend/src/components/NotificationBell.jsx` (new), `frontend/src/
  pages/Settings.jsx` (new), `frontend/src/App.jsx` (`/settings` route),
  `frontend/src/main.jsx` (`NotificationProvider` wraps `App`),
  `frontend/src/context/AuthContext.jsx` (`logout()` disconnects the shared
  socket), `frontend/src/socket.js` (comment update — lifecycle ownership
  changed, no code change), `frontend/src/pages/Chat.jsx` (no longer
  disconnects on unmount — see design decisions above), `frontend/src/
  pages/Dashboard.jsx` / `Discovery.jsx` / `Matches.jsx` (added
  `NotificationBell` to nav; Dashboard also gets a Settings link).
- **Tests performed:** Backend server boot-checked clean (all six route
  groups + Socket.IO, no import/syntax errors). Curled every new
  `/api/notifications*` route with no/bad auth → all `401`s, plus a
  regression check that pre-existing `/api/matches`/`/api/discovery/*`
  routes still correctly `401` (unaffected by this session's changes). A
  standalone Node script (38/38 checks, no live DB — same pattern as prior
  sessions) covered: full `Notification` schema validation (all 6 enum
  types, required-field rejection, invalid-type rejection, defaults,
  createdAt-only timestamps, both declared indexes present),
  `User.notificationPreferences` defaults + validation,
  `isNotificationTypeEnabled()`'s preference-gating logic across every
  combination (including proving safety-critical types can't be disabled
  even when every preference field is `false`), and `socket.js`'s
  `roomName()`/`userRoomName()`/`isUserInRoom()` helpers against a fake `io`
  object. A real `socket.io-client` connected a live JWT-authed socket
  against the running server specifically to exercise the new
  `socket.join(userRoomName(...))` connect-time line for real — connection
  succeeded, no server crash, clean server log. Frontend `npm run build`
  and `npm run lint` both pass (one pre-existing unrelated oxlint warning in
  `AuthContext.jsx` carried forward, plus an equivalent one now in the new
  `NotificationContext.jsx` for the same already-accepted
  hook-plus-component-in-one-file pattern). DB-touching behavior (actual
  notification persistence/pagination/preference-gating against real
  writes, a live `notification:new` broadcast reaching a real second
  browser session, the new socket lifecycle across a real login->navigate->
  logout cycle) could not be exercised end-to-end in this sandbox — see
  PROJECT_STATE.md's Known Technical Debt.
- **Docs updated:** `docs/DATABASE_SCHEMA.md` (`notifications` marked
  `[IMPLEMENTED]` with full field/index/divergence detail, new
  `notification_preferences` section describing the `User` sub-document,
  new "Real-time delivery" subsection), `docs/API_DOCUMENTATION.md`
  (Notifications section rewritten from `[PLANNED]` to `[IMPLEMENTED]` with
  full request/response contracts for all 6 routes plus the
  `notification:new` socket event and the trigger-point breakdown),
  `docs/ROADMAP.md` (Phase 6 row marked Complete), `TODO.md` (Notifications
  checklist items checked off, FCM push added as an explicit remaining
  item), `MOCK_FEATURES.md` (FCM push delivery entry rewritten to
  distinguish it from the now-real in-app notification system).
- **Next task:** Task #9 (internal TaskList numbering) / Phase 7 (docs/
  ROADMAP.md numbering) — Verification (mobile OTP + selfie/photo
  verification, verification badge on profiles). See PROJECT_STATE.md's
  "Next Exact Task" for full scope and the numbering-reconciliation note.

## 2026-08-17 — Chat (Task #5) implemented

- **Phase:** Phase 5 — Real-Time Chat
- **Task:** Real-time messaging between matched users: fleshed out the `Message`
  model, REST history/send/read-receipt endpoints nested under
  `/api/matches/:matchId/messages`, a Socket.IO real-time layer sharing the
  Express HTTP server with JWT handshake auth, typing indicators, and a full
  chat UI replacing the `ChatComingSoon.jsx` placeholder.
- **Design decisions (see doc updates below for full detail):** no separate
  `Conversation` collection — a `Match` already uniquely identifies a
  two-person conversation, so messages are queried by `match` directly;
  REST is the single write path for messages (`POST` persists, then emits
  `message:new` via Socket.IO to the match's room) rather than also
  accepting a `message:send` socket event, so there is exactly one code
  path that can ever create a `Message`; newest-first cursor pagination
  (`before=<messageId>`) for message history, chosen over offset pagination
  because it stays correct under concurrent inserts while scrolling back;
  read receipts persist via a REST `PATCH` (not a socket event) for the
  same single-write-path reason, but still broadcast a `message:read`
  socket event so the sender's UI updates live.
- **Backend files touched:** `backend/models/Message.js` (fleshed out from
  the placeholder — `match`/`sender`/`recipient`/`text`/`readAt`, required
  + trimmed + 1-2000-char text validation, compound indexes on
  `(match, createdAt)` and `(match, recipient, readAt)`),
  `backend/constants/chatOptions.js` (new — `MAX_MESSAGE_LENGTH`,
  pagination defaults, same convention as `discoveryOptions.js`),
  `backend/utils/matchUtils.js` (added `isParticipant()`/
  `otherParticipant()` — pure, DB-independent, shared by the REST message
  routes' authorization check and the Socket.IO `match:join` handler so
  both transports enforce identical rules), `backend/middleware/auth.js`
  (extracted `verifyToken()` out of `requireAuth` so socket auth can reuse
  the exact same JWT-verification logic instead of duplicating
  secret-handling), `backend/socket.js` (new — `initSocket()`: JWT
  handshake auth via the shared `verifyToken()`, `match:join`/`match:leave`
  room management with the same participant/unmatched authorization the
  REST routes use, ephemeral `typing:start`/`typing:stop` ->  `typing`
  re-broadcast, `roomName()` helper shared with `routes/matches.js`),
  `backend/routes/matches.js` (added `GET`/`POST /:matchId/messages` and
  `PATCH /:matchId/messages/read`, plus a shared `loadAuthorizedMatch()`
  helper — 400 invalid id, 404 no match, 403 not-a-participant, 403
  unmatched), `backend/server.js` (now creates an `http.Server`, mounts
  Socket.IO on it via `initSocket()`, attaches `io` to the Express app via
  `app.set('io', io)` so route handlers can broadcast after a REST write),
  `backend/package.json` (added `socket.io`).
- **Frontend files touched:** `frontend/src/pages/Chat.jsx` (new — replaces
  `ChatComingSoon.jsx` on the `/chat/:matchId` route; loads history via
  REST on mount, connects + authenticates a Socket.IO client, joins the
  match's room, listens for `message:new`/`typing`/`message:read`, sends
  via REST, auto-scrolls, shows a typing indicator, "load older messages"
  button using cursor pagination, marks incoming messages read), `frontend/
  src/components/ChatBubble.jsx` (new — sent/received bubble variants,
  timestamp, single/double-checkmark read-receipt indicator, per
  `docs/DESIGN_SYSTEM.md`'s component list), `frontend/src/socket.js` (new
  — a lazily-created, reused Socket.IO client singleton, authenticated with
  the stored JWT read fresh on every (re)connect), `frontend/src/api.js`
  (added `getMessages`/`sendMessage`/`markMessagesRead`), `frontend/src/
  App.jsx` (swapped the `ChatComingSoon` import/route for `Chat`),
  `frontend/src/components/MatchModal.jsx` ("Start a conversation" now
  navigates straight to `/chat/:matchId` when the new match's id is known,
  falling back to `/matches` otherwise), `frontend/src/pages/Discovery.jsx`
  (carries the newly-created match's id into `MatchModal` so the CTA above
  has something to route to), `frontend/src/pages/Matches.jsx` (comment
  update only — its link already pointed at `/chat/:matchId`), `frontend/
  src/pages/Dashboard.jsx` (removed the now-stale "chat coming soon" line),
  `frontend/package.json` (added `socket.io-client`); `frontend/src/pages/
  ChatComingSoon.jsx` deleted.
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`conversations` section
  rewritten to explain the Match-as-conversation simplification; `messages`
  moved to `[IMPLEMENTED]` with the full field list, index list, and
  divergence notes — `recipient` added, `status` replaced with nullable
  `readAt`, `attachmentUrl` not implemented); `docs/API_DOCUMENTATION.md`
  (Messaging section rewritten from `[PLANNED]` to `[IMPLEMENTED]` — full
  REST contract for all three routes plus the complete Socket.IO event
  list with payload shapes and the "REST is the single write path" design
  note); `docs/ROADMAP.md` (Phase 5 marked Complete; also brought Phases
  0-4's stale "Not Started" status markers up to date while touching this
  file, since they'd drifted from `PROJECT_STATE.md`'s actual completed-
  features list over the last few sessions); `MOCK_FEATURES.md` (two new
  entries: chat is text-only for this pass — not a mock, image/voice
  attachments were never in scope and are deferred to V2; matches list has
  no last-message preview/unread badge yet — a scope gap, not a mock);
  `TODO.md` (checked off all four Chat items with notes on what shipped).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded every model/route/
    `socket.js` file (no syntax/import errors). Started the server and
    confirmed it boots cleanly with Socket.IO mounted alongside Express, no
    regressions to the existing non-fatal "MongoDB connection error,
    continuing without a database connection" pattern. Curled the three new
    REST routes: no Authorization header -> `401` on all three; bad token
    -> `401` with the correct message; invalid-format `matchId` -> `400`;
    a well-formed but DB-unreachable `matchId` -> `500` after the same
    known Mongoose-buffering-timeout pattern prior phases already hit (not
    a new bug, see Known Technical Debt). Verified the pure/schema-level
    logic with a standalone Node script
    (`_tmp_verify_chat_logic.js`, run against the real model/util files, no
    `mongoose.connect()` call) — 29/29 checks passed, covering
    `isParticipant`/`otherParticipant` (including the fixed edge case where
    a non-participant used to get back an arbitrary other id instead of
    `null` — caught and fixed by this same test script during this
    session), the full 200/403/403-unmatched/404 authorization matrix,
    `roomName()` stability/namespacing, `verifyToken()` accept/reject-wrong-
    secret/reject-expired, and full `Message` schema validation (required
    fields, empty/whitespace text, trimming, exact max-length boundary).
    Additionally — beyond the "pure logic only" pattern prior phases used —
    ran a **live Socket.IO smoke test** with a real `socket.io-client`
    against the running server: no-token and bad-token connections both
    correctly reject with `connect_error`; a validly-signed token connects
    successfully; `match:join` with an invalid-format `matchId` is rejected
    via its ack callback; `match:join` for a well-formed but DB-unreachable
    `matchId` fails gracefully through its ack (`{ ok: false }`) rather than
    crashing the server (confirmed via the server's own log output, which
    showed the caught Mongoose buffering-timeout error, not an uncaught
    exception). All temporary verification scripts and the temporarily
    `--no-save`-installed `socket.io-client` dev dependency used only for
    this live socket test were removed from `backend/` afterward; confirmed
    via `git diff`/`git status` that `backend/package.json`/
    `package-lock.json` only carry the intended `socket.io` addition.
  - Frontend: `npm install` pulled in `socket.io-client` (saved to
    `package.json`), `npm run build` succeeded, `npm run lint` (oxlint)
    passed with only the same pre-existing, unrelated `AuthContext.jsx`
    warning carried forward from every prior phase. Also ran `npm run dev`
    and confirmed the Vite dev server boots cleanly and serves `200` for
    the app shell, confirming no import-time errors in the new
    `Chat.jsx`/`ChatBubble.jsx`/`socket.js` files.
- **Known limitation carried forward:** end-to-end DB-backed testing (two
  real matched users, actual message persistence + pagination against real
  seeded data, an actual two-client Socket.IO room broadcast where both
  sockets are backed by real authorized matches) was not possible in this
  sandbox for the same reason prior phases couldn't verify it either — no
  reachable MongoDB. What *was* newly verifiable in this session beyond
  prior phases' pattern is the full Socket.IO JWT-handshake auth path and
  graceful-failure behavior against the running server, via a live
  `socket.io-client`, since that layer doesn't require a DB connection to
  exercise up to the point where a DB read/write would actually happen.
- **Next task:** Task #6 — Notifications, per `docs/ROADMAP.md`'s canonical
  phase numbering (Notification schema/API, match/like/message notification
  events — this can reuse this session's Socket.IO infrastructure directly
  for real-time delivery instead of building a second real-time channel —
  and a basic in-app notification center UI).

---

## 2026-08-17 — Discovery + Matching (Task #4) implemented

- **Phase:** Phase 3 — Discovery + Matching
- **Task:** Swipe-based discovery feed with pagination/basic filters, Like/Pass
  API, mutual-like match detection with race-safe duplicate-match prevention,
  matches list, and the corresponding frontend (Discovery card stack, "It's a
  Match!" modal, Matches list, chat-coming-soon placeholder).
- **Backend files touched:** `backend/models/Like.js` (new — `fromUser`,
  `toUser`, `action` (`like`/`pass`), unique compound index on
  `(fromUser, toUser)`), `backend/models/Match.js` (fleshed out from the
  placeholder — `userA`/`userB` stored in canonical/sorted order via a
  `pre('validate')` hook so a compound unique index on `(userA, userB)` can
  prevent duplicate matches regardless of which direction the mutual like
  completed in; `users` convenience array kept for "matches involving me"
  queries; `isActive` replaced with `unmatched`/`unmatchedAt`/`unmatchedBy` per
  the product spec), `backend/utils/matchUtils.js` (new — pure, DB-independent
  `canonicalPair()`/`isMutualLike()` helpers, shared by the Match model and the
  swipe route, and directly unit-tested), `backend/constants/
  discoveryOptions.js` (new — `SWIPE_ACTIONS`, feed/matches pagination
  defaults), `backend/utils/profileSerializers.js` (new — `toOwnProfileJSON`/
  `toPublicProfileJSON` extracted out of `routes/profile.js` so discovery feed
  cards and match listings can reuse the exact same "public profile" shape
  instead of duplicating field lists; `routes/profile.js` behavior is
  unchanged, just its serializers moved), `backend/routes/discovery.js` (new —
  `GET /feed` with page-based pagination + `datingIntention`/`city` filters,
  excluding self/already-swiped/already-matched users, with a `TODO` for
  blocked-user exclusion once the Block model exists in a later task;
  `POST /swipe` records a like/pass, handles repeat-swipe as idempotent-200 vs.
  409-conflict rather than an ugly error, and creates a Match on mutual like
  with race-safety via the canonical-pair unique index), `backend/routes/
  matches.js` (new — `GET /` lists the caller's active matches with the other
  participant's basic profile info attached), `backend/server.js` (mounted
  `/api/discovery` and `/api/matches`).
- **Frontend files touched:** `frontend/src/pages/Discovery.jsx` (new — card
  stack with Like/Pass buttons, prefetches the next page as the queue runs
  low, shows `MatchModal` on a mutual match), `frontend/src/pages/
  Matches.jsx` (new — match list using `Avatar`/`Button`, links to a
  chat-coming-soon placeholder per Task #5 not having run yet),
  `frontend/src/pages/ChatComingSoon.jsx` (new — placeholder landing spot for
  a match's conversation), `frontend/src/components/MatchModal.jsx` (new —
  "It's a Match!" modal, clean/fast per `docs/DESIGN_SYSTEM.md`'s direction,
  "Start a conversation" CTA routes to `/matches` since chat isn't built),
  `frontend/src/pages/Dashboard.jsx` (added Discover/Matches nav links),
  `frontend/src/App.jsx` (new `/discover`, `/matches`, `/chat/:matchId`
  protected routes), `frontend/src/api.js` (added `getDiscoveryFeed`/`swipe`/
  `getMatches`, plus a small `toQueryString` helper).
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`likes` and `matches` sections
  moved from bare drafts to `[IMPLEMENTED]` with divergence notes — field
  renames to match the `Profile.user` ref convention, `action` enum
  simplified to `like`/`pass` (no `SUPER_LIKE` yet), `status` replaced with
  `unmatched`; `preferences` section updated to note it's still not a
  persisted collection — Discovery uses ad-hoc query params instead);
  `docs/API_DOCUMENTATION.md` (Discovery and Matching sections moved to
  `[IMPLEMENTED]` with full request/response/validation detail and explicit
  divergence notes — no separate `/api/likes` base path, `maxDistanceKm` not
  implemented, unmatch/"who liked you" not yet built); `MOCK_FEATURES.md`
  (noted the geo/distance-filtering gap — not a mock, a documented scope
  reduction, since the actual swipe/match logic is real); `TODO.md` (checked
  off Discovery feed API/UI, basic filters, Like/Pass API, mutual-match
  detection, match creation/screen; left unmatch and "who liked you" open).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded every model and route file
    (no syntax/import errors). Started the server (`node server.js`) and
    confirmed it boots cleanly with the same non-fatal "MongoDB connection
    error, continuing without a database connection" pattern as prior phases
    — not a regression. Curled the new endpoints: `GET /api/discovery/feed`,
    `POST /api/discovery/swipe`, `GET /api/matches` all return `401` with no
    Authorization header, and `GET /api/discovery/feed` with a bogus token
    returns the correct `{"message":"Invalid or expired token"}` — confirms
    `requireAuth` is correctly wired onto all three new routes. Verified the
    pure business logic that doesn't need a live DB with a standalone Node
    script (`/tmp/.../verify_matching_logic.js`, run against the real
    `Like`/`Match` model files and `matchUtils.js`, no mongoose connection):
    canonical pair ordering is order-independent; the `Match` model
    canonicalizes `userA`/`userB` identically regardless of construction
    order (verified via the real async `.validate()` path — note:
    `validateSync()` does **not** run `pre('validate')` middleware in this
    mongoose version, confirmed directly, so the script deliberately uses
    `.validate()`, which is also the only path the real app ever exercises via
    `.save()`); the `users`-array-length validator; `Like` schema enum/required
    validation; and a simulated end-to-end swipe flow (mutual like -> exactly
    one match, identical repeat swipe -> idempotent 200 not a new match,
    different repeat swipe -> 409 with the original decision preserved,
    unreciprocated third-party like -> no match, both swipe directions
    resolve to the identical canonical pair key) — 24/24 checks passed.
  - Frontend: `npm run build` succeeded; `npm run lint` (oxlint) passed with
    only the same pre-existing, unrelated `AuthContext.jsx` warning already
    noted in the Task #3 entry below.
- **Known limitation carried forward:** end-to-end DB-backed testing (create
  two accounts+profiles, swipe both directions, confirm exactly one Match
  document is created even under a simulated race, list matches, browse a
  filtered discovery feed against real seeded data) was not possible in this
  sandbox for the same reason prior phases couldn't verify it either — no
  reachable MongoDB. The compound unique indexes on `Like` and `Match` are
  schema-correct and their canonicalization logic is unit-tested, but have
  never been exercised against an actual MongoDB write conflict. This should
  be the first thing verified in an environment that does have DB access.
- **Next task:** Task #5 — Chat (Socket.IO server setup, Conversation +
  Message schemas — `Message` already exists as a placeholder needing the
  same treatment `Match` just got — real-time text chat UI, basic read
  receipts/delivery status). Wire it in place of `ChatComingSoon.jsx`.

---

## 2026-08-17 — Profile system (Task #3) implemented

- **Phase:** Phase 2 — Profile System
- **Task:** Full profile creation/editing: Mongoose `Profile` model, CRUD API, age
  derivation with an 18+ hard safety check, weighted profile-completion score, and a
  multi-step (single-page, section-based) profile builder UI wired into routing after
  login/signup.
- **Backend files touched:** `backend/models/Profile.js` (fully fleshed out —
  displayName, dateOfBirth/derived age, gender, interestedIn, datingIntention,
  city/district/state/location, profession, education, bio, interests, languages,
  lifestyle, personalityPrompts, photos, profileCompletionPercentage),
  `backend/routes/profile.js` (`GET/PUT /api/profile/me`, `GET /api/profile/:userId`,
  `POST /api/profile/me/photos`, all behind `requireAuth`),
  `backend/constants/profileOptions.js` (shared enums: genders, dating intentions,
  suggested CG district list, lifestyle enums, fixed personality-prompt bank),
  `backend/utils/profileUtils.js` (age calculation, 18+ check, completion-score
  calculation, completion hints — all pure functions, unit-testable without a DB),
  `backend/server.js` (mounted `/api/profile`, bumped JSON body limit to 10mb for the
  mock base64 photo path).
- **Frontend files touched:** `frontend/src/pages/ProfileBuilder.jsx` (new — single
  form with sections: basic info, dating intention, location, photos, bio/interests/
  lifestyle, personality prompts; used for both first-time creation and later editing,
  pre-filled via `GET /api/profile/me`), `frontend/src/pages/Dashboard.jsx` (now shows
  completion % + top hint + edit-profile CTA), `frontend/src/pages/Login.jsx` /
  `Signup.jsx` (post-auth routing: no profile yet -> `/profile/edit`, otherwise ->
  `/dashboard`), `frontend/src/components/Button.jsx` / `TextField.jsx` / `Avatar.jsx`
  (new reusable components per `docs/DESIGN_SYSTEM.md`'s component list — first three
  started, more to follow as later features need them), `frontend/src/constants/
  profileOptions.js` (frontend mirror of the backend enums), `frontend/src/api.js`
  (added `getMyProfile`/`saveMyProfile`/`getUserProfile`/`addProfilePhoto`),
  `frontend/src/App.jsx` (new `/profile/edit` protected route), `frontend/src/
  index.css` (design-system color tokens, light + dark via `prefers-color-scheme`,
  wired into Tailwind v4's `@theme`), `frontend/src/components/ProtectedRoute.jsx`
  (switched its loading state to the new tokens for consistency).
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`profiles` section rewritten to match
  the real implementation, with explicit divergence notes — most notably
  `datingIntention`'s enum values changed from the original draft, `interests`/
  `personalityPrompts` are free strings / a fixed in-code prompt bank rather than
  separate lookup collections, `photos` is embedded rather than a top-level
  collection, and `languages`/`lifestyle` are new fields not in the original draft);
  `docs/API_DOCUMENTATION.md` (Profile section moved from `[PLANNED]` to
  `[IMPLEMENTED]` with full request/response/validation detail); `MOCK_FEATURES.md`
  (documented the photo-upload mock path in detail — base64/URL stored directly on
  the profile document, no Cloudinary, no moderation).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded the model and routes files
    (confirmed no syntax/import errors, and fixed a Mongoose duplicate-index warning
    along the way). Started the server (`node server.js`) and confirmed it boots
    cleanly and logs the same "MongoDB connection error, continuing without a
    database connection" pattern the auth phase already established — not a
    regression. Exercised `GET /api/health` (200), `GET /api/profile/me` without a
    token (401) and with a bogus token (401, correct message) — auth middleware is
    correctly wired onto the new routes. Attempted a real end-to-end signup ->
    profile create/fetch flow; MongoDB is unreachable in this sandbox (no local
    mongod, no Docker daemon running, and `mongodb-memory-server`'s binary download
    was blocked with a 403 through the outbound proxy) — DB-touching calls fail after
    a 10s Mongoose buffering timeout with the same generic 500 the pre-existing auth
    routes already produce in this same sandbox, so this is consistent prior
    behavior, not a new bug. Verified the pure logic that doesn't need a DB directly:
    age calculation (birthday-boundary cases), the 18+ gate, and the weighted
    completion-score calculation (0% empty, 100% fully filled) all via standalone
    Node scripts.
  - Frontend: `npm install` (no new deps needed — no multer, no extra packages
    pulled in), `npm run build` succeeded, `npm run lint` (oxlint) passed with no new
    warnings (one pre-existing warning in `AuthContext.jsx`, unrelated to this
    change).
- **Known limitation carried forward:** end-to-end DB-backed testing (signup -> login
  -> create profile -> fetch own profile -> fetch another user's public view -> add a
  photo) was not possible in this sandbox for the same reason the auth phase couldn't
  verify it either — no reachable MongoDB. This should be the first thing verified in
  an environment that does have DB access, before or alongside starting Task #4.
- **Next task:** Task #4 — Discovery + Matching (discovery feed API with pagination
  and filters, Like/Pass API, mutual-match detection, discovery feed UI, and the
  `preferences` collection deferred out of the Profile phase).

---

## 2026-08-17 — Authentication system (in progress)

- **Phase:** Phase 1 — Authentication + User System
- **Task:** Implement signup/login/JWT-based authentication (backend routes + middleware,
  frontend auth pages/context), being done by a parallel background agent.
- **Files touched (so far):** `backend/routes/auth.js`, `backend/middleware/auth.js`,
  `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/Login.jsx`,
  `frontend/src/pages/Signup.jsx`, `frontend/src/components/ProtectedRoute.jsx`,
  `frontend/src/pages/Dashboard.jsx`, `frontend/src/api.js`, `backend/routes/health.js`
  (commit `3f440ca` and possibly later commits — check `git log` for the latest state).
- **Tests performed:** Not yet confirmed/verified by this session — see the auth agent's
  own commits/notes for what was tested on their side.
- **Next task:** Confirm the signup -> login -> `GET /api/auth/me` flow works end to end,
  then begin the Profile system (Task #3): Profile Mongoose schema, create/edit profile
  API, multi-step profile builder UI.

---

## 2026-08-17 — Documentation set added

- **Phase:** Phase 0 — Foundation (docs track, run in parallel with Phase 1 code work)
- **Task:** Added the full baseline documentation set: `PROJECT_STATE.md`,
  `IMPLEMENTATION_PROGRESS.md` (this file), `TODO.md`, `BUGS.md`, `SETUP.md`,
  `MOCK_FEATURES.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`,
  `docs/API_DOCUMENTATION.md`, `docs/SCREEN_MAP.md`, `docs/DESIGN_SYSTEM.md`,
  `docs/ROADMAP.md`, `docs/BUSINESS_PLAN.md`, `docs/TESTING_STRATEGY.md`.
- **Files touched:** all files listed above (new files only — no application code touched).
- **Tests performed:** N/A (documentation only); confirmed no `backend/` or `frontend/`
  source files were modified.
- **Next task:** Keep this log and `PROJECT_STATE.md` updated as each future phase/task
  completes; revisit docs once the Profile system (Task #3) lands to mark those API/DB
  sections as implemented instead of planned.

---

## 2026-08-?? — Project scaffold (commit `fd72a17`)

- **Phase:** Phase 0 — Foundation
- **Task:** Scaffold the initial repo: Express backend skeleton and Vite + React +
  Tailwind frontend skeleton, with placeholder Mongoose models and a landing page.
- **Files touched:** `backend/server.js`, `backend/routes/`, `backend/models/User.js`,
  `backend/models/Profile.js`, `backend/models/Match.js`, `backend/models/Message.js`,
  `backend/.env.example`, `backend/package.json`, `frontend/` (Vite + React + Tailwind
  app with placeholder "CG Dating" landing page), root `README.md`, root `.gitignore`.
- **Tests performed:** Backend server starts cleanly; frontend builds cleanly.
- **Next task:** Implement authentication (signup/login/JWT).

---

## 2026-08-?? — Repository and GitHub setup

- **Phase:** Phase 0 — Foundation
- **Task:** Create the GitHub repository (`CG-Dating-App`) and initialize it with an
  initial commit (`95aeb5b`), set up the working branch
  `claude/new-dating-app-repo-r8al13`.
- **Files touched:** initial repo setup (no application files yet).
- **Tests performed:** N/A.
- **Next task:** Scaffold backend and frontend (see scaffold entry above).
