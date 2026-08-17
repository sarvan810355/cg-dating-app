# Setup Guide — CG-Dating-App

## Prerequisites

- **Node.js:** v20 LTS or newer recommended (this repo has been developed/tested with
  Node v22; anything on the current Node LTS line should work). Check with `node --version`.
- **npm:** ships with Node; used for both `backend/` and `frontend/`.
- **MongoDB:** a running MongoDB instance, either local (e.g. `mongod` on
  `mongodb://localhost:27017`) or a free-tier MongoDB Atlas cluster. Not yet provisioned
  in this sandbox — see `MOCK_FEATURES.md` for current status. The backend is written to
  start even without a live DB connection in dev (non-fatal), but any DB-backed route
  will fail until `MONGODB_URI` points at a real instance.
- **Git**, obviously, and a GitHub account with access to the repo if you intend to push.

Not required yet (planned for later phases, see `docs/ROADMAP.md`): Cloudinary account,
Firebase project (FCM), Razorpay account, Anthropic API key. Backend code should treat
these as optional/absent until the phases that wire them up.

## 1. Clone & install

```bash
git clone <repo-url> cg-dating-app
cd cg-dating-app

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## 2. Environment variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in real values:

| Variable       | Purpose                                                        |
|----------------|------------------------------------------------------------------|
| `PORT`         | Port the Express server listens on (default `5000`)             |
| `MONGODB_URI`  | MongoDB connection string (local or Atlas)                      |
| `JWT_SECRET`   | Secret used to sign JSON Web Tokens — use a long random string  |

```bash
cd backend
cp .env.example .env
# edit .env with your local values
```

Future phases will add: `CLOUDINARY_URL` (or key/secret/cloud name), Firebase service
account / FCM keys, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, `ANTHROPIC_API_KEY`. None
of these exist yet — do not invent placeholder values in real `.env` files, only update
`.env.example` when those integrations are actually added.

### Frontend (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

| Variable        | Purpose                              |
|-----------------|---------------------------------------|
| `VITE_API_URL`  | Base URL of the backend API           |

```bash
cd frontend
cp .env.example .env
# edit .env if your backend isn't on the default URL
```

**Never commit real `.env` files or real secrets.** Only `.env.example` files with
placeholder values belong in git.

## 3. Run in development

In two separate terminals:

```bash
# Terminal 1 — backend (Express, with auto-restart via nodemon)
cd backend
npm run dev
# server listens on http://localhost:<PORT> (default 5000)

# Terminal 2 — frontend (Vite dev server)
cd frontend
npm run dev
# app served at the URL Vite prints (default http://localhost:5173)
```

You can also run the backend without auto-restart via `npm start` in `backend/`.

## 4. Creating the first admin account (manual, one-time)

The Admin panel (Task #11, see `docs/ROADMAP.md`'s Phase 9) has no self-serve "become
admin" flow, anywhere — this is intentional. Promoting an account to `SUPER_ADMIN`,
`ADMIN`, or `MODERATOR` is a security-sensitive action, so the very first admin account
on a real deployment must be created by directly editing the database, not through the
app or API. (Once at least one `SUPER_ADMIN` exists, they can promote/demote further
accounts through the app itself, via `PATCH /api/admin/users/:userId/role` — see
`docs/API_DOCUMENTATION.md`'s Admin section.)

1. Sign up for a normal account through the app first (`POST /api/auth/signup` or the
   Signup screen), using the email you want as the first admin.
2. Connect to your real MongoDB instance (local `mongod` or Atlas) with `mongosh` (or
   Compass, or any Mongo client), pointed at the same database `MONGODB_URI` in
   `backend/.env` uses.
3. Run:
   ```js
   use cg-dating-app   // or whatever your MONGODB_URI's database name is

   db.users.updateOne(
     { email: "your-admin-email@example.com" },
     { $set: { role: "SUPER_ADMIN" } }
   )
   ```
4. Log out and back in (or just refresh — the role is read fresh from the database on
   every admin request, but the frontend's own copy of `user.role` comes from
   `GET /api/auth/me`, which the app already calls on load). The account will now see an
   "Admin" link in Settings, and the `/admin` section (dashboard, reports queue, photo
   verification queue, user management) becomes reachable.

There is no seed script for this — a throwaway `db.users.updateOne(...)` command like
the one above is the entire "setup" required, and it only ever needs to be run once per
deployment to bootstrap the first `SUPER_ADMIN`.

## 5. Build for production

```bash
# Frontend production build (outputs to frontend/dist)
cd frontend
npm run build

# Preview the production build locally
npm run preview
```

The backend has no separate build step (plain Node/Express) — `npm start` runs it
directly with `node server.js`.

## 6. Linting

```bash
cd frontend
npm run lint   # runs oxlint
```

No lint script is configured for the backend yet.

## 7. Tests

`npm test` — to be implemented in Phase 13 (Testing & QA). No automated test suite
exists yet in either `backend/` or `frontend/`. See `docs/TESTING_STRATEGY.md` for the
planned approach (unit, integration, UI, security, and regression tests) once it lands.
