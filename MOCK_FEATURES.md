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
- [ ] **Firebase Cloud Messaging (push notifications) — no credentials configured.** Not
      implemented yet.
- [ ] **Razorpay (payments/subscriptions) — no credentials configured.** Subscription plans
      and paywall UI are planned as part of MVP, but real payment processing may ship as
      MOCK/TEMPORARY first (e.g. a fake "success" entitlement toggle) if Razorpay isn't
      wired up in time — any such mock MUST be labeled clearly in code comments and in this
      file, and entitlement checks must still happen server-side even in mock mode.
- [ ] **Anthropic Claude API (AI features) — no credentials configured.** AI Icebreakers,
      Why-You-Match, Profile Coach, Date Ideas are all V2 scope and not started.

## Resolved (mocks replaced with real implementations)

None yet.
