# TODO — CG-Dating-App

Flat prioritized task list, grouped by scope tier (MVP first, then V2, then V3).
Check items off as they land; keep this in sync with `PROJECT_STATE.md` and
`IMPLEMENTATION_PROGRESS.md`.

## MVP (build first)

### Authentication
- [x] Project scaffold (backend + frontend)
- [ ] Signup / login / JWT issuance (in progress by parallel agent)
- [ ] Protected `GET /api/auth/me` route
- [x] Mobile OTP verification flow — **not** a signup step; implemented as a
      separate post-signup Verification flow instead (Task #9, see the
      Verification section below) since signup itself is email/password only
- [ ] Password reset / forgot password
- [ ] Rate limiting on auth endpoints

### Profile
- [x] Profile Mongoose schema (full fields, see docs/DATABASE_SCHEMA.md)
- [x] Multi-step profile builder UI (basic info, DOB, gender, dating preference,
      dating intention, location, profession, education, interests, prompts)
- [x] Photo upload — MOCK/TEMPORARY (URL or base64 stored directly on the profile
      doc; real Cloudinary integration still not wired up, see MOCK_FEATURES.md)
- [x] Bio + interests + prompts editing
- [ ] Preferences (age range, distance, gender preference, dating intention filter) —
      **still not a persisted collection** after Task #4; Discovery instead accepts
      `datingIntention`/`city` as ad-hoc query params (see docs/DATABASE_SCHEMA.md's
      `preferences` divergence note); `interestedIn`/`datingIntention` already live
      on the Profile itself
- [x] Profile strength / completeness score (`profileCompletionPercentage` +
      `completionHints`, computed server-side)
- [x] Profile view (own via `GET /api/profile/me`, others' public view via
      `GET /api/profile/:userId`)

### Location
- [x] City/district capture (not exact address) — district is free text, supports
      any CG district/town, not just major cities
- [ ] Location-based query support (2dsphere index) — index exists on
      `profiles.location`, but no UI/route populates or queries it yet; deferred to
      Task #4 (Discovery)

### Discovery
- [x] Discovery feed API with pagination (`GET /api/discovery/feed`, page-based)
- [x] Discovery feed UI (`frontend/src/pages/Discovery.jsx` — card + Like/Pass
      buttons, loads more as the queue runs low)
- [x] Basic filters (`datingIntention`, `city`) — age range / distance filters
      deferred, see the `preferences` item above and `docs/API_DOCUMENTATION.md`

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
- [ ] Report user flow (API + UI)
- [ ] Block user flow (API + UI)
- [ ] Safety Center screen

### Admin
- [ ] Role field on User model (SUPER_ADMIN, ADMIN, MODERATOR, SUPPORT, ANALYST)
- [ ] Role-gated `/admin` routes in the React app
- [ ] Reports queue (moderation)
- [ ] Verification review queue
- [ ] Suspend / ban user actions
- [ ] Audit log for admin actions

### Subscription (basic)
- [ ] Subscription plan model (CG_PLUS, CG_PRO, CG_ELITE), admin-editable pricing
- [ ] Paywall UI for premium features
- [ ] Server-side entitlement checks
- [ ] Razorpay integration — MOCK/TEMPORARY acceptable until wired for real (mark clearly
      in MOCK_FEATURES.md)

### Cross-cutting MVP work
- [ ] Security hardening pass (see docs/ARCHITECTURE.md + security requirements)
- [ ] Input validation on all endpoints
- [ ] Error handling / consistent error response format
- [ ] Basic automated test suite (see docs/TESTING_STRATEGY.md)
- [ ] Deployment setup (Render/Railway + MongoDB Atlas + Vercel/Netlify + Cloudinary)

## V2 (after MVP ships end-to-end)

- [ ] AI compatibility explanations ("Why You Match") via Claude API
- [ ] AI Smart Icebreakers
- [ ] AI Profile Coach suggestions
- [ ] AI Date Ideas
- [ ] Safe Date mode (safety timer, check-in, trusted contact)
- [ ] Date Planner
- [ ] Private / Invisible browsing
- [ ] Advanced filters
- [ ] Profile Boost
- [ ] Priority Like
- [ ] Referral program (Invite & Earn)
- [ ] Real Razorpay payment integration (replace MOCK)
- [ ] Voice call / video call in chat

## V3 (longer-term)

- [ ] CG Connect (local events + social discovery)
- [ ] Events schema + API + UI
- [ ] Advanced Trust Engine (bot/spam/duplicate detection, trust score)
- [ ] ML-based recommendations
- [ ] Advanced analytics dashboard (admin)
- [ ] Statewide then national expansion
- [ ] City-specific SEO landing pages at scale (possible migration to Next.js)
- [ ] Capacitor native Android/iOS wrapper (push, camera, deep native features)
