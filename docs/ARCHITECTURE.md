# Architecture — CG-Dating-App

## 1. Overview

CG-Dating-App is a Chhattisgarh-first dating and relationship platform delivered as a
Progressive Web App (PWA) backed by a Node.js/Express API and MongoDB. It supports
dating, serious relationships, marriage/life-partner search, and friendship, with
"dating intention" as a first-class field driving matching and discovery.

## 2. Tech Stack & Rationale

| Layer                    | Choice                                   | Why |
|---------------------------|-------------------------------------------|-----|
| Client app                | PWA — React + Vite + Tailwind             | One codebase covers web + installable mobile + a future native wrapper (Capacitor), minimizing cost/complexity for AI-agent-driven iterative development. Chosen over a from-scratch React Native app for that reason. Mobile-first, responsive, installable via manifest + service worker. |
| Marketing / SEO city pages | Public routes in the same React app initially | e.g. `/raipur`, `/bhilai`, `/bilaspur`, `/korba`, `/raigarh`, `/jagdalpur`, `/ambikapur`, `/dhamtari`, etc. Migrate to a server-rendered approach (e.g. Next.js) only if/when SEO performance demands it — not before. |
| Backend API                | Node.js + Express                         | Already scaffolded and working; simple, well-understood, huge ecosystem. |
| Database                   | MongoDB via Mongoose                      | Kept over PostgreSQL because it's already working, its schema flexibility suits evolving profile/prompt fields, geospatial discovery queries are well supported via `2dsphere` indexes, and reference-based relations are sufficient at MVP scale. |
| Real-time chat             | Socket.IO on top of the Express server    | Mature, well-integrated with Express, handles reconnect/rooms out of the box. |
| Media storage               | Cloudinary                                | Image compression, thumbnails, CDN delivery, moderation-friendly pipeline. Original media is never stored directly in MongoDB. |
| Push notifications          | Firebase Cloud Messaging (FCM)            | Web push now; same mechanism extends to native push once wrapped with Capacitor. |
| Payments / subscriptions    | Razorpay                                  | India-first, strong UPI support. Plans (`CG_PLUS`, `CG_PRO`, `CG_ELITE`) and pricing are admin-editable, never hardcoded. Entitlement is validated server-side via webhooks — client-side payment status is never trusted. |
| AI layer                    | Anthropic Claude API                      | Called only from the backend — API keys are never exposed to or called from the frontend. Powers AI Icebreakers, Why-You-Match explanations, Profile Coach suggestions, Date Ideas (all V2). Requires caching, rate limits, token limits, and usage tracking to control cost (see `docs/API_DOCUMENTATION.md` and future `AI_USAGE.md`). |
| Admin panel                 | Role-gated routes under `/admin` in the same React app | Not a separate app. Protected by roles on the User model: `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT`, `ANALYST`. |
| Hosting (Phase 15, not yet set up) | Backend: Render or Railway. DB: MongoDB Atlas. Frontend: Vercel or Netlify. Media: Cloudinary. | Standard low-ops managed hosting suited to an MVP-stage product. |

## 3. System Architecture (text diagram)

```
                    ┌─────────────────────────────┐
                    │   Client (PWA)               │
                    │   React + Vite + Tailwind     │
                    │   - Public marketing/SEO pages│
                    │   - Auth / onboarding flows    │
                    │   - Discovery / matching UI     │
                    │   - Chat UI (Socket.IO client)  │
                    │   - /admin (role-gated)          │
                    └───────────────┬───────────────┘
                                    │ HTTPS (REST) + WebSocket (Socket.IO)
                                    ▼
                    ┌─────────────────────────────┐
                    │   Express API server          │
                    │   - Auth (JWT)                 │
                    │   - Profile / Discovery / Match │
                    │   - Messaging (Socket.IO server)│
                    │   - Verification / Safety        │
                    │   - Payments / Subscriptions      │
                    │   - Admin / Moderation             │
                    │   - AI endpoints (proxy to Claude)  │
                    └───┬───────┬───────┬───────┬───────┘
                        │       │       │       │
                        ▼       ▼       ▼       ▼
                  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
                  │ MongoDB │ │Cloudinary│ │  FCM      │ │ Razorpay  │
                  │ (Atlas) │ │ (media)  │ │ (push)    │ │ (payments)│
                  └─────────┘ └──────────┘ └──────────┘ └───────────┘
                        │
                        ▼
                  ┌─────────────┐
                  │ Anthropic    │
                  │ Claude API   │  (server-to-server only, never from client)
                  └─────────────┘
```

## 4. Security Architecture (summary)

- JWT-based authentication with secure session handling (short-lived access tokens;
  refresh strategy to be finalized during the auth hardening pass).
- Passwords hashed with bcrypt; plaintext passwords never logged or stored.
- HTTPS everywhere in production (encryption in transit).
- Every protected route performs server-side authorization checks — never trust a
  client-supplied user id or role.
- Rate limiting on sensitive endpoints (auth, OTP, messaging, AI endpoints).
- Input validation on all endpoints (body/query/params).
- Secure file upload validation: type and size checks before anything reaches
  Cloudinary; uploaded files are never directly executable server-side.
- No secrets in frontend code or git history; all secrets live in backend `.env`
  (never committed) and, in production, in the hosting provider's secret manager.
- Audit logging for admin actions (`moderation_actions` / `audit_logs` collections —
  see `docs/DATABASE_SCHEMA.md`).
- Role-based admin permissions enforced server-side on every admin route.
- Payment/entitlement state is always re-verified server-side (via Razorpay webhooks),
  never trusted from client claims.
- Sensitive fields (password hash, exact address, government ID, internal trust score,
  private admin notes) are never serialized into API responses — see field-level access
  rules in `docs/DATABASE_SCHEMA.md`.

## 5. Real-Time Architecture (summary)

- Socket.IO server attached to the same Express HTTP server.
- Auth: socket connections authenticate using the same JWT used for REST calls (passed
  at handshake), then join a per-user room (e.g. `user:<id>`) and per-conversation rooms.
- Events (planned): `message:send`, `message:new`, `message:read`, `typing:start`,
  `typing:stop`, `match:new`, `notification:new`, presence/online events.
- Delivery: messages are persisted to MongoDB first, then broadcast; offline users get
  a push notification via FCM in addition to the in-app event.

## 6. AI Architecture (summary)

- All AI calls go through backend endpoints that wrap the Anthropic Claude API — the
  frontend never holds or calls with an API key.
- Use cases (V2): AI Icebreakers, Why-You-Match compatibility explanations, Profile
  Coach suggestions, Date Ideas.
- Cost control approach:
  - **Caching** — cache deterministic-ish outputs (e.g. a given match's "why you
    match" explanation) so repeated views don't re-call the API.
  - **Rate limits** — per-user and global rate limits on AI endpoints.
  - **Token limits** — capped max output tokens per request type; truncate/curate
    input context sent to the model.
  - **Usage tracking** — log token usage per user/feature so cost is observable and
    tunable (tracked alongside a future `AI_USAGE.md`).

## 7. Deployment Target Summary (Phase 15, not yet set up)

- **Backend:** Render or Railway (Node/Express process).
- **Database:** MongoDB Atlas (managed, with proper network access rules and backups).
- **Frontend:** Vercel or Netlify (static build of the Vite app, PWA-installable).
- **Media:** Cloudinary (already the media layer regardless of host).
- Environment variables/secrets configured per-provider; no secrets in the repo.
