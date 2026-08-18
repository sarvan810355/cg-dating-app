# Mock / Temporary Features

This file tracks anything in the codebase that is mocked, stubbed, disabled, or
otherwise not a real production implementation yet, so nobody mistakes a placeholder
for a finished feature. Update this checklist as real implementations replace mocks —
move items to "Resolved" rather than deleting them, so there's a record of what changed.

**Reviewed 2026-08-18 (Task #6 — final polish/documentation wrap-up):** this list was
checked against the actual codebase at the end of the MVP build and confirmed complete
and accurate — every mock introduced across all 10 feature tasks (photo storage,
SMS/OTP delivery, FCM push, Razorpay checkout, plus the smaller scope-gap items below)
is already listed here, in one place, and none of the "Currently Mocked" items were
resolved by this pass (this pass was audit/polish/docs, not new feature work — see
`PROJECT_STATE.md`). No changes made to this file's content below beyond this note.

## Currently Mocked / Not Yet Configured

- [ ] **MongoDB connection is optional/non-fatal in dev.** The backend does not yet hard-fail
      startup if `MONGODB_URI` is missing or unreachable in this sandbox; no real database
      (local or Atlas) has been provisioned/verified yet. Any route that touches the DB will
      not work correctly until a real connection is configured and verified.
- [ ] **Cloudinary (media storage) — no credentials configured.** `POST
      /api/profile/me/photos` (`backend/routes/profile.js`) is implemented as a
      MOCK/TEMPORARY stand-in: it accepts either a real external `url` string, or
      `imageBase64` (+ `mimeType`) which the server wraps into a `data:image/...;base64,...`
      URI and stores **directly on the `profiles.photos` array in MongoDB** — no file
      ever goes to disk or any object store, and no moderation/resizing/thumbnailing
      happens. This means large photo libraries will bloat the `profiles` collection
      and there is no CDN delivery. Replace with real Cloudinary upload (multipart ->
      Cloudinary -> store the returned secure URL only) before this ships to real
      users; when that happens, also revisit `backend/server.js`'s bumped 10mb JSON
      body limit (added only to allow base64 payloads through this mock path).
- [ ] **Discovery has no geo/distance filtering yet — not a mock, a scope gap.**
      `GET /api/discovery/feed` (`backend/routes/discovery.js`, Task #4) only filters
      by `datingIntention` and an exact-ish `city` match; `profiles.location` still
      isn't populated by any UI (unchanged from the Task #3 note), so there's no
      `maxDistanceKm`/"near me" filtering yet — see the divergence note in
      `docs/API_DOCUMENTATION.md`'s Discovery section. The actual swipe/match logic
      itself (Like/Match models, mutual-match detection, canonical-pair uniqueness)
      is real, not mocked.
- [ ] **Firebase Cloud Messaging (push notifications) — no credentials configured,
      MOCK/TEMPORARY-deferred.** Task #6 (Notifications, see `docs/ROADMAP.md`
      Phase 6) implemented real, non-mocked **in-app** notifications end-to-end:
      `backend/models/Notification.js`, `GET/PATCH/PUT /api/notifications*`
      (`backend/routes/notifications.js`), preference-gated creation at the
      match/like/message trigger points (`backend/routes/discovery.js`,
      `backend/routes/matches.js`, via `backend/utils/notificationUtils.js`),
      a live `notification:new` Socket.IO event to the recipient's personal
      `user:<id>` room (`backend/socket.js`), and a bell/badge + dropdown +
      Settings toggles on the frontend (`frontend/src/components/
      NotificationBell.jsx`, `frontend/src/context/NotificationContext.jsx`,
      `frontend/src/pages/Settings.jsx`). What's still MOCK/TEMPORARY/deferred
      is real **push** delivery via Firebase Cloud Messaging — i.e. a device
      getting notified while the app/tab isn't open at all. No FCM
      credentials exist yet, no device-token registration exists, and no
      `POST` to FCM's API happens anywhere in this codebase. The
      `notification:new` Socket.IO event only reaches a client that already
      has an active, authenticated Socket.IO connection open — nothing here
      simulates or fakes FCM delivery in the meantime (unlike, say, the
      photo-upload mock below, there's no stand-in code path pretending to be
      FCM); it's simply not built yet. Wiring real FCM would mean: adding a
      device-token field to `users` (or a small `device_tokens` collection),
      a registration endpoint, and calling the FCM Admin SDK from inside
      `createNotification()` (`backend/utils/notificationUtils.js`) alongside
      the existing Socket.IO emit.
- [ ] **SMS/OTP provider (mobile verification) — no credentials configured,
      MOCK/DEV-ONLY delivery.** Task #9 (Verification, see `docs/ROADMAP.md`
      Phase 7) implemented real, non-mocked OTP generation/hashing/expiry/
      rate-limiting logic (`backend/routes/verification.js`,
      `backend/utils/verificationUtils.js`) — a real 6-digit OTP is
      generated via `crypto.randomInt`, hashed with bcrypt before storage,
      given a genuine 10-minute expiry, and rate-limited (max 3 requests per
      rolling 10-minute window). What's mocked is purely the **delivery**
      mechanism: there's no Twilio/MSG91/etc account, so
      `POST /api/verification/mobile/request-otp` logs the OTP to the server
      console (`[MOCK SMS] OTP for user <id> (<masked phone>): <otp>`)
      instead of sending a real SMS, and — **only when
      `NODE_ENV !== 'production'`** — also returns it in the response body
      as a `devOtp` field so this can be tested/demoed without a real phone.
      This dev-only field is verified (via a standalone test harness, see
      IMPLEMENTATION_PROGRESS.md) to never appear when
      `NODE_ENV === 'production'`. Wiring a real provider would mean adding
      Twilio/MSG91 credentials and replacing the `console.log` call with an
      actual API call — the rest of the flow (hashing, expiry, rate
      limiting, the `mobileVerification` state machine) would not need to
      change.
- [ ] **Photo/selfie verification — no automated face-match, and photo
      storage itself is still MOCK/TEMPORARY.** `POST
      /api/verification/photo/submit` (`backend/routes/verification.js`)
      reuses the exact same MOCK/TEMPORARY photo-storage pattern already
      used for profile photos (`backend/utils/mockImageUpload.js`, no
      Cloudinary — see the profile-photo entry above). **The manual-review
      queue itself is now real** — see this file's Resolved section below —
      but there is, and was never intended to be in this MVP pass, any
      automated face-match against the user's profile photos; a human
      moderator must always approve/reject via
      `PATCH /api/admin/verifications/photo/:userId`. This remaining piece
      (no auto-approve) is a genuine, permanent scope boundary, not a
      stand-in for something planned to be automated later.
- [ ] **Razorpay (payments/subscriptions) — no credentials configured, MOCK/TEMPORARY
      checkout implemented instead.** Task #12 (Subscription scaffolding, see
      `docs/ROADMAP.md`) implemented real, non-mocked plan management and entitlement
      logic: `backend/models/Plan.js`/`Subscription.js` (DB-backed, admin-editable
      plans per `docs/BUSINESS_PLAN.md` — never hardcoded), `GET /api/plans`,
      `GET/POST /api/subscription/*` (`backend/routes/subscription.js`), and — most
      importantly — `backend/utils/entitlementUtils.js#hasFeature()`, a real
      server-side entitlement check that always re-queries the database and is never
      fooled by a client-submitted "isPremium" claim. What's mocked is purely the
      **payment collection** step: there is no Razorpay account/credentials, so
      `POST /api/subscription/subscribe` skips straight from "authenticated request"
      to "ACTIVE subscription, no money changed hands" — no Razorpay order is ever
      created, no checkout redirect happens, and there is no
      `POST /api/payments/webhook` receiver anywhere in this codebase.
      `paymentProvider: 'mock_razorpay'` and a fake generated `paymentReference` are
      recorded on the Subscription document precisely so these mock-path rows stay
      traceable and are never mistaken for a real transaction. **Wiring a real
      integration would mean:** creating a Razorpay order in `POST /subscribe`
      instead of immediately activating, returning that order to the client to open
      Razorpay Checkout, and adding a signature-verified `POST /api/payments/webhook`
      that is the *only* path allowed to flip a subscription to `ACTIVE` (replacing
      today's "activate on request" behavior entirely) — see
      `docs/DATABASE_SCHEMA.md`'s `payments` section and
      `docs/API_DOCUMENTATION.md`'s Subscription section (§9) for the full gap
      writeup. **This must not ship to production as-is** — anyone who can call
      `POST /api/subscription/subscribe` while authenticated currently gets any plan
      for free.
- [ ] **Instagram linking is self-reported only — no OAuth verification that the
      user owns the handle.** `[NEW, post-MVP, user-requested — added after the
      MVP shipped, see PROJECT_STATE.md/IMPLEMENTATION_PROGRESS.md's newest
      entry]`. `PUT /api/profile/me`'s `instagramHandle` field
      (`backend/models/Profile.js`, `backend/routes/profile.js`) accepts a
      self-typed Instagram username, validates it against Instagram's real
      username format (1-30 chars, letters/numbers/periods/underscores,
      `backend/constants/profileOptions.js#INSTAGRAM_HANDLE_REGEX`), strips a
      leading `@`, and stores it as-entered otherwise. It is then shown as a
      clickable badge linking to `https://www.instagram.com/<handle>/`. What's
      mocked/not built: there is **no verification whatsoever that the caller
      actually owns the Instagram account they typed in** — this is the exact
      same trust level as the `bio`/`interests` fields, not an authenticated
      claim. Real "Login with Instagram" (Instagram Basic Display /
      Instagram Graph API OAuth) would require registering a Meta Developer
      app for this project (client ID/secret, a redirect URI, and — for
      anything beyond a handful of test users — Meta's app review process),
      none of which exists yet, same gap already true of every other external
      integration in this codebase (SMS/OTP provider, Cloudinary, Razorpay,
      FCM — see the entries below). **V2 gap: real "Login with Instagram" /
      ownership verification** — see `TODO.md`'s V2 section.
- [ ] **Anthropic Claude API — no credentials configured; the AI features implemented so
      far are deterministic heuristics, not real AI.** `[UPDATED — Task #15, V2,
      user-requested, added 2026-08-18]`. This project has no `ANTHROPIC_API_KEY`
      configured anywhere (see `backend/.env.example` — only `PORT`/`MONGODB_URI`/
      `JWT_SECRET` exist), so no backend code path in this codebase has ever called the
      real Claude API. **Why-You-Match** (`backend/utils/compatibilityUtils.js`,
      `GET /api/matches` — each match's `compatibility` field — and the dedicated
      `GET /api/matches/:matchId/compatibility`) and **Smart Icebreakers**
      (`backend/utils/icebreakerUtils.js`, `GET /api/matches/:matchId/icebreakers`) are
      both now implemented — but as **deterministic, server-side profile-comparison
      heuristics**, not a real LLM: they compare the two participants' actual `Profile`
      documents (shared `datingIntention`, `interests`, `city`, `languages`, matching
      `lifestyle` fields, shared `personalityPrompts` themes) with a fixed, documented
      weighting (see `compatibilityUtils.js`'s top comment for the exact weights and the
      reasoning behind them) and fill a small set of fixed string templates — nothing is
      ever generated by a model, and nothing is ever fabricated: a pair of totally
      disjoint profiles gets a `0` score, an empty `reasons` list, and only the
      generic-but-decent icebreaker fallback pool (never "Hi"/"Hello"). **Upgrading
      either feature to real AI-generated output would need an `ANTHROPIC_API_KEY`
      configured and a backend-only call to the Claude API (never from the frontend,
      same reasoning as every other secret-bearing integration in this codebase)** — see
      `docs/ARCHITECTURE.md`'s AI layer section for the intended design. **AI Profile
      Coach and AI Date Ideas remain not started** (Date Ideas has separate,
      not-yet-reviewed-by-this-pass work in progress elsewhere in this repo as of this
      writing — check `git log`/`PROJECT_STATE.md` for its current status rather than
      assuming this note is stale).
- [ ] **Chat is text-only for this pass — not a mock, a documented scope reduction.**
      Task #5's real-time messaging (`backend/routes/matches.js`'s message routes,
      `backend/socket.js`, `frontend/src/pages/Chat.jsx`) is a real, non-mocked
      implementation end-to-end (REST persistence + Socket.IO live delivery, JWT-authed
      socket handshake, room-scoped typing indicators and read receipts). Image/voice
      messages (`messages.attachmentUrl` in the original draft schema) were never in
      scope for this task and are deferred to V2 alongside voice/video calling (see
      `TODO.md`'s V2 section) — no attachment field exists on the `Message` model at
      all yet, so there's nothing mocked here to later replace, just a feature not yet
      built.
- [ ] **Matches list has no last-message preview / unread badge yet — not a mock, a
      scope gap.** `GET /api/matches` (`backend/routes/matches.js`) doesn't return
      per-match last-message text or an unread count, so `frontend/src/pages/
      Matches.jsx` can't show either yet — see the divergence note in
      `docs/DATABASE_SCHEMA.md`'s `conversations` section for how this could be added
      (a per-match latest-message lookup or a denormalized field maintained on `Match`
      when a message is sent). Chat itself is fully functional without this; deferred
      here to keep this task focused on messaging working end-to-end.
- [ ] **Report evidence is plain strings, no file upload — not a mock, a
      documented scope reduction.** Task #10's `POST /api/reports`
      (`backend/routes/reports.js`, `backend/models/Report.js`) accepts an
      optional `evidence` array, but each entry is just a string (a URL, or a
      short free-text reference) — there is no image/screenshot upload path
      for report evidence, unlike `profiles.photos`/`photoVerification`'s
      (mocked) base64-or-URL path. Nothing here needs replacing later so much
      as extending, if/when evidence upload is prioritized.
- [ ] **No automated spam/scam/abuse detection — out of scope for this task,
      planned as the future "Trust Engine" (V3).** Report/Block filing
      (Task #10, see `docs/ROADMAP.md`'s Phase 8) and report *review*
      (Task #11's moderation queue — now real, see this file's Resolved
      section) are both entirely manual: a user reports another user, a
      human admin/moderator reviews and resolves it via
      `PATCH /api/admin/reports/:id`. There is no automated signal
      (message-content scanning, image/face-match verification-fraud
      detection, behavioral pattern flags, repeat-report auto-suspension,
      etc.) anywhere in this pass — that's the explicitly later-phase "Trust
      Engine" / AI-assisted moderation concept (V3 scope, see
      `docs/BUSINESS_PLAN.md`/`docs/ROADMAP.md`), not something this task
      attempted or partially mocked.
- [ ] **Referral program ("Invite & Earn") has no real deep-link infrastructure —
      not a mock, a documented scope reduction.** `[NEW, Task #17, V2 scope, see
      docs/BUSINESS_PLAN.md's Growth Strategy]`. `GET /api/referrals/me`
      (`backend/routes/referrals.js`) returns a "shareable link/text" that is
      genuinely just a plain copyable string (`"Join CG Dating with my code:
      <CODE>"`) plus the raw code itself — there is no real dynamic-link/deferred
      deep-link service (e.g. Firebase Dynamic Links, Branch.io) generating a
      trackable per-referrer URL, no click-through analytics on the invite, and no
      SMS/WhatsApp share-sheet integration beyond the browser's native
      `navigator.clipboard`/share APIs the frontend already has available. The
      frontend (`frontend/src/pages/Referrals.jsx`) does prefill a referral code
      from a `?ref=<CODE>` query param on `/signup` if a caller lands there via one
      (`frontend/src/pages/Signup.jsx`), which is the full extent of "link"
      behavior implemented. Wiring a real dynamic-link service would mean:
      registering with a provider, generating a real short link per referral code
      that survives an app-store install redirect (relevant once a native wrapper
      exists — V3 scope, see `TODO.md`), and adding click/conversion analytics —
      none of which exists yet. **What IS real and non-mocked:** referral code
      generation/uniqueness, the one-time `referredBy` link (schema-enforced), and
      the reward grant itself (a genuine `Subscription` document, gated by the
      same real `hasFeature()` entitlement check as a paid plan) — see
      `docs/DATABASE_SCHEMA.md`'s `referrals` section and
      `docs/API_DOCUMENTATION.md`'s Section 13 for the full writeup.
- [ ] **Safe Date's "missed check-in" is detected at read-time (computed on GET), not
      via a real background scheduler or actual SMS/push alert to the trusted
      contact — that would need a job queue (e.g. node-cron or a proper task queue)
      plus a real SMS provider, neither of which exist in this project yet.**
      `[NEW, Task #18, V2 scope, see docs/ROADMAP.md's Phase 12]`.
      `backend/utils/safeDateUtils.js#computeSafeDateStatus()`/`applySafeDateComputation()`
      are re-evaluated fresh on **every** `GET /api/safe-dates`/
      `GET /api/safe-dates/:id` call: a still-`PLANNED` plan is flagged
      `isOverdue: true` once more than 30 minutes have passed since
      `plannedStartAt` with no check-in, and is only actually reclassified
      (persisted) to `status: 'MISSED_CHECKIN'` once more than 120 minutes have
      passed since `plannedEndAt` with still no check-in. **Nothing watches the
      clock in the background** — if nobody (not the owner, not anything else with
      their token) happens to call one of those two GET routes after the grace
      period passes, the plan just sits there still showing `PLANNED` until the
      next read. The **pre-date reminder** (`isReminderWindow` becoming true, and
      the one-time in-app `Notification` created alongside it — reusing
      `backend/utils/notificationUtils.js#createNotification()`, the same real,
      non-mocked in-app-notification infrastructure every other trigger point in
      this codebase uses) has the identical limitation: it only fires if a read
      happens to land inside the 60-minute window before `plannedStartAt`, not on
      a guaranteed schedule the way a real push reminder would. And **no one is
      ever actually contacted if a check-in is missed** — `trustedContactPhone` is
      stored on the `SafeDate` document purely for the user's own reference (so
      the UI can show "who would be contacted") and is **never** used to send a
      real SMS/call to that trusted contact; there is no SMS provider configured
      in this project at all (same MOCK/DEV-ONLY delivery gap already documented
      above for mobile-OTP verification). A real implementation of this feature
      would need: (1) a job queue (`node-cron` or a proper task queue) actually
      watching plan deadlines rather than waiting for an incidental read, and (2) a
      real SMS/voice provider (e.g. Twilio/MSG91) to actually reach the trusted
      contact when a check-in is genuinely missed — neither exists in this
      project yet. See `docs/DATABASE_SCHEMA.md`'s `safe_dates` section and
      `docs/API_DOCUMENTATION.md`'s Section 14 for the full writeup. **What IS
      real and non-mocked:** the plan CRUD itself (create/list/read/check-in/
      complete/cancel, owner-only access enforcement), the status-computation
      logic (deterministic, unit-tested), and the reminder `Notification`
      (a genuine persisted, live-socket-delivered in-app notification once it
      does fire).
- [ ] **Date Planner suggestions are a curated static list, not real AI.** `[NEW,
      Task #18, V2 scope, see docs/ROADMAP.md's Phase 12]`. `GET /api/date-ideas`
      (`backend/routes/dateIdeas.js`, `backend/utils/datePlanUtils.js`) is plain
      heuristic filtering over a small in-code list of 10 curated ideas — there is
      no `ANTHROPIC_API_KEY` configured for this project, same constraint already
      documented above for Task #15's Icebreakers/Why-You-Match. Nothing is
      persisted (no `date_plans` collection exists — see
      `docs/DATABASE_SCHEMA.md`'s divergence note); this is purely a stateless
      suggestion endpoint. Every curated idea is a **public** place/activity
      (café, restaurant, park, multiplex, public lake/garden, etc.) per the
      product spec's explicit safety rule against suggesting isolated/private
      meeting spots — enforced by hand-curating the list, not a runtime filter.

## Resolved (mocks replaced with real implementations)

- [x] **Reports and photo-verification moderation queues (Task #11 — Admin
      panel, basic; see `docs/ROADMAP.md`'s Phase 9).** Previously, both
      `Report.status` (Task #10) and `photoVerification.status` (Task #9)
      could reach `PENDING` but nothing ever transitioned them further —
      every report and every photo submission sat unreviewed forever. Now
      real: `GET/PATCH /api/admin/reports*` and
      `GET/PATCH /api/admin/verifications/photo*` (`backend/routes/
      admin.js`, role-gated `MODERATOR`+ via `backend/middleware/
      adminAuth.js`) let an admin/moderator actually resolve a report
      (`REVIEWED`/`ACTION_TAKEN`/`DISMISSED`, with an optional private
      `reviewNotes`) or approve/reject a pending selfie
      (`VERIFIED`/`REJECTED`). Every such action writes an `AuditLog` entry
      (`backend/models/AuditLog.js`, `backend/utils/auditUtils.js`). Also
      added: `role`/`accountStatus` fields on `users`, suspend/reinstate
      (`PATCH /api/admin/users/:userId/suspend` / `.../reinstate` — blocks
      login and hides the user from discovery), and a `SUPER_ADMIN`-only
      role-change route. See `docs/API_DOCUMENTATION.md`'s Admin section for
      the full route list. **Note:** there is still no self-serve "become
      admin" flow — see `SETUP.md`'s "Creating the first admin account"
      section for the one-time manual `mongosh` command a real deployment
      needs to bootstrap its first `SUPER_ADMIN`, since that's a
      security-sensitive action left deliberately outside the app itself.
