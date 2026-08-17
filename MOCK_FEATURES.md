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
- [ ] **Razorpay (payments/subscriptions) — no credentials configured.** Subscription plans
      and paywall UI are planned as part of MVP, but real payment processing may ship as
      MOCK/TEMPORARY first (e.g. a fake "success" entitlement toggle) if Razorpay isn't
      wired up in time — any such mock MUST be labeled clearly in code comments and in this
      file, and entitlement checks must still happen server-side even in mock mode.
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

## Resolved (mocks replaced with real implementations)

None yet.
