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
