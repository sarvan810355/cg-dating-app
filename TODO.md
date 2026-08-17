# TODO — CG-Dating-App

Flat prioritized task list, grouped by scope tier (MVP first, then V2, then V3).
Check items off as they land; keep this in sync with `PROJECT_STATE.md` and
`IMPLEMENTATION_PROGRESS.md`.

## MVP (build first)

### Authentication
- [x] Project scaffold (backend + frontend)
- [ ] Signup / login / JWT issuance (in progress by parallel agent)
- [ ] Protected `GET /api/auth/me` route
- [ ] Mobile OTP verification flow (signup step)
- [ ] Password reset / forgot password
- [ ] Rate limiting on auth endpoints

### Profile
- [ ] Profile Mongoose schema (full fields, see docs/DATABASE_SCHEMA.md)
- [ ] Multi-step profile builder UI (basic info, DOB, gender, dating preference,
      dating intention, location, profession, education, interests, prompts)
- [ ] Photo upload (Cloudinary integration)
- [ ] Bio + interests + prompts editing
- [ ] Preferences (age range, distance, gender preference, dating intention filter)
- [ ] Profile strength / completeness score
- [ ] Profile view (own + others')

### Location
- [ ] City/district capture (not exact address) — must support all CG districts/towns,
      not just major cities
- [ ] Location-based query support (2dsphere index)

### Discovery
- [ ] Discovery feed API with pagination
- [ ] Discovery feed UI (card stack or list)
- [ ] Basic filters (age range, distance, dating intention)

### Like / Pass / Match
- [ ] Like/Pass API
- [ ] Mutual-like match detection
- [ ] Match creation + match animation/screen

### Chat
- [ ] Socket.IO server setup
- [ ] Conversation + Message schemas
- [ ] Real-time text chat UI
- [ ] Message read receipts / delivery status (basic)

### Notifications
- [ ] Notification schema + API
- [ ] Match / like / message notification events
- [ ] Basic in-app notification center

### Verification
- [ ] Mobile OTP verification (shared with signup)
- [ ] Photo/selfie verification flow
- [ ] Verification badge on profile

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
