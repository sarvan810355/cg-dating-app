# CG Dating

CG Dating is a dating app. This repository contains the full app: a React
frontend and a Node.js/Express backend backed by MongoDB.

This is an early-stage scaffold. Authentication, profiles, swipe/match,
chat, and UI polish are being built out in subsequent tasks — this initial
commit only lays down the project structure.

## Stack

- **Frontend**: React + Vite + Tailwind CSS (`/frontend`)
- **Backend**: Node.js + Express (`/backend`)
- **Database**: MongoDB with Mongoose (`/backend/models`)

## Project structure

```
cg-dating-app/
├── backend/
│   ├── models/       # Mongoose schemas (User, Profile, Match, Message)
│   ├── routes/       # Express route handlers
│   ├── server.js     # App entrypoint
│   └── .env.example  # Env var template
├── frontend/
│   └── src/          # React app (Vite + Tailwind)
└── README.md
```

## Running locally

You'll need Node.js (v18+) installed. MongoDB is optional to get the
backend server running, but required for any real data persistence.

### Backend

```bash
cd backend
cp .env.example .env   # then fill in MONGODB_URI / JWT_SECRET as needed
npm install
npm run dev
```

The API server starts on `http://localhost:5000` (configurable via `PORT`
in `.env`). A health check is available at `GET /api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts on `http://localhost:5173` by default.

## Status

- [x] Project scaffold (this task)
- [ ] Authentication
- [ ] Profiles
- [ ] Swipe / match
- [ ] Chat
- [ ] Polish
