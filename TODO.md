# TODO — CG-Dating-App

Flat prioritized task list, grouped by scope tier. **The MVP is complete** as of Task
#6 (final polish/security audit/docs, 2026-08-18) — see `PROJECT_STATE.md` and
`IMPLEMENTATION_PROGRESS.md`'s newest entry for the full build history. This file is
now organized as: MVP — Done (below, kept for reference/traceability), **Before real
production launch** (the concrete gaps standing between this MVP and a real deploy —
read this section first if you're picking the project up next), then V2, then V3.
Check items off as they land; keep this in sync with `PROJECT_STATE.md` and
`IMPLEMENTATION_PROGRESS.md`.

## Before real production launch

None of this is "V2 feature work" — it's what's still missing before this already-built
MVP could actually go live for real users. Per this project's own MVP-first sequencing
principle (`docs/ROADMAP.md`'s "Notes on sequencing"), V2 work should not start until
these are closed.

- [ ] **Live MongoDB Atlas connection, verified end-to-end.** No sandbox session across
      this entire project's history has ever had a reachable MongoDB (no local `mongod`,
      no Docker, `mongodb-memory-server`'s binary download blocked). Every single
      DB-dependent behavior in this codebase — every index, every `select: false` field,
      every unique constraint (User.email, Match's canonical-pair index, Block's
      compound index), every aggregation query — has only ever been verified via code
      inspection, standalone fake-model-over-real-HTTP scripts, and server-boot smoke
      tests. This is the single largest gap; everything else on this list is smaller.
- [ ] **Real provider credentials**, currently all MOCK/TEMPORARY (see
      `MOCK_FEATURES.md` for the full detail on each): Cloudinary (photo storage — MOCK
      base64/URL stored directly on Mongo documents), Firebase Cloud Messaging (push —
      not implemented at all, in-app notifications work, background push doesn't), a
      real SMS/OTP provider e.g. Twilio/MSG91 (OTP logic is real, delivery is a
      console-log + dev-only response field), Razorpay (checkout is a MOCK — any
      authenticated user currently gets any plan for free, see
      `MOCK_FEATURES.md`'s explicit warning).
- [ ] **Real `.env` production secrets** — a long random `JWT_SECRET`, the real
      `MONGODB_URI` (Atlas), and the credentials above, generated fresh for production
      and never reused from any dev/example value. Confirmed in this pass that no real
      secret has ever been committed (`git log --all --full-history -- backend/.env` /
      `frontend/.env` are both empty) — keep it that way.
- [ ] **Seed a real `SUPER_ADMIN` account** on the production database — see
      `SETUP.md`'s "Creating the first admin account" section for the one-time manual
      `mongosh` command (no self-serve flow exists, intentionally).
- [ ] **Automated test suite** per `docs/TESTING_STRATEGY.md` — `npm test` is not
      implemented in either `backend/` or `frontend/` yet. Every test performed across
      this project's entire history has been a manual/throwaway verification script,
      never committed and never re-runnable as regression coverage.
- [ ] **Unique index on `User.phone`** — currently just a plain trimmed string field, no
      uniqueness constraint, unlike `User.email`.
- [ ] **HTTPS / hosting setup** per `docs/ARCHITECTURE.md`'s Phase 15 (backend on
      Render/Railway, DB on MongoDB Atlas, frontend on Vercel/Netlify, Cloudinary for
      media) — nothing is deployed anywhere yet.
- [ ] **BUG-001** (P1, see `BUGS.md`/`docs/SECURITY_AUDIT.md`) — no rate limiting beyond
      `POST /api/auth/login`/`signup` (added in Task #6), no `helmet`/security-headers
      middleware anywhere. Real Phase 14 (Security Hardening) scope.
- [ ] Tighten CORS from the current wide-open `app.use(cors())` to an explicit origin
      allowlist once the real production frontend origin (from the hosting step above)
      is known — not urgent given bearer-token (not cookie) auth, but standard practice
      before a public launch. See `docs/SECURITY_AUDIT.md`'s "Not re-litigated" section.

## Post-MVP feature additions (shipped after the 12-task MVP plan)

Work here was requested by the user after the MVP (Task #6) had already shipped and
closed — it's genuinely new feature scope, not a gap in one of the original 12 tasks
tracked below.

- [x] **Instagram profile linking** (2026-08-18) — self-reported `instagramHandle` on
      `Profile` (`backend/models/Profile.js`), validated both client- and server-side
      against Instagram's real username format, editable via the existing
      `PUT /api/profile/me` (no new endpoint), returned by both the own- and
      public-profile serializers, and shown as a clickable badge (profile builder +
      Discovery card). **Not real Instagram OAuth** — no Meta Developer app is
      registered for this project, so there is no verification that a user actually
      owns the handle they typed in; see `MOCK_FEATURES.md`'s entry and this file's
      V2 section ("real Instagram OAuth / ownership verification").
- [x] **Why-You-Match + Smart Icebreakers (Task #15)** (2026-08-18) — deterministic,
      heuristic profile-comparison scoring/generation, **not real AI**:
      `backend/utils/compatibilityUtils.js` (`{ score, reasons }` from two `Profile`
      documents), `backend/utils/icebreakerUtils.js` (3-6 template-filled conversation
      starters), exposed via `GET /api/matches`'s new `compatibility` field plus the
      dedicated `GET /api/matches/:matchId/compatibility` and
      `GET /api/matches/:matchId/icebreakers`. Shown on the "It's a Match!" modal, the
      Matches list (a "N% Match" badge — new `CompatibilityBadge` component), and the
      Chat screen (badge in the header, a "Why you match" reasons strip, and an
      icebreaker suggestion with "Use"/"Generate another" that prefills — never
      auto-sends — the message box). **This project has no `ANTHROPIC_API_KEY`
      configured** (see `backend/.env.example`), so neither feature calls a real LLM —
      see `MOCK_FEATURES.md`'s entry (below in the V2 section) for the full explanation
      and what a real upgrade would need. AI Profile Coach and AI Date Ideas remain
      separate, not-yet-verified-by-this-entry V2 items (see the V2 list below and
      `PROJECT_STATE.md`/`git log` for their current status).
- [x] **Referral program / "Invite & Earn" (Task #17)** (2026-08-18) — every user gets
      a unique 7-char referral code (`backend/models/User.js`'s `referralCode`,
      generated at signup, `backend/routes/auth.js`); an optional `referralCode` in
      the signup body links the new account's `referredBy` (schema-`immutable`,
      settable once, ever) and grants **both** the referrer and referee 7 days of
      `CG_PLUS` via a new `Subscription` row (`paymentProvider: 'referral_reward'`) —
      reusing Task #12's Subscription/entitlement system rather than inventing a new
      currency (neither "boost credits" nor "priority likes" existed in the codebase
      at implementation time). An invalid/unknown code never blocks signup — it's
      silently dropped (logged as a warning), which is the deliberately-chosen
      more-user-friendly behavior, documented in `docs/DATABASE_SCHEMA.md`'s
      `referrals` section. New `GET /api/referrals/me` (own code + shareable text +
      referral count + recent rewards). Frontend: new
      `frontend/src/pages/Referrals.jsx` ("Invite & Earn", linked from Settings) with
      a copy-to-clipboard invite message, and an optional referral-code field on
      `frontend/src/pages/Signup.jsx` (prefillable via a `?ref=<CODE>` query param).
      **No real deep-link infrastructure** — the "shareable link" is just a copyable
      code + templated text, see `MOCK_FEATURES.md`'s entry.
- [x] **Location/age match preferences + bidirectional matching fix + Private/
      Incognito browsing (Task #14)** (2026-08-18, V2, user-requested — "location
      preference ... jaise other dating apps kaam karte hain") — persisted
      `profiles.preferences` (`maxDistanceKm`, `minAge`/`maxAge` with a hard `18`
      floor, `datingIntentions`, `verifiedOnly`) and `profiles.privacySettings.
      incognito`, both read/written via the existing `PUT /api/profile/me`
      partial-merge (no new endpoint). **CRITICAL audit finding, fixed by this
      task:** `GET /api/discovery/feed` previously applied **no gender filtering
      at all**, in either direction — now bidirectionally enforced (candidate
      must want the caller's gender AND vice versa), matching this task spec's
      "jaise other dating apps kaam karte hain" ask. Age-range matching is also
      bidirectional (candidate's age fits the caller's range AND the caller's age
      fits the candidate's stated range). Real distance filtering uses
      `profiles.location`, populated either from real device coordinates
      (explicit-consent browser geolocation) or a static Chhattisgarh
      city/district → approximate-coordinate lookup table (no geocoding API key
      configured — see `MOCK_FEATURES.md`); missing coordinates on either side
      gracefully skip distance filtering rather than excluding/crashing. One-off,
      non-persisted query-param overrides
      (`?maxDistanceKm=`/`?minAge=`/`?maxAge=`/`?verifiedOnly=`) support a "search
      wider" UX. Frontend: `frontend/src/pages/DiscoveryPreferences.jsx` (new,
      linked from Settings), `frontend/src/pages/ProfileBuilder.jsx` (new "Use my
      current location" button), `frontend/src/pages/Discovery.jsx` (a "Search
      wider" button + per-card distance display). See
      `docs/DATABASE_SCHEMA.md`'s `profiles.preferences` section and
      `docs/API_DOCUMENTATION.md`'s Discovery section for the full contract —
      this is foundational for the next task, Task #19's ranking algorithm.
- [x] **Safe Date mode + Date Planner (Task #18)** (2026-08-18) — `SafeDate` model
      (`backend/models/SafeDate.js`) + owner-only CRUD (`POST /api/safe-dates`,
      `GET /api/safe-dates`(`/:id`), `PATCH .../check-in`|`/complete`|`/cancel`) with a
      free-text "approximate public location" field (never GPS/exact address, per the
      product spec's explicit privacy rule). "Missed check-in"/the pre-date reminder
      are both **read-time computations**, not a real background scheduler or SMS/push
      alert (no job queue or SMS provider exists in this project) —
      `backend/utils/safeDateUtils.js`, see `MOCK_FEATURES.md`'s entry for the full
      explanation. Date Planner: `GET /api/date-ideas` — a stateless, curated,
      **not-real-AI** suggestion generator (`backend/utils/datePlanUtils.js`, same
      no-`ANTHROPIC_API_KEY` constraint as Task #15), every suggestion a public
      place/activity per the "never encourage isolated/private meeting locations"
      safety rule. Frontend: `frontend/src/pages/PlanSafeDate.jsx` (the planning form,
      reachable from Chat's new "Safe Date" header link), `frontend/src/pages/
      SafeDates.jsx` ("My Safe Dates", reachable from Settings, overdue/reminder
      banners + Check-In/Complete/Cancel actions), `frontend/src/pages/DateIdeas.jsx`
      (standalone from Settings, and linked from the planning form).

## MVP — Done

All of Phases 0-10 (`docs/ROADMAP.md`) shipped. Items below are kept exactly as
originally tracked, including their documented divergences/scope-gaps (a `[ ]` here
means a specific sub-item was intentionally deferred within an otherwise-shipped
feature, e.g. "who liked you" within the shipped Matching feature — check
`PROJECT_STATE.md`'s "Remaining Features" line or `MOCK_FEATURES.md` before assuming an
unchecked line means the whole feature is unbuilt).

### Authentication
- [x] Project scaffold (backend + frontend)
- [x] Signup / login / JWT issuance
- [x] Protected `GET /api/auth/me` route
- [x] Mobile OTP verification flow — **not** a signup step; implemented as a
      separate post-signup Verification flow instead (Task #9, see the
      Verification section below) since signup itself is email/password only
- [ ] Password reset / forgot password — not built; deferred, no route exists
- [x] Rate limiting on auth endpoints — added in Task #6 (final polish/security
      audit pass): `POST /api/auth/login` (20/15min/IP) and `POST /api/auth/signup`
      (10/hour/IP) via `backend/middleware/rateLimiters.js`, previously had none —
      see `docs/SECURITY_AUDIT.md`. **Divergence:** only these two endpoints; broader
      rate limiting (messaging, etc.) is still open, see BUG-001 above.

### Profile
- [x] Profile Mongoose schema (full fields, see docs/DATABASE_SCHEMA.md)
- [x] Multi-step profile builder UI (basic info, DOB, gender, dating preference,
      dating intention, location, profession, education, interests, prompts)
- [x] Photo upload — MOCK/TEMPORARY (URL or base64 stored directly on the profile
      doc; real Cloudinary integration still not wired up, see MOCK_FEATURES.md)
- [x] Bio + interests + prompts editing
- [x] Preferences (age range, distance, gender preference, dating intention filter) —
      **implemented 2026-08-18 (Task #14, V2, user-requested)** as `profiles.preferences`
      (a sub-document, not a separate collection — see docs/DATABASE_SCHEMA.md's
      `preferences` section), read/written via the existing `PUT /api/profile/me`;
      gender preference is still `profiles.interestedIn` itself, now actually
      enforced bidirectionally by Discovery (see below)
- [x] Profile strength / completeness score (`profileCompletionPercentage` +
      `completionHints`, computed server-side)
- [x] Profile view (own via `GET /api/profile/me`, others' public view via
      `GET /api/profile/:userId`)

### Location
- [x] City/district capture (not exact address) — district is free text, supports
      any CG district/town, not just major cities
- [x] Location-based query support (2dsphere index) — **implemented 2026-08-18
      (Task #14, V2, user-requested)**: real device-coordinate capture (frontend's
      "Use my current location" button) plus a city/district → approximate-coordinate
      fallback (`backend/constants/cgLocationOptions.js` — no geocoding API key
      configured, see `MOCK_FEATURES.md`) now populate `profiles.location`, and
      `GET /api/discovery/feed` applies real distance filtering against it
      (application-layer haversine, not a native Mongo geo query — see
      `docs/API_DOCUMENTATION.md`'s Discovery section for why)

### Discovery
- [x] Discovery feed API with pagination (`GET /api/discovery/feed`, page-based)
- [x] Discovery feed UI (`frontend/src/pages/Discovery.jsx` — card + Like/Pass
      buttons, loads more as the queue runs low)
- [x] Basic filters (`datingIntention`, `city`) — **age range / distance filters
      implemented 2026-08-18 (Task #14, V2, user-requested)**, see the `preferences`
      item above and `docs/API_DOCUMENTATION.md`. **CRITICAL fix included in the
      same task:** the feed previously applied NO gender filtering at all in either
      direction — now bidirectionally enforced (candidate wants my gender AND I want
      theirs), see PROJECT_STATE.md's Task #14 audit finding.

### Like / Pass / Match
- [x] Like/Pass API (`POST /api/discovery/swipe`)
- [x] Mutual-like match detection (canonical-pair unique index, race-safe —
      see `backend/utils/matchUtils.js` and `backend/models/Match.js`)
- [x] Match creation + match screen (`frontend/src/components/MatchModal.jsx`
      "It's a Match!" modal); `GET /api/matches` list + `frontend/src/pages/
      Matches.jsx`; unmatch (`DELETE /api/matches/:matchId`) and "who liked you"
      not yet implemented

### Chat
- [x] Socket.IO server setup (JWT-authed handshake sharing `middleware/auth.js`'s
      `verifyToken()`, mounted on the same HTTP server as Express — see `backend/socket.js`)
- [x] Message schema (`backend/models/Message.js`) — no separate `Conversation`
      schema; `Match` doubles as the conversation, see the divergence note in
      `docs/DATABASE_SCHEMA.md`
- [x] Real-time text chat UI (`frontend/src/pages/Chat.jsx`, `frontend/src/
      components/ChatBubble.jsx` — bubbles, auto-scroll, typing indicator, "load
      older messages", replaces the old `ChatComingSoon.jsx` placeholder)
- [x] Message read receipts (basic) — `PATCH /api/matches/:matchId/messages/read` +
      `message:read` socket broadcast + a simple single/double-checkmark indicator;
      no separate "delivered" status tracked (see `docs/DATABASE_SCHEMA.md`'s
      `messages` divergence note)

### Notifications
- [x] Notification schema + API (`backend/models/Notification.js`,
      `backend/routes/notifications.js` — `GET /api/notifications`,
      `GET .../unread-count`, `PATCH .../:id/read`, `PATCH .../read-all`,
      `GET`/`PUT .../preferences`)
- [x] Match / like / message notification events (created from
      `backend/routes/discovery.js` and `backend/routes/matches.js` via
      `backend/utils/notificationUtils.js`, preference-gated per user; "who
      liked you" identity deliberately withheld from `like` notifications —
      premium-gated reveal, see `docs/BUSINESS_PLAN.md`) + live
      `notification:new` Socket.IO event
- [x] Basic in-app notification center (`frontend/src/components/
      NotificationBell.jsx` bell/badge + dropdown, `frontend/src/context/
      NotificationContext.jsx`) and a minimal Settings page
      (`frontend/src/pages/Settings.jsx`) for per-type toggles
- [ ] Real push notifications (Firebase Cloud Messaging) — MOCK/TEMPORARY/
      deferred, no credentials configured yet, see `MOCK_FEATURES.md`

### Verification
- [x] Mobile OTP verification (`backend/routes/verification.js` —
      `POST .../mobile/request-otp` + `.../verify-otp`, hashed OTP + 10-min
      expiry + max-3-per-10-min rate limiting) — **not** shared with signup
      (signup is email/password only, no phone captured there); MOCK SMS
      delivery (console log + dev-only response field), see `MOCK_FEATURES.md`
- [x] Photo/selfie verification flow (`POST /api/verification/photo/submit` ->
      `PENDING`) — manual-review queue item for the future Admin panel, no
      automated face-match in this MVP pass
- [x] Verification badge on profile (`mobileVerified`/`photoVerified`
      booleans on `GET /api/profile/:userId`, discovery feed cards, and match
      list cards; `frontend/src/components/VerificationBadge.jsx`,
      `frontend/src/pages/Verification.jsx`)

### Safety
- [x] Report user flow (`POST /api/reports`; `frontend/src/components/
      ReportModal.jsx` reached via `SafetyMenu.jsx` from Discovery cards +
      Chat)
- [x] Block user flow (`POST`/`DELETE`/`GET /api/blocks`; bidirectional
      exclusion in discovery/matches/messaging/Socket.IO via
      `backend/utils/blockUtils.js`; `SafetyMenu.jsx` from Discovery cards +
      Chat, `frontend/src/pages/BlockedUsers.jsx` for management)
- [x] Safety Center screen (`frontend/src/pages/SafetyCenter.jsx` — static
      safety tips/scam-awareness content, reachable from Settings)

### Admin
- [x] Role field on User model — `backend/models/User.js`'s `role` (enum
      `USER`/`SUPER_ADMIN`/`ADMIN`/`MODERATOR` — **divergence:** no
      `SUPPORT`/`ANALYST` in this basic pass, see `docs/DATABASE_SCHEMA.md`'s
      divergence note) + `accountStatus` (`ACTIVE`/`SUSPENDED`)
- [x] Role-gated `/admin` routes in the React app — `frontend/src/
      components/AdminRoute.jsx` (extends the `ProtectedRoute.jsx` pattern
      with a `user.role` check), `/admin`, `/admin/reports`,
      `/admin/verifications`, `/admin/users` in `frontend/src/App.jsx`; no
      link to the section appears anywhere in the UI for a non-admin user
      (`frontend/src/pages/Settings.jsx`)
- [x] Reports queue (moderation) — `GET/PATCH /api/admin/reports*`
      (`backend/routes/admin.js`), `frontend/src/pages/AdminReports.jsx`
- [x] Verification review queue — `GET/PATCH /api/admin/verifications/photo*`
      (`backend/routes/admin.js`), `frontend/src/pages/
      AdminVerifications.jsx`
- [x] Suspend / reinstate user actions — `PATCH /api/admin/users/:userId/
      suspend` / `.../reinstate` (blocks login, hides from discovery),
      `frontend/src/pages/AdminUsers.jsx`. **Divergence:** no permanent
      ban/delete flow in this basic pass (reversible suspend only), see
      `docs/DATABASE_SCHEMA.md`'s `accountStatus` divergence note
- [x] Audit log for admin actions — `backend/models/AuditLog.js`,
      `backend/utils/auditUtils.js#writeAuditLog()`, written from every
      state-changing route above (report review, verification approve/
      reject, suspend, reinstate, role change)

### Subscription (basic)
- [x] Subscription plan model (CG_PLUS, CG_PRO, CG_ELITE), admin-editable pricing —
      `backend/models/Plan.js` (DB-backed, idempotently seeded at startup — see
      `docs/DATABASE_SCHEMA.md`'s `plans` section), `backend/models/Subscription.js`,
      `GET /api/plans`, `GET/POST /api/subscription/*`
      (`backend/routes/subscription.js`)
- [x] Paywall UI for premium features — `frontend/src/pages/Subscription.jsx` (plan
      cards + mock-checkout Subscribe button), current-plan status + Cancel button on
      `frontend/src/pages/Settings.jsx`
- [x] Server-side entitlement checks — `backend/utils/entitlementUtils.js#hasFeature()`,
      always DB-backed, never a client claim; demonstrated on the discovery feed's
      free-tier daily like limit (20/day, see `docs/BUSINESS_PLAN.md`) in
      `POST /api/discovery/swipe`
- [x] Razorpay integration — MOCK/TEMPORARY acceptable until wired for real (mark clearly
      in MOCK_FEATURES.md) — `POST /api/subscription/subscribe` is an explicit MOCK
      checkout (immediate activation, no real payment/webhook) — see
      `MOCK_FEATURES.md`'s Razorpay entry and `docs/API_DOCUMENTATION.md`'s §9 for the
      full gap writeup; **not production-ready as-is**

### Cross-cutting MVP work
- [x] Security audit pass (Task #6) — full audit against docs/ARCHITECTURE.md's
      security requirements performed, two real gaps fixed (auth rate limiting,
      `User.password` defense-in-depth), one larger gap formally tracked (BUG-001) —
      see `docs/SECURITY_AUDIT.md`. **Divergence:** this was an *audit* pass, not the
      full Phase 14 "Security Hardening" build-out (helmet, broader rate limiting,
      systematic input-validation layer) — see "Before real production launch" above.
- [x] Input validation on all endpoints — **already present** per-route (inline field
      checks in every handler — email format, password length, enum membership,
      ObjectId validation on path params, string-length caps, etc.); confirmed via
      spot-check in Task #6's audit, not a systematic shared validation
      library/middleware. Good enough for MVP; a shared schema-validation layer
      (e.g. zod/joi) would be a reasonable Phase 14 improvement, not required.
- [x] Error handling / consistent error response format — **already present**: every
      route returns `{ message: string, ...}` on error with an appropriate status
      code, and the frontend's single `frontend/src/api.js#request()` helper
      consistently surfaces `err.message`/`err.status`/`err.data` to every screen —
      confirmed via spot-check in Task #6's consistency pass.
- [ ] Basic automated test suite (see docs/TESTING_STRATEGY.md) — not built; see
      "Before real production launch" above.
- [ ] Deployment setup (Render/Railway + MongoDB Atlas + Vercel/Netlify + Cloudinary) —
      not built; see "Before real production launch" above.

## V2 (after MVP ships end-to-end)

- [x] AI compatibility explanations ("Why You Match") — **implemented 2026-08-18 (Task
      #15) as a deterministic profile-comparison heuristic, NOT via the real Claude
      API** (no `ANTHROPIC_API_KEY` configured in this project) — see the "Post-MVP
      feature additions" entry above and `MOCK_FEATURES.md` for the full explanation.
- [x] AI Smart Icebreakers — same divergence as above: **implemented 2026-08-18 (Task
      #15) as deterministic, template-based generation, NOT via the real Claude API.**
- [ ] AI Profile Coach suggestions
- [ ] AI Date Ideas — a real Claude-API-generated version; **not the same as the
      Date Planner item below**, which shipped as a curated heuristic instead (no
      `ANTHROPIC_API_KEY` configured, same constraint already true of Profile
      Coach here).
- [x] Safe Date mode (safety timer, check-in, trusted contact) — **implemented
      2026-08-18 (Task #18)** — see the "Post-MVP feature additions" entry above.
      "Missed check-in"/the pre-date reminder are both read-time computations, not
      a real background scheduler or SMS/push alert — see `MOCK_FEATURES.md`.
- [x] Date Planner — **implemented 2026-08-18 (Task #18) as a curated heuristic
      suggestion generator, NOT via the real Claude API** (see the "AI Date Ideas"
      note above and the "Post-MVP feature additions" entry above).
- [x] Private / Invisible browsing — **implemented 2026-08-18 (Task #14)** as
      `profiles.privacySettings.incognito` — see the "Post-MVP feature additions"
      entry above.
- [x] Advanced filters — **implemented 2026-08-18 (Task #14)**: distance,
      age range, dating-intention list, and verified-only, all persisted and
      bidirectionally enforced where applicable (gender/age) — see the
      "Post-MVP feature additions" entry above. Boost/Priority-Like-style
      "advanced" ranking (not just filtering) remains Task #19 scope.
- [ ] Profile Boost
- [ ] Priority Like
- [x] Referral program (Invite & Earn) — **implemented 2026-08-18 (Task #17)** — see
      the "Post-MVP feature additions" entry above. Reward is 7 days of `CG_PLUS` via
      the existing Subscription/entitlement system, not a new currency — no boost
      credits or priority-like currency existed in the codebase yet at
      implementation time.
- [ ] Real Razorpay payment integration (replace MOCK)
- [ ] Voice call / video call in chat
- [ ] Real Instagram OAuth / "Login with Instagram" verification — replaces the
      self-reported `instagramHandle` field added post-MVP (see below and
      `MOCK_FEATURES.md`). Requires registering a Meta Developer app for this
      project (client ID/secret, redirect URI) and, beyond a handful of test
      users, Meta's app review process — none of which exists yet.

## V3 (longer-term)

- [ ] CG Connect (local events + social discovery)
- [ ] Events schema + API + UI
- [ ] Advanced Trust Engine (bot/spam/duplicate detection, trust score)
- [ ] ML-based recommendations
- [ ] Advanced analytics dashboard (admin)
- [ ] Statewide then national expansion
- [ ] City-specific SEO landing pages at scale (possible migration to Next.js)
- [ ] Capacitor native Android/iOS wrapper (push, camera, deep native features)
