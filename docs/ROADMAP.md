# Roadmap — CG-Dating-App

16-phase roadmap, condensed, reconciled with the MVP / V2 / V3 scope split used
elsewhere in the docs (`TODO.md`, `PROJECT_STATE.md`). Status markers reflect the state
as of 2026-08-18 (Task #6 — final polish/security audit/docs, the last of the 12
internal tasks that made up the MVP build) and should be updated as phases progress.
**The MVP (Phases 0-10) is complete.** Phases 13-15 (Testing, full Security Hardening,
Deployment) remain cross-cutting work not yet started — see `TODO.md`'s "Before real
production launch" section for the concrete gap list. This project is explicitly
**not production-ready** as-is.

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
| 8 | Safety (Report/Block/Safety Center) | MVP | **Complete** | Report flow (`POST /api/reports`, reason enum + optional details/evidence), Block flow (`POST`/`DELETE`/`GET /api/blocks`, bidirectional exclusion enforced in discovery/matches/messaging/Socket.IO), Report/Block entry points on Discovery cards + Chat, Blocked Users management screen, and a static Safety Center screen implemented. No automated abuse detection — purely manual, reviewed by the Admin moderation queue (Phase 9, now complete); see `MOCK_FEATURES.md`. |
| 9 | Admin Panel (basic) | MVP | **Complete** | Role field (`USER`/`SUPER_ADMIN`/`ADMIN`/`MODERATOR` — divergence: no `SUPPORT`/`ANALYST`, see `docs/DATABASE_SCHEMA.md`) + role-gated `/admin` routes (`backend/routes/admin.js`, `frontend/src/components/AdminRoute.jsx`), reports queue, photo-verification review queue, suspend/reinstate (no permanent ban in this basic pass), and audit logging (`backend/models/AuditLog.js`) implemented. No self-serve "become admin" flow — the first `SUPER_ADMIN` must be promoted directly in the database, see `SETUP.md`. |
| 10 | Subscription (basic) | MVP | **Complete** | Configurable plans (CG_PLUS/CG_PRO/CG_ELITE, DB-backed/admin-editable), paywall UI, server-side entitlement checks (`hasFeature()`, demonstrated on the free-tier daily like limit) implemented; Razorpay integration ships MOCK (immediate activation, no real payment/webhook — see `MOCK_FEATURES.md`, explicitly **not production-ready as-is**). |
| — | Final Polish / Security Audit / Documentation (Task #6) | Cross-cutting (MVP wrap-up) | **Complete** | Full build/lint/boot verification pass; security audit against `docs/ARCHITECTURE.md`'s requirements (two real gaps fixed — auth rate limiting, a `User.password` defense-in-depth hardening — one larger gap tracked as BUG-001, see `docs/SECURITY_AUDIT.md`); UI consistency spot-check (found already-solid, no changes needed); every tracking doc finalized to reflect true MVP-complete state. This closes out the MVP build — see `PROJECT_STATE.md`. |
| 11 | AI Features | V2 | **In Progress** | **Why-You-Match and Smart Icebreakers implemented 2026-08-18 (Task #15, user-requested)** — `backend/utils/compatibilityUtils.js` / `backend/utils/icebreakerUtils.js`, `GET /api/matches` (`compatibility` field), `GET /api/matches/:matchId/compatibility`, `GET /api/matches/:matchId/icebreakers`. **Not real Claude API integration** — no `ANTHROPIC_API_KEY` configured anywhere in this project (see `backend/.env.example`), so both features are deterministic, server-side profile-comparison heuristics instead (see `MOCK_FEATURES.md` for the full explanation and what a real upgrade would need). Profile Coach and Date Ideas status: check `git log`/`PROJECT_STATE.md` for the current state rather than trusting this line, as other work may be in progress on this branch concurrently with this note being written. |
| 12 | Growth & Engagement Features | V2 | **In Progress** | **Safe Date mode + Date Planner implemented 2026-08-18 (Task #18, user-requested)** — `backend/models/SafeDate.js`, `backend/routes/safeDates.js` (owner-only plan CRUD + check-in/complete/cancel), `backend/utils/safeDateUtils.js` (read-time `isOverdue`/`MISSED_CHECKIN`/reminder-window computation — no background scheduler or real SMS/push alert exists in this project, see `MOCK_FEATURES.md`), `backend/routes/dateIdeas.js` + `backend/utils/datePlanUtils.js` (a stateless, curated, **not-real-AI** suggestion generator — no `ANTHROPIC_API_KEY` configured, same constraint as Task #15's Icebreakers). Frontend: `frontend/src/pages/PlanSafeDate.jsx`, `frontend/src/pages/SafeDates.jsx`, `frontend/src/pages/DateIdeas.jsx`, reachable from Chat ("Safe Date" header link) and Settings. **Referral program ("Invite & Earn") also implemented** (Task #17, see `docs/DATABASE_SCHEMA.md`'s `referrals` section and `docs/API_DOCUMENTATION.md`'s §13) — `GET /api/referrals/me`, signup-time code linking, mutual `CG_PLUS` reward grants; no real deep-link/click-analytics infrastructure (see `MOCK_FEATURES.md`). Remaining, not started: Private/Invisible browsing, advanced filters, Profile Boost, Priority Like, real Razorpay integration. |
| 13 | Testing & QA | Cross-cutting | Not Started | Unit, integration, UI, security, and regression test suites (see `docs/TESTING_STRATEGY.md`); `npm test` to be implemented here. Every test performed across the MVP build so far has been a manual/throwaway verification script (see `IMPLEMENTATION_PROGRESS.md`), never committed as reusable regression coverage. |
| 14 | Security Hardening | Cross-cutting | Not Started | Task #6 performed a security *audit* (see above) and fixed what was safely fixable in a polish pass, but the full hardening build-out — `helmet`/security-headers middleware, rate limiting beyond auth, a systematic input-validation layer — remains open, tracked as BUG-001 (see `BUGS.md`). |
| 15 | Deployment | Cross-cutting | Not Started | Backend on Render/Railway, MongoDB Atlas, frontend on Vercel/Netlify, Cloudinary wired for production, environment/secrets configured per provider. Also blocked on: a live MongoDB connection has never been verified in any sandbox across this entire project — see `TODO.md`'s "Before real production launch" section. |
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
  shipped and working end-to-end, per the project's own MVP-first priority. **Update
  as of Task #6:** the MVP is now fully *built* (Phases 0-10 complete, code-reviewed,
  and builds/boots cleanly), but "working end-to-end" in the fullest sense still means
  verified against a live database, which has never happened in any sandbox across
  this project's history — see `TODO.md`'s "Before real production launch" section.
  V2/V3 work should wait until that verification happens on a real environment, not
  just until the MVP code exists.
