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

## 2. Profile — `[IMPLEMENTED]`

Base path: `/api/profile`. All routes require auth (`Authorization: Bearer <JWT>`),
including viewing another user's profile — there is no unauthenticated profile
browsing in this app.

### `GET /api/profile/me`
- Returns the caller's own full profile.
- `404` if the caller has not created a profile yet (`{ "message": "Profile not
  found. Create your profile first." }`) — the frontend treats this as "send the
  user to the profile builder".
- **Success response:** `200 OK` — `{ "profile": { ... } }`, see field list below.

### `PUT /api/profile/me`
- Creates the profile on first call, updates it (partial merge) on subsequent calls —
  this is what lets the multi-step builder save one section at a time.
- **First-time creation only:** `displayName`, `dateOfBirth`, `gender` are required
  together in that first request. All other fields, and all fields on later updates,
  are optional/partial.
- **Request body (all optional except noted above):**
  ```json
  {
    "displayName": "Anjali",
    "dateOfBirth": "1998-04-12",
    "gender": "female",
    "interestedIn": ["male"],
    "datingIntention": "serious_dating",
    "city": "Bhilai",
    "district": "Durg",
    "profession": "Software Engineer",
    "education": "B.Tech",
    "bio": "...",
    "interests": ["Cricket", "Cooking"],
    "languages": ["Hindi", "Chhattisgarhi"],
    "lifestyle": { "smoking": "no", "drinking": "socially", "diet": "vegetarian" },
    "personalityPrompts": [{ "prompt": "My love language is...", "answer": "..." }]
  }
  ```
- **Validation:**
  - `dateOfBirth` must compute to an age of 18 or older (checked against whatever
    the effective date of birth is after merging with the existing profile) — `400`
    if under 18, this is a hard safety requirement.
  - `gender` must be one of `male`, `female`, `non_binary`, `other`.
  - `interestedIn` values must be from the same set plus `everyone`.
  - `datingIntention` must be one of `long_term`, `serious_dating`, `marriage`,
    `casual`, `friendship`, `new_people` (see divergence note in
    `docs/DATABASE_SCHEMA.md`).
  - `district` is free text (any current or future Chhattisgarh district/town is
    accepted) — not a closed dropdown of major cities only.
  - `bio` max 500 chars; `interests` max 15 entries; `languages` unlimited;
    `personalityPrompts` max 5 entries, `prompt` must be from the fixed prompt bank
    (`backend/constants/profileOptions.js`), `answer` max 300 chars, no duplicate
    prompts.
- **Success response:** `200 OK` (update) or `201 Created` (first creation) —
  `{ "profile": { ... } }`.
- **Errors:** `400` — validation failure (`{ "message", "errors": [...] }` with all
  failing fields); `401` — unauthenticated; `409` — duplicate profile race; `500`.

### `GET /api/profile/:userId`
- Returns another user's **public** profile view — a smaller field set than
  `GET /me`: no `profileCompletionPercentage`/`completionHints`, no exact geo
  coordinates (only `city`/`district`), no `dateOfBirth` (only the derived `age`).
- **Errors:** `400` — `userId` is not a valid id; `404` — no profile for that user.

### `POST /api/profile/me/photos`
- Adds a photo to the caller's own profile (max 6 photos). The first photo added
  becomes `isPrimary`.
- **MOCK/TEMPORARY:** no Cloudinary integration yet — see `MOCK_FEATURES.md`. Accepts
  **either**:
  - `{ "url": "https://..." }` — a real external image URL, or an already-formed
    `data:image/...;base64,...` URI, **or**
  - `{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }` — raw base64 image
    data, which the server wraps into a `data:` URI and stores directly on the
    profile document (no file goes to disk or any object store).
- **Errors:** `400` — invalid/missing `url`/`imageBase64`, or already at the 6-photo
  cap; `404` — caller has no profile yet.
- **Success response:** `201 Created` — `{ "photo": { "id", "url", "isPrimary" },
  "profile": { ... } }`.

### Full own-profile field list (`GET/PUT /api/profile/me` response `profile`)
`id`, `userId`, `displayName`, `dateOfBirth`, `age` (derived, never stored/editable
directly), `gender`, `interestedIn`, `datingIntention`, `city`, `district`, `state`,
`profession`, `education`, `bio`, `interests`, `languages`, `lifestyle`,
`personalityPrompts`, `photos` (`[{ id, url, isPrimary }]`), `profileCompletionPercentage`
(0-100, recomputed server-side on every save), `completionHints` (array of short
strings, most-impactful first, e.g. `"Add a bio to improve your profile"`),
`createdAt`, `updatedAt`.

### Not yet implemented (moved out of this phase)
- `PUT /api/profile/preferences` and a dedicated `preferences` collection — folded
  into Task #4 (Discovery), not built in the profile phase.
- `DELETE /api/profile/me/photos/:photoId` — photo removal — not built yet, only
  add is implemented.

## 3. Discovery — `[IMPLEMENTED]`

Base path: `/api/discovery`. All routes require auth. Routes in
`backend/routes/discovery.js`.

### `GET /api/discovery/feed`
- **Query params (all optional):** `page` (default `1`), `limit` (default `10`,
  capped at `20`), `datingIntention` (must be one of the `datingIntention` enum —
  see `docs/DATABASE_SCHEMA.md`), `city` (case-insensitive exact match).
  **Divergence from the original draft:** `maxDistanceKm` is not implemented —
  `profiles.location` still isn't populated by any UI, so there's no geo data to
  filter on yet; see the `preferences` divergence note in
  `docs/DATABASE_SCHEMA.md`.
- Excludes: the caller, anyone the caller has already swiped on (like or pass —
  either decision means "don't show again"), and anyone the caller is already
  matched with. Profiles missing `displayName`/`dateOfBirth`/`gender` (i.e. not
  complete enough to be worth showing) are also excluded.
- **Not yet implemented:** blocking — `backend/routes/discovery.js` has a `TODO`
  where blocked-user exclusion will go once the Block model exists (Report/Block
  is a separate, later task; see `TODO.md`).
- **Success response:** `200 OK` —
  `{ "profiles": [ <public profile, see docs/API_DOCUMENTATION.md's Profile section> ], "page": 1, "hasMore": true }`
- **Errors:** `400` — invalid `datingIntention`; `404` — caller has no profile yet
  (`{ "message": "Create your profile before browsing discovery" }`); `401`; `500`.

### `POST /api/discovery/swipe`
- **Request body:** `{ "toUserId": "<userId>", "action": "like" | "pass" }`
- Records the swipe; if `action` is `"like"` and the other user already liked the
  caller back, also creates a `match` (see the Matching section below) — this is
  the only path a match is ever created from.
- **Validation:** `toUserId` must be a valid id and cannot be the caller's own id;
  both the caller and the target must already have a profile (18+ is already a
  hard requirement enforced at profile creation/update time — see the Profile
  section — so it's not re-checked here).
- **Repeat-swipe handling (never an ugly 500):**
  - Same `toUserId` + same `action` as an existing swipe → idempotent, `200 OK`,
    `{ "like": {...}, "alreadySwiped": true, "matchCreated": false, "match": null | {...} }`
    (returns the current match state, in case the caller retries after a match
    already happened).
  - Same `toUserId` + a *different* `action` (e.g. already liked, now trying to
    pass) → `409 Conflict`,
    `{ "message": "You already swiped 'like' on this user", "like": {...} }` — the
    original decision is preserved, never silently overwritten.
  - A concurrent duplicate request (race) is caught by the same `(fromUser,
    toUser)` unique index and also returns `409` with the winning swipe's state.
- **Success response:** `201 Created` —
  `{ "like": { "id", "fromUserId", "toUserId", "action", "createdAt" }, "matchCreated": true|false, "match": { "id", "users", "matchedAt" } | null }`
- **Errors:** `400` — invalid `toUserId`/`action`, or swiping on yourself; `404` —
  caller or target has no profile; `409` — see above; `401`; `500`.

## 4. Matching — `[IMPLEMENTED, list only — unmatch not yet built]`

Base path: `/api/matches`. Match *creation* happens as a side effect of
`POST /api/discovery/swipe` above, not a separate endpoint — see the divergence
note below. Routes in `backend/routes/matches.js`.

### `GET /api/matches`
- **Query params (optional):** `page` (default `1`), `limit` (default `20`, capped
  at `50`).
- Returns the caller's active (`unmatched: false`) matches, newest first, each
  with the other participant's basic profile info attached for a match-list card
  (`displayName`, `age`, `city`, `district`, `datingIntention`, primary `photo`
  URL).
- **Success response:** `200 OK` —
  ```json
  {
    "matches": [
      {
        "id": "...",
        "matchedAt": "...",
        "otherUser": { "userId", "displayName", "age", "city", "district", "datingIntention", "photo" }
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
- **Errors:** `401`; `500`.

### Divergence from the original draft
- No separate `POST /api/likes` endpoint — swiping (like *and* pass) is unified
  under `POST /api/discovery/swipe` (see above) instead of a `/api/likes` base
  path, since a swipe is fundamentally a discovery-flow action; match creation is
  a side effect of that one call rather than a caller needing to inspect the
  response of a separate likes endpoint.
- `GET /api/likes/received` ("who liked you") and `DELETE /api/matches/:matchId`
  (unmatch) are **not yet implemented** — out of scope for this MVP swipe/match
  pass; "who liked you" is typically a premium-gated feature anyway (see
  `docs/BUSINESS_PLAN.md`) and unmatch can follow once basic matching is proven
  end-to-end against a real database.

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
