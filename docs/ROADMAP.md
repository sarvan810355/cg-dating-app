# Roadmap — CG-Dating-App

16-phase roadmap, condensed, reconciled with the MVP / V2 / V3 scope split used
elsewhere in the docs (`TODO.md`, `PROJECT_STATE.md`). Status markers reflect the state
as of 2026-08-17 and should be updated as phases progress.

| Phase | Name | Scope tier | Status | Summary |
|---|---|---|---|---|
| 0 | Foundation | — | **Complete** | Repo setup, backend/frontend scaffold, baseline docs (this doc set). |
| 1 | Authentication + User System | MVP | **Complete (MVP subset)** | Signup, login, JWT sessions, protected routes implemented; mobile OTP verification and password reset are still `[PLANNED]` (folded into Phase 7 — Verification). |
| 2 | Profile System | MVP | **Complete (MVP subset)** | Profile schema, multi-step profile builder, bio/interests/prompts, profile strength score implemented; photo upload is MOCK/TEMPORARY (no Cloudinary yet, see `MOCK_FEATURES.md`); a persisted `preferences` collection is still deferred (see `docs/DATABASE_SCHEMA.md`). |
| 3 | Location & Discovery | MVP | **Complete (MVP subset)** | City/district capture and discovery feed with pagination + basic filters implemented; geospatial "near me" filtering not yet populated (see `MOCK_FEATURES.md`). |
| 4 | Matching (Like/Pass/Match) | MVP | **Complete (MVP subset)** | Like/pass API, mutual-match detection, match creation, match modal implemented; unmatch and "who liked you" not yet built. |
| 5 | Real-Time Chat | MVP | **Complete** | Socket.IO setup (JWT-authed handshake), Message schema (Match doubles as the conversation — see `docs/DATABASE_SCHEMA.md`), real-time text chat UI, basic read receipts + typing indicator. Text-only for this pass (image/voice deferred to V2, see `MOCK_FEATURES.md`). |
| 6 | Notifications | MVP | **Complete (in-app; FCM push MOCK/TEMPORARY-deferred)** | Notification schema/API (`backend/models/Notification.js`, `backend/routes/notifications.js`), match/like/message creation events with preference-gating, live `notification:new` Socket.IO event, in-app notification bell/dropdown + Settings preferences UI implemented; real Firebase Cloud Messaging push delivery not implemented (no credentials yet, see `MOCK_FEATURES.md`). |
| 7 | Verification | MVP | **Complete (MVP subset; MOCK SMS delivery, manual photo review)** | Mobile OTP verification (`backend/routes/verification.js`, hashed OTP + 10-min expiry + rate limiting, MOCK console-logged/dev-only-response SMS delivery — see `MOCK_FEATURES.md`), photo/selfie verification (submission -> `PENDING`, manual-review queue for the future Admin panel, no automated face-match), verification badges (`mobileVerified`/`photoVerified` booleans on public profile/discovery/match views, `VerificationBadge` component + a dedicated Verification screen) implemented. |
| 8 | Safety (Report/Block/Safety Center) | MVP | Not Started | Report and block flows, Safety Center screen. |
| 9 | Admin Panel (basic) | MVP | Not Started | Role field + role-gated `/admin` routes, reports queue, verification review, suspend/ban, audit logging. |
| 10 | Subscription (basic) | MVP | Not Started | Configurable plans (CG_PLUS/CG_PRO/CG_ELITE), paywall UI, server-side entitlement checks; Razorpay integration may ship mocked initially (see `MOCK_FEATURES.md`). |
| 11 | AI Features | V2 | Not Started | Claude API integration (backend-only): Why-You-Match, Smart Icebreakers, Profile Coach, Date Ideas — with caching/rate-limits/token-limits/usage tracking. |
| 12 | Growth & Engagement Features | V2 | Not Started | Safe Date mode, Date Planner, Private/Invisible browsing, advanced filters, Profile Boost, Priority Like, Referral program, real Razorpay integration. |
| 13 | Testing & QA | Cross-cutting | Not Started | Unit, integration, UI, security, and regression test suites (see `docs/TESTING_STRATEGY.md`); `npm test` to be implemented here. |
| 14 | Security Hardening | Cross-cutting | Not Started | Full pass on the security requirements list (rate limiting, input validation everywhere, secure uploads, audit logging, secret hygiene) ahead of any public launch. |
| 15 | Deployment | Cross-cutting | Not Started | Backend on Render/Railway, MongoDB Atlas, frontend on Vercel/Netlify, Cloudinary wired for production, environment/secrets configured per provider. |
| 16 | Final Audit / V3 Expansion | V3 | Not Started | CG Connect (events), advanced Trust Engine, ML-based recommendations, advanced analytics, statewide/national expansion, city SEO pages at scale, Capacitor native wrapper. |

## Notes on sequencing

- Phases 0–1 run partly in parallel (docs/foundation work alongside auth implementation)
  — that overlap is expected and is exactly what's happening as of this writing.
- Phases 2–10 form the MVP critical path and should generally be built in the listed
  order, since later ones depend on earlier ones (Profile before Discovery before
  Matching before Chat before Notifications, etc.), though some parallelization across
  agents is fine as long as they don't touch overlapping files.
- Phase 13 (Testing) and Phase 14 (Security Hardening) are listed after the MVP feature
  phases for roadmap clarity, but individual tests/security checks should be added
  incrementally as each feature phase lands, not deferred entirely to the end.
- Phase 11–12 (V2) and Phase 16 (V3) should not start until the MVP (Phases 1–10) is
  shipped and working end-to-end, per the project's own MVP-first priority.
