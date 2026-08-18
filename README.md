# CG Dating

CG Dating is a Chhattisgarh-first dating app: real profiles, mobile + photo
verification, real-time chat, and a moderated safety/report/block system, built
around local (city/district-level) discovery rather than exact-address geolocation.
See `docs/BUSINESS_PLAN.md` for the product positioning and `docs/DESIGN_SYSTEM.md`
for the visual direction.

**Status: MVP complete.** All 10 core features are implemented end-to-end —
authentication, profiles, discovery/matching, real-time chat, notifications,
mobile/photo verification, safety (report/block), a basic subscription/paywall
scaffold, and a role-gated admin panel. See `PROJECT_STATE.md` for the full
per-feature status and `docs/ROADMAP.md` for the phase-by-phase breakdown.

**This is not yet production-ready.** No live MongoDB connection has ever been
verified in any development sandbox, Cloudinary/Firebase/Razorpay/SMS-provider
credentials are not configured (see `MOCK_FEATURES.md`), there is no automated test
suite yet, and `docs/SECURITY_AUDIT.md`/`BUGS.md` track the remaining hardening work.
See `TODO.md`'s "Before real production launch" section for the concrete gap list.

## Stack

- **Frontend**: React + Vite + Tailwind CSS (`/frontend`)
- **Backend**: Node.js + Express + Socket.IO (`/backend`)
- **Database**: MongoDB with Mongoose (`/backend/models`)

## Project structure

```
cg-dating-app/
├── backend/
│   ├── models/       # Mongoose schemas (User, Profile, Match, Message, ...)
│   ├── routes/       # Express route handlers
│   ├── middleware/   # Auth, admin role-gating, rate limiting
│   ├── utils/        # Shared server-side logic (serializers, entitlements, ...)
│   ├── server.js     # App entrypoint
│   └── .env.example  # Env var template
├── frontend/
│   └── src/          # React app (Vite + Tailwind) — pages, components, context
├── docs/              # Architecture, database schema, API reference, roadmap, etc.
└── README.md          # This file
```

## Documentation

Start with `PROJECT_STATE.md` for the current state of the project at a glance, then:

- `SETUP.md` — full local setup instructions (this README's "Running locally" section
  is the short version; SETUP.md is the source of truth if the two ever disagree)
- `docs/ARCHITECTURE.md` — system architecture, tech choices, security requirements
- `docs/DATABASE_SCHEMA.md` — every Mongoose model, with divergence notes vs. the
  original draft schema
- `docs/API_DOCUMENTATION.md` — every route, request/response shape, and auth
  requirement
- `docs/DESIGN_SYSTEM.md` — color tokens (light + dark mode), typography, component
  library
- `docs/SCREEN_MAP.md` — every frontend screen and how they connect
- `docs/ROADMAP.md` — the 16-phase roadmap with current status per phase
- `docs/BUSINESS_PLAN.md` — product positioning, plans/pricing, differentiators
- `docs/TESTING_STRATEGY.md` — the planned testing approach (not yet implemented)
- `docs/SECURITY_AUDIT.md` — the Task #6 security audit findings
- `TODO.md` — prioritized task list (MVP — done, before-production-launch gaps, V2, V3)
- `BUGS.md` — known bug tracker
- `MOCK_FEATURES.md` — everything currently mocked/stubbed and what real
  implementation would replace it
- `IMPLEMENTATION_PROGRESS.md` — full append-only build log, newest entry first

## Running locally

You'll need Node.js v20+ and a MongoDB instance (local `mongod` or a free MongoDB
Atlas cluster) — see `SETUP.md` for full details including environment variables and
creating the first admin account. Quick start:

### Backend

```bash
cd backend
cp .env.example .env   # then fill in MONGODB_URI / JWT_SECRET
npm install
npm run dev
```

The API server starts on `http://localhost:5000` (configurable via `PORT` in `.env`).
A health check is available at `GET /api/health`. The server starts even without a
live MongoDB connection (non-fatal in dev), but any DB-backed route will fail until
`MONGODB_URI` points at a real, reachable instance.

### Frontend

```bash
cd frontend
cp .env.example .env   # then set VITE_API_URL if your backend isn't on the default
npm install
npm run dev
```

The frontend dev server starts on `http://localhost:5173` by default.

### Build & lint

```bash
cd frontend
npm run build   # production build, outputs to frontend/dist
npm run lint    # oxlint
```

Backend has no separate build step (`npm start` runs `node server.js` directly) and no
lint script configured yet.

## Status

- [x] Project scaffold
- [x] Authentication
- [x] Profiles
- [x] Discovery / swipe / match
- [x] Real-time chat
- [x] Notifications
- [x] Verification (mobile OTP + photo)
- [x] Safety (report / block)
- [x] Subscription (basic, MOCK checkout)
- [x] Admin panel
- [x] Final polish / security audit / documentation
- [ ] V2 features (AI, Safe Date, Boost, Referral, real payments — see
      `docs/ROADMAP.md`)
- [ ] Production deployment
