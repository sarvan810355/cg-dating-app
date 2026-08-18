Project: CG-Dating-App
Current Phase: MVP (Phases 0-10 per docs/ROADMAP.md) is **complete**. Task #6 (Final
polish, security audit, documentation wrap-up) closed out the last of the 12 internal
tasks that made up the MVP build. Since then, post-MVP V2 features have been added by
explicit user request: Instagram profile linking (self-reported handle, not OAuth),
Why-You-Match + Smart Icebreakers (Task #15, deterministic heuristics, not real AI),
a Referral program / "Invite & Earn" (Task #17), Safe Date mode + Date Planner
(Task #18), Location/age match preferences + advanced discovery filters + Private
browsing (Task #14), a weighted ranking/recommendation algorithm for the
discovery feed (Task #19), and now Profile Boost + Priority Like (Task #16 — see
"Current Task" below and MOCK_FEATURES.md). **Task #16 is, as of this pass, the
last currently-queued item from this user's post-MVP V2 feature-request batch** —
see "Next Exact Task" below.
Phases 13/14/15 (Testing, full Security Hardening, Deployment) remain cross-cutting
work not yet started — see "Remaining Features" below and docs/ROADMAP.md.
Current Task: **V2 feature, user-requested: Task #16 — Profile Boost + Priority
Like**, added 2026-08-18. This pass's implementation was originally started by an
earlier agent session that crashed on a transient connection error mid-task
(unrelated to the code itself — its last message correctly diagnosed a
verification-script mock-fidelity gap, not a real bug); this session picked the
already-substantially-complete uncommitted working tree back up, verified it end
to end, and committed it. Two consumable-credit premium mechanics: a **Profile
Boost** — a 30-minute (`BOOST_DURATION_MINUTES`, `backend/constants/boostOptions.js`)
visibility spike, new `Boost` model (`backend/models/Boost.js`, one document per
activation, never a mutable "current boost" field), new `backend/routes/boosts.js`
(`GET /api/boosts/status`, `POST /api/boosts/activate`) — and a **Priority Like**
("Super Like" equivalent) — a `priority: true` boolean extension of the existing
`POST /api/discovery/swipe` (new `Like.priority` field, default `false`, only
valid alongside `action: 'like'`), rather than a new `action` enum value, since a
priority like is still fundamentally a like (same match detection, same
already-swiped exclusion, same daily-quota consumption). Both are backed by two
new, simple fungible credit counters on `User`
(`boostCreditsRemaining`/`priorityLikesRemaining`, schema default `1` each so
every signup gets one free taster of each, `min: 0`), consumed via
`backend/utils/entitlementUtils.js#tryActivateBoost()`/`tryConsumePriorityLike()`
— same "always read the real DB state, never trust a client claim" discipline as
the pre-existing `tryConsumeDailyLike()`, checked-before-decremented so a balance
can never go negative and an already-active Boost can never be double-activated
(consumes no credit on the resulting `409`). `Plan.boostCreditsGranted`/
`priorityLikesGranted` (new fields, seeded escalating per tier — CG Plus +1
Boost/+3 Priority Likes, CG Pro +3/+8, CG Elite +5/+15,
`backend/constants/subscriptionOptions.js#DEFAULT_PLANS`) top up both balances
additively, ONE TIME, on `POST /api/subscription/subscribe`
(`backend/utils/entitlementUtils.js#grantPlanCredits()`) — **honestly scoped: not
a recurring monthly re-grant**, since no job scheduler exists anywhere in this
codebase to detect a renewal (see `MOCK_FEATURES.md`). **The ranking integration
is the mechanically interesting part:** `backend/utils/discoveryRankingUtils.js`'s
`computeRankScore()` (Task #19's four-signal weighted blend) now also adds two
flat, deliberately NON-weighted, NON-clamped post-blend bonuses — `+30`
(`BOOST_RANK_BONUS`) for any candidate with a currently-active Boost, `+25`
(`PRIORITY_LIKE_RANK_BONUS`) for a candidate who has priority-liked THIS specific
viewer and hasn't been swiped back yet, stackable to `+55` — resolved via one
bulk query each (`getActiveBoostedUserIds()`, and a single indexed `Like.find()`
for pending priority-likers) against the already-eligibility-filtered candidate
pool, never against the full user base. **Verified this never bypasses Task #14's
eligibility filtering:** both bonuses are computed strictly from
`eligiblePool` — the MongoDB `filter`-driven output of Task #14's hard
gender/age/distance/verified/incognito/block gate — and only ever affect
`rankScore`, the sort key; a boosted or priority-liking candidate can rank
higher within that pool, it can never appear outside it. See
`docs/API_DOCUMENTATION.md`'s §15 and `docs/DATABASE_SCHEMA.md`'s `boosts`
section for the full contract, and this file's "Last Successful Test" entry
below for the verification detail.
Before this, Task #19 — a weighted ranking/recommendation algorithm for the
discovery feed, added 2026-08-18
("hamare dating app ke matching function aur profile suggestion ko algorithm
samjha kar optimize karo, jaise other dating apps kaam karte hain"). Task #14
(prior pass, see below) built the ELIGIBILITY layer — a hard MongoDB-query-level
yes/no gate (bidirectional gender/age, distance cap, dating-intention,
verified-only, incognito, blocks, already-swiped/matched, suspended) — but the
feed still returned eligible candidates in plain `createdAt`-desc query order,
not ranked by predicted mutual interest. This task adds the RANKING layer on
top, kept structurally distinct from eligibility (ranking only ever reorders
what eligibility already allowed through — it can never surface an ineligible
candidate and can never drop an eligible one). New
`backend/utils/discoveryRankingUtils.js` — a heuristic weighted scorer (NOT a
real ML model; no training data/ML infra exists in this project, same honest
pattern as Task #15/#18's other "not real AI" features) —
`computeRankScore()` blends four signals, each independently normalized to
0-100 before weighting: **compatibility** (`weight 0.45`, the heaviest — Task
#15's own `computeCompatibility()` score, reused directly rather than
re-derived a third time), **distance closeness** (`weight 0.20` — reuses Task
#14's `geoUtils.js#haversineDistanceKm()`, relative to the caller's own
`maxDistanceKm` preference; a missing/unresolvable distance gets the neutral
midpoint `50`, never a penalty — same fail-open philosophy as Task #14's
distance filter itself), **profile trust/completeness** (`weight 0.20` —
`profileCompletionPercentage` contributes up to 60 points, `mobileVerified`/
`photoVerified` each add 20 — a genuine incentive to verify), and **recent
activity** (`weight 0.15` — `users.lastLoginAt`, the ONLY genuine "last
active" timestamp anywhere in this codebase, already stamped on every login by
existing code — decayed linearly from 100 to 0 over 30 days of inactivity;
deliberately NOT proxied from `profiles.updatedAt`, which only reflects
content edits, not activity, and no new field/migration was needed). Weights
sum to `1.0` and are named constants
(`discoveryRankingUtils.js#DEFAULT_RANKING_WEIGHTS`) that are also genuinely
**admin-configurable at runtime** — new
`GET`/`PATCH /api/admin/discovery/ranking-weights` (`backend/routes/admin.js`,
`ADMIN`+, validated non-negative + sums to ~1.0, audit-logged) — fulfilling
docs/BUSINESS_PLAN.md's "must remain configurable" expectation for this MVP
pass; **honestly scoped:** that configuration is an in-process object only,
not yet persisted to the database (a server restart resets to the shipped
defaults — see `docs/DATABASE_SCHEMA.md`'s `discovery_ranking_config`
divergence note for what a real persisted version would need).
`GET /api/discovery/feed` (`backend/routes/discovery.js`) now fetches a
bounded pool of already-eligible candidates
(`RANKING_POOL_SIZE = 150`, `backend/constants/discoveryOptions.js` —
deliberately NOT the entire eligible user base, for efficiency), applies Task
#14's distance fail-open filter over that whole pool, computes
`compatibility` + `rankScore` per pooled candidate (one query each for
Profile/User data, no N+1), sorts descending by `rankScore`, and only THEN
applies the `page`/`limit` pagination window over the already-sorted pool —
so every page for a given "pool draw" is ranked consistently.
**Response transparency:** each Discovery card now also carries the same
`compatibility: { score, reasons }` field `GET /api/matches` already
returns (computed once per candidate either way, so this is free), and
`frontend/src/pages/Discovery.jsx` shows it via the existing (Task #15)
`CompatibilityBadge` component plus the single top reason as a small text
line — deliberately light-touch, ranking itself stays otherwise invisible (no
score/order shown), matching how real dating apps surface "why" without ever
showing a raw ranking number. See `docs/API_DOCUMENTATION.md`'s Discovery
section for the full algorithm/weights/pagination-composition writeup, and
this file's "Last Successful Test" entry below for the verification detail.
Before this, Task #14 — Location/age match preferences + advanced discovery
filters + Private browsing, added 2026-08-18 ("location preference ... jaise
other dating apps kaam karte hain"). Persisted
`profiles.preferences` sub-document (`maxDistanceKm`, `minAge`/`maxAge` with a hard
18-year floor re-enforced at three layers — schema `min`, route validation, and
`getEffectivePreferences()`'s own floor — `datingIntentions`, `verifiedOnly`) plus
`profiles.location` (GeoJSON Point, 2dsphere-indexed) / `profiles.locationSource`
(`'device'` vs `'approximate_city'`) and `profiles.privacySettings.incognito`, all
read/written through the existing `PUT /api/profile/me` partial-merge — no new
profile endpoint. **THE CRITICAL FINDING of this task's audit:**
`GET /api/discovery/feed` (`backend/routes/discovery.js`, originally built in Task
#4) previously applied **NO gender filtering at all, in either direction** — every
user of every gender was shown to every other user regardless of `interestedIn`. This
is now fixed bidirectionally: a candidate is only shown if (a) the candidate's gender
is something the caller wants to see AND (b) the caller's gender is something the
candidate wants to see (an empty/unset `interestedIn`, or one containing `'everyone'`,
is treated as permissive — no filter — matching this codebase's existing convention
for unset optional preferences). Age-range matching is the same shape of bidirectional
rule (candidate's age must fit the caller's `[minAge, maxAge]` preference AND the
caller's age must fit the candidate's own stated preference), implemented as an
indexable `dateOfBirth` range query for "my preference filters them" and a `$expr` +
`$ifNull` comparison for "their preference filters me" (their preference varies per
document, so it can't be a static range). Both rules are documented as pure,
independently-unit-testable functions in the new
`backend/utils/matchPreferenceUtils.js` (`isGenderMutuallyCompatible`,
`isAgeMutuallyCompatible`, `getEffectivePreferences`, `dobRangeForAgeRange`) — the
Mongo query in `discovery.js` implements the *same* rules directly for query
efficiency, with inline comments cross-referencing exactly which rule from that file
each query fragment corresponds to; Task #19's ranking layer should reuse these
functions rather than re-deriving the eligibility rules a third time. Distance
filtering (new `backend/utils/geoUtils.js` — `haversineDistanceKm`,
`resolveApproxCoordinates`, `isWithinDistance`) runs in application code, not a native
Mongo `$near`/`$geoWithin` query, and is **honestly limited**: this project has no
geocoding API key configured anywhere (no Google Maps/Mapbox credentials, the same
"unconfigured external integration" pattern already true of Cloudinary/Razorpay/FCM/
SMS — see MOCK_FEATURES.md), so real device-geolocation capture (frontend's
explicit-consent "Use my current location" button in `ProfileBuilder.jsx`, wired to
`PUT /api/profile/me`'s `latitude`/`longitude`) is the primary path, and every profile
that hasn't granted it falls back to a static, hand-maintained
Chhattisgarh city/district → approximate town-center-coordinate lookup table
(`backend/constants/cgLocationOptions.js`, ~35 entries). A city/district not in that
table gets no coordinate at all, and `isWithinDistance()` is deliberately fail-open:
missing coordinates on either side never exclude a profile, they just make distance
unknown (`distanceKm: null` in the response) — see `MOCK_FEATURES.md`'s Task #14
entry for the full "why not a real geo query yet" writeup. Also new: one-off,
non-persisted query-param overrides (`?maxDistanceKm=`/`?minAge=`/`?maxAge=`/
`?verifiedOnly=`, 400 on invalid values) for a "search wider" UX without touching
saved preferences; `verifiedOnly` filtering (reuses Task #9's `photoVerification`
status); and Private/Incognito browsing (`profiles.privacySettings.incognito` —
`GET /api/discovery/feed` excludes any incognito user via `$ne: true`, with no other
route changed — an incognito user still appears in existing matches/chats, only new
discovery is affected). The legacy Task #4 `?datingIntention=`/`?city=` ad-hoc query
params are preserved unchanged for backward compatibility. Frontend: new
`frontend/src/pages/DiscoveryPreferences.jsx` (linked from Settings — sliders/selects
for all five preference fields plus incognito toggle), `frontend/src/pages/
ProfileBuilder.jsx` ("Use my current location" button, browser Geolocation API),
`frontend/src/pages/Discovery.jsx` ("Search wider" button using the query-param
override + per-card distance display when known), `frontend/src/constants/
discoveryOptions.js` (new, mirrored enums/caps). See `docs/DATABASE_SCHEMA.md`'s
`profiles.preferences`/`profiles.location` sections and
`docs/API_DOCUMENTATION.md`'s Discovery section for the full contract, and this
file's "Last Successful Test" entry below for the verification detail.
Before this, Task #18 — Safe Date mode + Date Planner, added 2026-08-18. Two
independent pieces (docs/ROADMAP.md's Phase 12):
**Safe Date mode** — `SafeDate` model (`backend/models/SafeDate.js`: `user`, optional
`match`, free-text `location` — an "approximate public location", explicitly **never**
exact GPS coordinates or silently-tracked device location, per the product spec's
privacy requirement — `plannedStartAt`/`plannedEndAt`, optional
`trustedContactName`/`trustedContactPhone`, `status` enum
`PLANNED`/`CHECKED_IN`/`COMPLETED`/`MISSED_CHECKIN`/`CANCELLED`, `checkedInAt`), owner-
only CRUD (`POST /api/safe-dates`, `GET /api/safe-dates`(`/:id`),
`PATCH .../check-in`|`/complete`|`/cancel` — `backend/routes/safeDates.js`; a
mismatched id is a `404`, matching this codebase's existing "don't leak existence of
another user's record" convention, not a `403`). **"Missed check-in" and the pre-date
reminder are both READ-TIME computations** (`backend/utils/safeDateUtils.js#computeSafeDateStatus()`/
`applySafeDateComputation()`), not a real background job or a real alert — there is no
job scheduler anywhere in this codebase (no `node-cron`, no task queue) and no real
SMS/push provider configured (same MOCK/DEV-ONLY gap already true of mobile-OTP
delivery): every `GET /api/safe-dates`/`GET /api/safe-dates/:id` call recomputes
`isOverdue` (30 min past `plannedStartAt`, no check-in) fresh, persists a
`PLANNED` → `MISSED_CHECKIN` transition once 120 min past `plannedEndAt` with still no
check-in, and — the first time a read lands inside the 60-min-before-`plannedStartAt`
reminder window — creates a genuine in-app `Notification` (type `'safety'`, reusing
`backend/utils/notificationUtils.js#createNotification()`, gated by a new
`reminderNotifiedAt` field so it never duplicates) rather than faking a "notification
was sent" claim; **no SMS/call is ever sent to the trusted contact**, that phone
number is stored for the user's own reference only — see MOCK_FEATURES.md's Safe Date
entry for the full "why read-time, not a scheduler" writeup. **Date Planner** —
`GET /api/date-ideas?budget=&activityType=&city=` (`backend/routes/dateIdeas.js`,
`backend/utils/datePlanUtils.js`), a **stateless, curated, NOT-real-AI** suggestion
generator (no `ANTHROPIC_API_KEY` configured, same constraint already true of Task
#15's Icebreakers/Why-You-Match) returning 2-4 suggestions from a 10-item in-code list
of Chhattisgarh-relevant, **always-public** places/activities (cafés, restaurants,
parks, multiplexes, public lakes/gardens — never anything isolated/private, per the
product spec's explicit safety rule), with progressive filter relaxation so the
response is never empty or single-item. Frontend:
`frontend/src/pages/PlanSafeDate.jsx` (the planning form — location/start/end/
optional trusted-contact fields, reachable from Chat's new "Safe Date" header link,
carrying `?matchId=`), `frontend/src/pages/SafeDates.jsx` ("My Safe Dates" — upcoming/
past lists, overdue/reminder banners driven directly by the API's `isOverdue`/
`isReminderWindow` fields, Check-In/Complete/Cancel actions, reachable from Settings),
`frontend/src/pages/DateIdeas.jsx` (standalone from Settings, and linked from the
planning form's "need ideas?"), `frontend/src/constants/dateIdeaOptions.js` (mirrored
enums for the two select dropdowns). Concurrency note: this task was built alongside
Task #15 (Icebreakers, already committed, touched `Match`/`matches.js`) and Task #17
(Referral program, touched `User.js`/`auth.js`) on the same branch — this task's own
backend changes were entirely new files (`SafeDate.js`, `safeDates.js`,
`dateIdeas.js`, `safeDateUtils.js`, `datePlanUtils.js`, two new constants files) plus
one small additive mount in `server.js`; frontend changes touched `App.jsx`
(new routes), `Settings.jsx` (two new links), and `Chat.jsx` (one new header link) —
all additive, alongside whatever the other two tasks already had in those same three
frontend files, kept and rebased onto rather than overwritten. See
`IMPLEMENTATION_PROGRESS.md`'s newest entry for the full verification detail.
Before this, Task #17 — Referral program ("Invite & Earn"), added 2026-08-18. Every user gets a unique, human-shareable 7-character
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
scope). See docs/SECURITY_AUDIT.md for the complete audit writeup; **Location/age
match preferences + advanced discovery filters + Private browsing (Task #14, this
pass)** — see "Current Task" above for the full writeup; in one line: persisted
`profiles.preferences`/`profiles.location`/`profiles.privacySettings.incognito`, a
critical fix making Discovery's gender AND age matching genuinely bidirectional
(previously zero gender filtering existed), and application-layer distance filtering
against either real device coordinates or an approximate city-lookup fallback.
Features In Progress: None — the MVP (Phases 0-10) is complete. Next work is either V2
feature scope or the cross-cutting Phases 13-15 (Testing, full Security Hardening,
Deployment) — see "Next Exact Task" below.
Remaining Features (all deliberately out of MVP scope, not gaps in this pass): AI
Profile Coach and a real-AI version of AI Date Ideas (V2, would need a real Claude API
integration — see MOCK_FEATURES.md; Why-You-Match and Smart Icebreakers are already
implemented as deterministic heuristics, and Date Planner is already implemented as a
curated heuristic suggestion generator — not the same as a future real-AI "AI Date
Ideas" — see "Current Task" above), real Razorpay integration, voice/video calling,
real Instagram OAuth (all V2 — Referral program, Safe Date mode/Date Planner,
Location/age preferences + advanced filters + Private browsing, the weighted
discovery-ranking algorithm, and now Profile Boost + Priority Like are all
implemented, see "Current Task" above); CG Connect/Events, advanced Trust Engine, a genuinely
**learned/trained** ML recommendation model (Task #19's ranking is a documented
heuristic weighted scorer, not this — see "Current Task" above and MOCK_FEATURES.md),
advanced admin
analytics, statewide/national expansion, city-scale SEO pages, Capacitor native wrapper
(all V3). Also still deferred within already-shipped MVP features (unchanged from
before this pass, see TODO.md for the full list): unmatch, "who liked you" reveal
screen, image/voice chat messages, matches-list last-message preview/unread badge,
real FCM push delivery, real SMS/OTP provider delivery, real Razorpay integration,
report evidence file upload, automated spam/scam/abuse detection ("Trust Engine"),
`GET /api/admin/audit-logs` (the model/index exist, nothing reads them back yet),
permanent ban/account-deletion (suspend/reinstate only, reversible). The persisted
`preferences` sub-document itself (age range/distance/dating-intention/verified-only)
and the discovery ranking algorithm are no longer on this list — implemented in Task
#14 and Task #19 respectively.
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
FCM push, Razorpay checkout are all MOCK/TEMPORARY). Discovery now HAS real
gender/age/distance/intention/verified-only filtering (Task #14, this pass), but
distance filtering still relies on an approximate city-coordinate lookup rather than
a real geocoding API (no Google Maps/Mapbox key configured — see MOCK_FEATURES.md's
Task #14 entry) and runs in application code rather than a native Mongo geo query.
Chat is text-only. Report evidence is plain strings, no file upload. No
automated test suite exists in either backend/ or frontend/ (see
docs/TESTING_STRATEGY.md). BUG-001 (rate limiting/security headers beyond auth) is
tracked from a prior pass — see above.
Last Successful Test (Task #16 — Profile Boost + Priority Like, this pass, recovered
after a prior session's transient crash): Backend — `node -e "require('./server.js')"`
boots cleanly, no import/syntax errors, listens on port 5000; live `curl` against
`GET /api/boosts/status` and `POST /api/boosts/activate` with no `Authorization`
header both returned 401. A standalone Node verification script
(`backend/__verify_task16.js`, run from inside `backend/` so `node_modules`
resolved, deleted before commit per this project's established convention —
already present, complete, and correct in the crashed session's uncommitted
working tree; this session ran it as-is and confirmed all 58 checks passed, no
fix needed) covered six parts: (A) pure-function checks on
`discoveryRankingUtils.js#computeRankScore()` — a boosted score is exactly
baseline `+ BOOST_RANK_BONUS (30)`, a priority-liked score is exactly baseline
`+ PRIORITY_LIKE_RANK_BONUS (25)`, both stack to exactly `+55`, and default
`isBoosted`/`hasPendingPriorityLike` are `false` (no behavior change for
pre-existing callers); (B) schema `validateSync()` checks — `User`'s two new
credit fields default to `1` and reject a negative value, `Plan`'s two new grant
fields default to `0`, `Like.priority` defaults to `false`, `Boost` accepts a
valid `source` and rejects an unknown one, and `DEFAULT_PLANS`' grants escalate
CG_PLUS < CG_PRO < CG_ELITE for both credit types; (C) HTTP-level, hijacking
`require.cache` for `User`/`Boost` with fake in-memory stores (same
fake-model-over-real-route-over-real-HTTP pattern this project has used since
Task #6) and mounting the REAL `backend/routes/boosts.js` — confirmed
`GET /api/boosts/status` and `POST /api/boosts/activate`'s full lifecycle: 30-
minute duration, credit decremented from 1 to 0 and actually persisted, a
double-activate returns `409` without a further decrement, a 0-credit user gets
`402` with `upgradeRequired: true` and never goes negative, both routes 401
with no auth; (D) HTTP-level over the REAL `backend/routes/discovery.js`'s
`POST /swipe` with `priority: true` — credit decremented, `Like.priority`
persisted `true`, a second priority like with 0 credits remaining returns `402`
and never goes negative, `priority: true` on a `'pass'` and a non-boolean
`priority` both return `400`, and an ordinary like (no `priority` field) is
unaffected and reads `priority: false`; (E) HTTP-level over the REAL
`GET /api/discovery/feed` — a boosted candidate ranks first, a candidate who
priority-liked THIS viewer ranks above an otherwise-identical plain candidate,
a DIFFERENT viewer who was never priority-liked sees no such reordering, and —
the critical eligibility check — a candidate who is both boosted AND blocked by
the viewer is excluded from the feed entirely, proving the ranking bonus never
bypasses Task #14's hard eligibility filter; (F)
`entitlementUtils.js#grantPlanCredits()` — additive `$inc` top-up (`2+3=5`,
`1+8=9`, confirmed persisted), and a `0`/`0`-grant plan is a genuine no-op.
Frontend — `npm run build` clean (no errors, `dist/` produced, 402.81 kB main
bundle); `npm run lint` (oxlint) — 0 errors, the same 2 pre-existing
`only-export-components` warnings carried forward (also present, unrelated to
this task, in the untouched `NotificationContext.jsx`), no new warnings.
Before this, Task #19 — weighted discovery ranking algorithm, prior pass:
Backend — `node -e "require('./server.js')"` boots cleanly, no import/syntax errors,
listens on port 5000; `GET /api/health` 200; `curl` against `GET /api/discovery/feed`
with no `Authorization` header, and separately with a garbage bearer token, both
returned 401 (auth gating unaffected by this pass's changes); pagination query params
(`?page=&limit=`) accepted without error against the unauthenticated 401 path (the
standing sandbox limitation — no live MongoDB in any of these sandboxes — means the
full authed+ranked response body itself still can't be curl-exercised end-to-end; see
"Known Technical Debt"). Three standalone Node scripts (all run from inside `backend/`
so `node_modules` resolved, all deleted before commit per this project's established
convention): (1) a pure-function script loading the REAL
`backend/utils/discoveryRankingUtils.js` directly (no DB) — confirmed the default
weights sum to exactly `1.0` and compatibility is the heaviest; `computeDistanceScore()`
returns the documented neutral midpoint for a `null` distance (never a penalty),
scales linearly from 100 (0km) to 0 (at the caller's own `maxDistanceKm`), and never
goes negative or throws on a degenerate `maxDistanceKm<=0`; `computeTrustScore()`
correctly weights completion (max 60) vs. verification (max 40, 20 each); `
computeActivityScore()` returns 100 for "just logged in", ~50 at the halfway point of
the 30-day decay window, 0 well past it, and the neutral midpoint (never a penalty)
for a `null`/invalid `lastLoginAt`; an end-to-end `computeRankScore()` check confirmed
a realistic highly-compatible + close + verified + complete + recently-active fixture
scores strictly higher than a poorly-compatible + far + unverified + incomplete +
dormant one, that an unknown/missing distance never crashes and scores BETTER than a
known near-the-cap distance (never unfairly tanked by a data gap), and that sorting a
mixed pool by `rankScore` puts the strong fixture first and the weak one last;
`setRankingWeights()` validation confirmed to reject a negative weight and a
weights-sum outside the ~1.0 tolerance (leaving the stored weights unchanged on
rejection) while accepting and correctly applying a valid partial update — 33 checks,
all passed. (2) an HTTP-level script hijacking `require.cache` for
`Profile`/`Like`/`Match`/`User`/`Block` with fake in-memory stores (same
fake-model-over-real-route-over-real-HTTP pattern this project has used since Task
#6) and mounting the REAL `backend/routes/discovery.js` over real HTTP with 3 fixture
candidate profiles (close+strong+verified+complete+active,
far+weak+unverified+incomplete+dormant, and a third with no resolvable location at
all) — confirmed all 3 already-eligible fixtures are returned (ranking never drops an
eligible candidate), the close/strong candidate ranks first and the far/weak one
ranks last, the no-location candidate is never unfairly tanked to last place
(fail-open distance), each card carries a genuine non-fabricated `compatibility`
field (a disjoint pair scored exactly `0`), `distanceKm` is a small known number for
the close candidate and exactly `null` for the no-location one, and
`?page=&limit=` pagination correctly windows the already-sorted pool (`hasMore: true`
mid-pool, `hasMore: false` once exhausted) — 18 checks, all passed. (3) a second
HTTP-level script for the new admin routes, same hijacking pattern, mounting the REAL
`backend/routes/admin.js` — confirmed `GET`/`PATCH /api/admin/discovery/ranking-weights`
401 with no auth, 403 for a plain `USER` and for a `MODERATOR` (below the `ADMIN`+ tier
this route requires), 200 for `ADMIN`; `PATCH` correctly 400s on a negative weight and
on weights that don't sum to ~1.0, and a valid `PATCH` is genuinely applied and visible
on a subsequent `GET` — 10 checks, all passed. Frontend — `npm run build` clean (no
errors, `dist/` produced); `npm run lint` (oxlint) — 0 errors, the same 2 pre-existing
`only-export-components` warnings carried forward, no new warnings.
Last Successful Test (Task #14 — Location/age match preferences + advanced discovery
filters + Private browsing, this pass): Backend — `node -e "require('./server.js')"`
boots cleanly with no import/syntax errors, listens on port 5000; `curl` with no
`Authorization` header on `GET /api/discovery/feed` returned 401, and with a garbage/
malformed bearer token also returned 401 (the standing sandbox limitation — no live
MongoDB in any of these sandboxes — means the full authed feed flow itself still
can't be exercised end-to-end; see "Known Technical Debt"). A standalone Node script
(`backend/__verify_match_preferences.js`, run from inside `backend/` so
`node_modules` resolved, deleted before commit per this project's established
convention) loaded the REAL `backend/utils/matchPreferenceUtils.js` and
`backend/utils/geoUtils.js` directly, no DB connection needed: confirmed
`isGenderMutuallyCompatible()` is genuinely bidirectional (mutual interest → true;
one side interested but not reciprocated → false; unset/empty/`'everyone'`
`interestedIn` on either side treated as permissive, still requiring the *other*
side's interest); confirmed `isAgeMutuallyCompatible()` rejects a candidate whenever
either side's own stated age-range preference excludes the other's actual age (both
directions tested independently); confirmed `getEffectivePreferences()` correctly
layers query-param overrides on top of stored preferences and still enforces the
18-year minAge floor even when an override tries to go below it; confirmed
`dobRangeForAgeRange()`'s date-math bounds agree with `calculateAge()`-style whole-
year age calculation at the range edges (in-range/too-young/too-old DOBs all landed
correctly); confirmed `haversineDistanceKm()` returns sane, correctly-ordered
distances for a known short city pair (Raipur–Durg, ~36km) vs. a known long pair
(Raipur–Bilaspur, ~106km) vs. a genuinely far reference point (~932km); confirmed
`resolveApproxCoordinates()` returns real `[lng, lat]` for a known Chhattisgarh city
and `null` for an unlisted one; confirmed `isWithinDistance()` is fail-open (returns
`withinDistance: true, distanceKm: null`, never excludes) when either side's
coordinates are missing, while still correctly including/excluding when both
coordinates are present. 23 checks, all passed. Frontend — `npm run build` clean (no
errors, `dist/` produced); `npm run lint` (oxlint) — 0 errors, the same 2 pre-existing
`only-export-components` warnings (`AuthContext.jsx`/`NotificationContext.jsx`,
unrelated to this task) carried forward, no new warnings.
Last Successful Test (Task #18 — Safe Date mode + Date Planner, prior pass): Backend —
`node -e "require('./server.js')"` boots cleanly (mounted alongside Task #17's
`referralsRouter`, already present on the shared `server.js` when this pass started),
no import/syntax errors; `GET /api/health` 200; `curl` with no `Authorization` header
on every new route (`POST/GET /api/safe-dates`, `GET/PATCH /api/safe-dates/:id*`,
`GET /api/date-ideas`) returned 401, confirming none of the existing routes'
auth-gating broke. Two standalone Node scripts (run from inside `backend/` so
`node_modules` resolved, both deleted before commit per this project's established
convention): (1) `__verify_safedate.js` hijacked `require.cache` for `models/
SafeDate.js` with a fake in-memory store and mounted the REAL
`backend/routes/safeDates.js` over real HTTP (same fake-model-over-real-route pattern
used by every prior task's DB-independent verification in this project) — confirmed
the full create → check-in → complete lifecycle and the cancel path, validation
errors (missing `location`, `plannedEndAt` before `plannedStartAt`, `plannedStartAt`
in the past), and — the specific ask for this task — that a second user gets `404` on
`GET`/`PATCH .../check-in`/`.../complete`/`.../cancel` for the first user's plan, and
that user's plan never appears in the second user's own `GET /api/safe-dates` list;
24 checks, all passed. (2) `__verify_safedate_logic.js` exercised
`computeSafeDateStatus()` (no DB, no HTTP — a pure function) across 9 `now`/
`plannedStartAt`/`plannedEndAt` combinations: far-future (not overdue, not in
reminder window), inside the 60-min reminder window, just past `plannedStartAt`
within the 30-min check-in grace (not yet overdue), well past `plannedStartAt` but
not yet past `plannedEndAt` + 120-min grace (`isOverdue: true`, status still
`PLANNED`), well past that grace deadline (persists `MISSED_CHECKIN`), one minute
before that deadline (still `PLANNED`), and that `CHECKED_IN`/`COMPLETED`/
`MISSED_CHECKIN` states are all left alone (no re-computation) — plus
`getDateIdeaSuggestions()` filtering (always 2-4 results including the narrow-combo
fallback-relaxation path, city personalization applied, and a keyword scan confirming
no curated idea's text mentions a private/isolated location); 30 checks, all passed.
Frontend — `npm run build` clean (no errors, `dist/` produced); `npm run lint`
(oxlint) — 0 errors, the same 2 pre-existing `only-export-components` warnings
carried forward, no new warnings (one `no-unused-vars` warning introduced then fixed
during this pass, see `IMPLEMENTATION_PROGRESS.md`'s newest entry).
Last Successful Test (Task #17 — Referral program, prior pass): Backend —
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
Last Modified Files (Task #16 — Profile Boost + Priority Like, this pass, recovered
after a prior session's transient crash): backend/models/Boost.js (new — one
document per activation), backend/routes/boosts.js (new — GET /status,
POST /activate), backend/constants/boostOptions.js (new — BOOST_DURATION_MINUTES=30,
BOOST_SOURCES, FREE_BOOST_CREDITS/FREE_PRIORITY_LIKES=1 each),
backend/models/Like.js (new `priority` boolean, default false),
backend/models/Plan.js (new `boostCreditsGranted`/`priorityLikesGranted`, default 0),
backend/models/User.js (new `boostCreditsRemaining`/`priorityLikesRemaining`,
default 1, min 0), backend/constants/subscriptionOptions.js (DEFAULT_PLANS gained
escalating credit grants per tier), backend/routes/auth.js (GET /me now exposes
both credit balances), backend/routes/discovery.js (POST /swipe gained `priority`
handling; GET /feed gained the boost/priority-like bulk lookups + ranking bonus
wiring), backend/routes/subscription.js (POST /subscribe now calls
grantPlanCredits(), response gained `creditsGranted`), backend/server.js (mounts
boostsRouter at /api/boosts), backend/utils/discoveryRankingUtils.js
(BOOST_RANK_BONUS=30/PRIORITY_LIKE_RANK_BONUS=25, added post-blend on top of the
existing four-signal weighted score), backend/utils/entitlementUtils.js (new
getActiveBoost()/getActiveBoostedUserIds()/tryActivateBoost()/
tryConsumePriorityLike()/grantPlanCredits()), frontend/src/api.js,
frontend/src/components/NotificationBell.jsx (distinguishing "Someone sent you a
Priority Like!" copy), frontend/src/context/AuthContext.jsx (exposes
refreshUser()), frontend/src/pages/Discovery.jsx (Boost activation UI, Priority
Like swipe action, credit balance display), docs/API_DOCUMENTATION.md (new §15),
docs/DATABASE_SCHEMA.md, docs/BUSINESS_PLAN.md, MOCK_FEATURES.md, this file,
IMPLEMENTATION_PROGRESS.md. `backend/__verify_task16.js` (scratch verification
script) was written and run during this task but deleted before commit per this
project's established convention — never appears in the committed diff.
Before this, Task #19 — weighted discovery ranking algorithm, prior pass:
backend/utils/discoveryRankingUtils.js (new — the scoring function, weights config,
signal normalizers), backend/routes/discovery.js (GET /feed rewritten to fetch a
bounded eligible-candidate pool, score+sort it, then paginate over the sorted pool;
response cards gained a `compatibility` field), backend/constants/discoveryOptions.js
(new `RANKING_POOL_SIZE`), backend/routes/admin.js (new
GET/PATCH /api/admin/discovery/ranking-weights, ADMIN+), frontend/src/pages/
Discovery.jsx (CompatibilityBadge + top-reason line on each card, reusing Task #15's
existing component), docs/API_DOCUMENTATION.md, docs/DATABASE_SCHEMA.md,
docs/BUSINESS_PLAN.md, docs/ROADMAP.md, MOCK_FEATURES.md, this file,
IMPLEMENTATION_PROGRESS.md. No schema/model changes — `users.lastLoginAt` (an
already-existing field) is reused as-is for the activity signal, no migration needed.
Last Modified Files (Task #14 — Location/age match preferences + advanced discovery
filters + Private browsing, prior pass): backend/models/Profile.js (new `preferences`
sub-document, `location`/`locationSource`, `privacySettings.incognito`),
backend/routes/discovery.js (bidirectional gender + age matching fix, query-param
overrides, incognito exclusion, distance filtering, `appliedPreferences`/`distanceKm`
in the response), backend/routes/profile.js (extended `PUT /api/profile/me` for all
new fields), backend/utils/matchPreferenceUtils.js (new),
backend/utils/geoUtils.js (new), backend/constants/cgLocationOptions.js (new),
backend/constants/discoveryOptions.js (new default/cap constants),
backend/utils/profileSerializers.js (updated for new fields),
frontend/src/App.jsx (new /discovery-preferences route),
frontend/src/api.js (preference/location API calls), frontend/src/pages/
DiscoveryPreferences.jsx (new), frontend/src/pages/ProfileBuilder.jsx ("Use my
current location" button), frontend/src/pages/Discovery.jsx ("Search wider" button +
distance display), frontend/src/pages/Settings.jsx (new link),
frontend/src/constants/discoveryOptions.js (new), MOCK_FEATURES.md, TODO.md,
docs/API_DOCUMENTATION.md, docs/DATABASE_SCHEMA.md, this file,
IMPLEMENTATION_PROGRESS.md.
Last Modified Files (Task #18 — Safe Date mode + Date Planner, prior pass):
backend/constants/safeDateOptions.js (new), backend/constants/dateIdeaOptions.js
(new), backend/models/SafeDate.js (new), backend/utils/safeDateUtils.js (new),
backend/utils/datePlanUtils.js (new), backend/routes/safeDates.js (new),
backend/routes/dateIdeas.js (new), backend/server.js (mounted both new routers,
additive alongside Task #17's already-present referralsRouter),
frontend/src/api.js (new createSafeDate/getSafeDates/getSafeDate/checkInSafeDate/
completeSafeDate/cancelSafeDate/getDateIdeas), frontend/src/constants/
dateIdeaOptions.js (new), frontend/src/pages/PlanSafeDate.jsx (new),
frontend/src/pages/SafeDates.jsx (new), frontend/src/pages/DateIdeas.jsx (new),
frontend/src/App.jsx (new /safe-dates, /safe-dates/new, /date-ideas routes),
frontend/src/pages/Settings.jsx (new "My Safe Dates"/"Date Ideas" links, additive
alongside Task #17's already-present "Invite & Earn" link), frontend/src/pages/
Chat.jsx (new "Safe Date" header link, additive alongside the existing Matches/
SafetyMenu links and Task #15's already-present CompatibilityBadge),
docs/DATABASE_SCHEMA.md, docs/API_DOCUMENTATION.md, docs/ROADMAP.md,
MOCK_FEATURES.md, TODO.md, this file, IMPLEMENTATION_PROGRESS.md.
Last Modified Files (Task #17 — Referral program, prior pass): backend/constants/
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
Database Status: **This pass (Task #16) added one new collection and extended
three existing ones.** New: `Boost` (`backend/models/Boost.js` — `user`,
`startedAt`, `expiresAt`, `source`, one document per activation). Extended:
`User` gained `boostCreditsRemaining`/`priorityLikesRemaining` (Number, default
`1` each, `min: 0`); `Like` gained `priority` (Boolean, default `false`); `Plan`
gained `boostCreditsGranted`/`priorityLikesGranted` (Number, default `0`,
`min: 0`). `rankScore`'s two new bonuses (`BOOST_RANK_BONUS`/
`PRIORITY_LIKE_RANK_BONUS`) are, like the rest of `rankScore`, computed live per
request, never persisted. Prior pass (Task #19): no schema/model changes — the
discovery ranking algorithm reuses `users.lastLoginAt` (already existed, stamped
on login since before that pass) as-is for its recent-activity signal, and
computes `rankScore` live per request over a bounded pool, never persisting it
(same "computed on read, never stored" pattern already established for Task
#15's `compatibility`). The admin-configurable ranking weights are an in-process
object, not a database document — see `docs/DATABASE_SCHEMA.md`'s
`discovery_ranking_config` divergence note. Before that (Task #14): `Profile` gained a `preferences` sub-document
(`maxDistanceKm`/`minAge`/`maxAge`/`datingIntentions`/`verifiedOnly`), a `location`
GeoJSON Point (2dsphere-indexed, reusing the index that already existed but was never
populated) + `locationSource` enum, and `privacySettings.incognito`. `SafeDate`
collection was added the pass before that (Task #18 —
`backend/models/SafeDate.js`: `user`, optional `match`, free-text `location`,
`plannedStartAt`/`plannedEndAt`, optional `trustedContactName`/`trustedContactPhone`,
`status`, `checkedInAt`/`completedAt`/`cancelledAt`, `reminderNotifiedAt`); `User`
gained `referralCode`/`referredBy` before that (Task #17); `Profile` also has
`instagramHandle` from before that. `date_plans` (the Date Planner's
originally-drafted collection) was **not** implemented — the Date Planner shipped as
a stateless suggestion endpoint instead, nothing persisted, see
`docs/DATABASE_SCHEMA.md`'s divergence note. MongoDB/Mongoose schemas implemented for
User, Profile, Like, Match, Message, Notification, Block, Report, Plan, Subscription,
AuditLog, and SafeDate; no live DB connection has ever been verified in any sandbox
session across this entire project — this remains the top technical-debt item (see
"Known Technical Debt" and TODO.md's "Before real production launch" section).
Backend Status: Express + Socket.IO server (same HTTP server) running with auth +
profile + discovery + matches + notifications + verification + reports + blocks +
subscription + referrals + safe-dates + date-ideas + admin + **boosts (new,
Task #16)** routes. This pass (Task #16) added `backend/routes/boosts.js`
(`GET /status`, `POST /activate`), extended `POST /api/discovery/swipe` with a
`priority: true` path and `GET /api/discovery/feed` with two bulk boost/
priority-like lookups feeding into `computeRankScore()`'s two new bonuses, and
extended `POST /api/subscription/subscribe` to grant plan credits on checkout —
no existing route was removed, and Task #14's eligibility-filter query itself
was again left completely untouched (see "Current Task" above for the explicit
verification that the new ranking bonuses never bypass it). Prior pass (Task
#19) rewrote `GET /api/discovery/feed`'s post-filter fetch/pagination logic in
place (bounded eligible-candidate pool -> score+sort -> paginate over the
sorted pool; `compatibility` field added to each response card) and added two
new admin routes (`GET`/`PATCH /api/admin/discovery/ranking-weights`,
`ADMIN`+). Boots cleanly; `GET /api/health` confirmed live.
Frontend Status: This pass (Task #16) added Boost activation UI + a Priority
Like swipe action + credit-balance display to `Discovery.jsx`, a distinguishing
notification copy to `NotificationBell.jsx`, and `refreshUser()` to
`AuthContext.jsx` — no new screen/route (Boost/Priority Like live inline on the
existing Discovery screen, not a separate page). Prior pass (Task #19) added a
`CompatibilityBadge` + top-reason line to each Discovery card (reusing Task
#15's existing component, driven by the feed response's `compatibility`
field). `npm run build`/`npm run lint` both clean (0 errors, same 2
pre-existing warnings carried forward).
Authentication Status: Implemented (signup/login/JWT/me endpoint), now with rate
limiting on both signup and login and the password hash never selected by default —
unchanged otherwise.
AI Status: Why-You-Match and Smart Icebreakers (Task #15) — deterministic,
server-side profile-comparison heuristics, exposed via `GET /api/matches`
(`compatibility` field) and `GET /api/matches/:matchId/compatibility`/
`.../icebreakers`, and now also on `GET /api/discovery/feed`'s cards (Task #19, this
pass — same computed value, reused, not re-derived). **Not a real Claude API
integration** — no `ANTHROPIC_API_KEY` is configured anywhere in this project (see
`backend/.env.example`). The Date Planner (Task #18, `GET /api/date-ideas`) is the
same story — a curated heuristic suggestion generator, not real AI. **Task #19's
discovery ranking algorithm (this pass) is the same "documented heuristic, not real
AI/ML" story too** — a weighted sum of normalized signals, not a trained/learned
model; see docs/ROADMAP.md's "ML-based recommendations" line for the still-not-started
V3 direction. AI Profile Coach and a real-AI version of "AI Date Ideas" remain not
started (see docs/ROADMAP.md Phase 11); see MOCK_FEATURES.md for the full explanation
and what a real upgrade would need.
Payment Status: Subscription scaffolding implemented — MOCK checkout, not real
Razorpay yet (still explicitly not production-ready as-is, see MOCK_FEATURES.md).
This pass (Task #16), `POST /api/subscription/subscribe` gained a side effect:
a successful (mock) checkout now also grants the plan's `boostCreditsGranted`/
`priorityLikesGranted` credits, one time, additively — see "Current Task" above
and MOCK_FEATURES.md's Task #16 entry for the "one-time, not recurring" caveat
this inherits from having no job scheduler. The Task #17 referral reward
(`paymentProvider: 'referral_reward'`, 7 days of `CG_PLUS`, granted for free on
a successful referred signup) remains the one non-payment way a `Subscription`
row can be created — unchanged this pass.
Admin Status: Implemented — role/accountStatus on User, role-gated /api/admin/* routes
(dashboard, reports queue, photo-verification queue, suspend/reinstate, SUPER_ADMIN-only
role change, and — Task #19, prior pass — `GET`/`PATCH .../discovery/ranking-weights`,
`ADMIN`+, in-process only/not yet persisted, see "Database Status" above), AuditLog on
every mutation, role-gated /admin frontend section. Unchanged this pass (Task #16) — no
new admin route or UI was needed for Boost/Priority Like, since both are entirely
self-serve, user-facing mechanics with no moderation surface.
Deployment Status: Not started (planned: Render/Railway + MongoDB Atlas +
Vercel/Netlify + Cloudinary — Phase 15, cross-cutting, not yet started).
Next Exact Task: **No further V2 items are currently queued by the user.** Task #16
(Profile Boost + Priority Like, this pass) was the last item in this user's
post-MVP V2 feature-request batch — per the task instructions this pass was run
under (this session, like every prior one, had no direct access to the
orchestrating session's TaskList tool to independently re-verify the task graph
itself, so this is stated on the strength of that instruction plus the corroborating
fact that `git log`/this file's own history show every other named V2 item —
Instagram linking, Why-You-Match/Icebreakers (#15), Referral program (#17), Safe
Date/Date Planner (#18), match preferences/advanced filters/private browsing (#14),
weighted ranking (#19), and now Boost/Priority Like (#16) — already shipped, with
nothing else named anywhere in this project's docs as "in progress" or "queued").
**Recommended next focus:** either (a) the "Before real production launch"
hardening list in TODO.md — live MongoDB Atlas connection + testing, real
Cloudinary/Firebase/Razorpay/SMS provider credentials, real `.env` production
secrets, a seeded real `SUPER_ADMIN` account, an automated test suite per
docs/TESTING_STRATEGY.md, a unique index on `User.phone`, HTTPS/hosting setup per
docs/ARCHITECTURE.md's Phase 15, and closing BUG-001 — this project remains
explicitly **not production-ready** as-is regardless of V2 feature completeness; or
(b) whatever the user requests next — ask them. Still not done if the user does
open a new V2 request: AI Profile Coach, a real-AI version of AI Date Ideas (both
would need a real Claude API integration — see MOCK_FEATURES.md), real Razorpay
integration, voice/video calling, real Instagram OAuth — see docs/ROADMAP.md's V2
section.
Next Recommended Action: Get a real MongoDB connection (Atlas free tier is enough)
verified in whatever environment picks this project up next — every DB-dependent
behavior in this entire codebase (10 feature tasks' worth of indexes, `select: false`
fields, unique constraints, aggregation queries) has only ever been verified via
code inspection, standalone fake-model scripts, and server-boot smoke tests across
every single task in this project's history, never against a real database. That one
missing piece of verification is the actual gate on calling this "tested", not any
remaining code work.
