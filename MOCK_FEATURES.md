# Mock / Temporary Features

This file tracks anything in the codebase that is mocked, stubbed, disabled, or
otherwise not a real production implementation yet, so nobody mistakes a placeholder
for a finished feature. Update this checklist as real implementations replace mocks —
move items to "Resolved" rather than deleting them, so there's a record of what changed.

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
- [ ] **Anthropic Claude API (AI features) — no credentials configured.** AI Icebreakers,
      Why-You-Match, Profile Coach, Date Ideas are all V2 scope and not started.
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
