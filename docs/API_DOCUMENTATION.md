# API Documentation — CG-Dating-App

All endpoints are mounted under `/api`. Every endpoint entry below states its method,
auth requirement, request shape, response shape, error format, and required
role/permission where relevant. Endpoints are marked:

- `[IMPLEMENTED]` — exists in code today and has been reviewed against the actual route file.
- `[IN PROGRESS]` — actively being built (by the auth agent, as of this writing).
- `[PLANNED]` — contract documented here for future implementation; not yet built.

Standard error format (used across the API): `{ "message": "<human-readable error>" }`
with an appropriate HTTP status code (`400` validation, `401` unauthenticated, `403`
forbidden, `404` not found, `409` conflict, `500` server error). This may evolve to a
structured `{ "error": { "code", "message", "details" } }` shape as more endpoints land
— update this doc when it does.

---

## 1. Authentication — `[IMPLEMENTED / IN PROGRESS]`

Base path: `/api/auth`

### `POST /api/auth/signup`
- **Auth:** none
- **Request body:**
  ```json
  { "email": "user@example.com", "password": "at-least-8-chars" }
  ```
- **Validation:** `email` and `password` required; email must match a basic
  `name@domain.tld` pattern; password must be >= 8 characters; email is
  lower-cased/trimmed before storage and uniqueness check.
- **Success response:** `201 Created`
  ```json
  { "token": "<JWT>", "user": { "id": "...", "email": "...", "createdAt": "..." } }
  ```
- **Errors:**
  - `400` — missing email/password, invalid email format, password too short
  - `409` — an account with this email already exists
  - `500` — unexpected server error
- **Notes:** password is hashed with bcrypt (10 salt rounds) before storage; token is a
  JWT signed with `JWT_SECRET`, 7-day expiry, payload `{ id: <userId> }`.

### `POST /api/auth/login`
- **Auth:** none
- **Request body:**
  ```json
  { "email": "user@example.com", "password": "..." }
  ```
- **Success response:** `200 OK`
  ```json
  { "token": "<JWT>", "user": { "id": "...", "email": "...", "createdAt": "..." } }
  ```
- **Errors:**
  - `400` — missing email/password
  - `401` — invalid email or password (same message for both cases, to avoid user enumeration)
  - `500` — unexpected server error
- **Notes:** updates `user.lastLoginAt` on success.

### `GET /api/auth/me`
- **Auth:** required — `Authorization: Bearer <JWT>` header, verified by the
  `requireAuth` middleware (`backend/middleware/auth.js`)
- **Request body:** none
- **Success response:** `200 OK`
  ```json
  { "user": { "id": "...", "email": "...", "createdAt": "..." } }
  ```
- **Errors:**
  - `401` — missing/invalid/expired token (from `requireAuth` middleware)
  - `404` — user no longer exists
  - `500` — unexpected server error

### Planned additions to Authentication `[PLANNED]`
- `POST /api/auth/otp/request` — request a mobile OTP code
- `POST /api/auth/otp/verify` — verify OTP and mark `isPhoneVerified`
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password`
- `POST /api/auth/logout` (token invalidation strategy TBD — likely short-lived access
  token + refresh token pair once hardened)
- Rate limiting on all of the above.

---

## 2. Profile — `[PLANNED]`

Base path: `/api/profile`

- `GET /api/profile/me` — auth required — returns the caller's full profile (including
  fields hidden from other users, e.g. exact preferences).
- `PUT /api/profile/me` — auth required — create/update profile fields (name, dob,
  gender, dating intention, bio, city/district, profession, education, interests,
  prompts).
- `GET /api/profile/:userId` — auth required — returns another user's public profile
  view (sensitive fields stripped per `docs/DATABASE_SCHEMA.md`).
- `POST /api/profile/photos` — auth required — upload a photo (multipart -> Cloudinary),
  returns photo record.
- `DELETE /api/profile/photos/:photoId` — auth required, must own the photo.
- `PUT /api/profile/preferences` — auth required — update discovery preferences.
- All responses wrap the resource as `{ "profile": { ... } }` or `{ "photo": { ... } }`;
  errors follow the standard error format above.

## 3. Discovery — `[PLANNED]`

Base path: `/api/discovery`

- `GET /api/discovery/feed?page=&limit=&datingIntention=&maxDistanceKm=` — auth
  required — returns a paginated list of candidate profiles filtered by the caller's
  preferences, excluding already-liked/passed/blocked users.
  - Response: `{ "profiles": [ ... ], "page": 1, "hasMore": true }`

## 4. Matching — `[PLANNED]`

Base path: `/api/likes`, `/api/matches`

- `POST /api/likes` — auth required — body `{ "toUserId", "type": "LIKE"|"SUPER_LIKE"|"PASS" }`
  — creates a like/pass; if it completes a mutual `LIKE`, also creates a `match` and
  returns it.
  - Response: `{ "like": { ... }, "match": { ... } | null }`
- `GET /api/matches` — auth required — list the caller's active matches.
- `GET /api/likes/received` — auth required, premium-gated ("see who liked you") —
  list users who liked the caller.
- `DELETE /api/matches/:matchId` — auth required, must be a participant — unmatch.

## 5. Messaging — `[PLANNED]`

Base path: `/api/conversations`, plus Socket.IO events.

- `GET /api/conversations` — auth required — list the caller's conversations, most
  recent first.
- `GET /api/conversations/:id/messages?before=&limit=` — auth required, must be a
  participant — paginated message history.
- `POST /api/conversations/:id/messages` — auth required, must be a participant — send
  a message (also emitted in real time via Socket.IO).
- **Socket.IO events (planned):** `message:send`, `message:new`, `message:read`,
  `typing:start`, `typing:stop`, `match:new`, `notification:new`. Socket auth uses the
  same JWT, passed at handshake.

## 6. Verification — `[PLANNED]`

Base path: `/api/verification`

- `POST /api/verification/otp/request` / `POST /api/verification/otp/verify` — mobile OTP.
- `POST /api/verification/selfie` — auth required — upload a selfie for manual/human
  review; creates a `PENDING` `verifications` record.
- `GET /api/verification/status` — auth required — caller's current verification status.

## 7. Safety (Report / Block) — `[PLANNED]`

Base path: `/api/reports`, `/api/blocks`

- `POST /api/reports` — auth required — body `{ "reportedUserId", "reason", "details" }`.
- `POST /api/blocks` — auth required — body `{ "blockedUserId" }`; blocked users are
  excluded from discovery/messaging both ways.
- `DELETE /api/blocks/:blockedUserId` — auth required — unblock.
- `GET /api/blocks` — auth required — list users the caller has blocked.

## 8. Notifications — `[PLANNED]`

Base path: `/api/notifications`

- `GET /api/notifications?page=&limit=` — auth required — paginated notifications for the caller.
- `PUT /api/notifications/:id/read` — auth required — mark one as read.
- `PUT /api/notifications/read-all` — auth required.

## 9. Payments / Subscription — `[PLANNED]`

Base path: `/api/subscriptions`, `/api/payments`

- `GET /api/subscriptions/plans` — public — list active plans and admin-configured pricing.
- `POST /api/subscriptions/checkout` — auth required — creates a Razorpay order for a
  chosen plan (may be MOCK/TEMPORARY initially, clearly labeled — see `MOCK_FEATURES.md`).
- `POST /api/payments/webhook` — Razorpay webhook (verified via signature, not user auth)
  — the only path allowed to grant/update subscription entitlement.
- `GET /api/subscriptions/me` — auth required — caller's current plan/entitlement.

## 10. Events — `[PLANNED]` (V3 — CG Connect)

Base path: `/api/events`

- `GET /api/events?city=&district=` — auth required — nearby/local events.
- `POST /api/events` — admin/organizer role required — create an event.
- `POST /api/events/:id/rsvp` — auth required.

## 11. Admin — `[PLANNED]`

Base path: `/api/admin` — every route requires auth **and** an appropriate role
(`SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT`, or `ANALYST` depending on the action).

- `GET /api/admin/reports?status=` — role: `MODERATOR`+ — reports queue.
- `PUT /api/admin/reports/:id` — role: `MODERATOR`+ — resolve/dismiss a report.
- `GET /api/admin/verifications?status=` — role: `MODERATOR`+ — verification review queue.
- `PUT /api/admin/verifications/:id` — role: `MODERATOR`+ — approve/reject.
- `POST /api/admin/users/:id/suspend` / `.../ban` / `.../unban` — role: `ADMIN`+.
- `GET /api/admin/audit-logs` — role: `SUPER_ADMIN` (or `ANALYST` read-only, TBD).
- Every admin mutation writes a `moderation_actions` and/or `audit_logs` entry.

## 12. Analytics — `[PLANNED]`

Base path: `/api/admin/analytics` — role: `ANALYST`+.

- `GET /api/admin/analytics/overview` — signups, active users, match-to-conversation
  rate, conversation response rate, verified-user rate, D30 retention, premium
  conversion (see `docs/BUSINESS_PLAN.md` for why these metrics over raw swipe volume).
