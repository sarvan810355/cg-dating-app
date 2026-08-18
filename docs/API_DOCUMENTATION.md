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
  { "token": "<JWT>", "user": { "id": "...", "email": "...", "role": "USER", "createdAt": "..." } }
  ```
- **Errors:**
  - `400` — missing email/password
  - `401` — invalid email or password (same message for both cases, to avoid user enumeration)
  - `403` — `[IMPLEMENTED, Task #11]` correct credentials, but the account's
    `accountStatus` is `SUSPENDED` (see this doc's Admin section,
    `PATCH /api/admin/users/:userId/suspend`) — `{ "message": "Your account has been
    suspended. Contact support if you believe this is a mistake." }`. Checked **after**
    the password match (not before), so a wrong-password attempt against a suspended
    account still gets the generic `401` above — a suspended account's status is never
    leaked to someone who doesn't actually know the password.
  - `500` — unexpected server error
- **Notes:** updates `user.lastLoginAt` on success (not on a `403` suspension block).

### `GET /api/auth/me`
- **Auth:** required — `Authorization: Bearer <JWT>` header, verified by the
  `requireAuth` middleware (`backend/middleware/auth.js`)
- **Request body:** none
- **Success response:** `200 OK`
  ```json
  { "user": { "id": "...", "email": "...", "role": "USER", "createdAt": "..." } }
  ```
  `role` — `[IMPLEMENTED, Task #11]` — added so the frontend's role-gated `/admin`
  section (`frontend/src/components/AdminRoute.jsx`) can decide whether to show/allow it
  at all using the same call `frontend/src/context/AuthContext.jsx` already makes on
  every page load, with no second "am I an admin" request needed.
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
    "personalityPrompts": [{ "prompt": "My love language is...", "answer": "..." }],
    "instagramHandle": "cg_dating_user"
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
  - `instagramHandle` (post-MVP, user-requested — see `MOCK_FEATURES.md`): 1-30
    characters, letters/numbers/periods/underscores only (matches Instagram's real
    username rules), enforced both client-side and server-side
    (`backend/constants/profileOptions.js#INSTAGRAM_HANDLE_REGEX`, checked in both
    `backend/routes/profile.js` and as a schema-level validator on
    `backend/models/Profile.js`). A leading `@` is accepted and stripped before
    storage (`"@cg_user"` and `"cg_user"` both store as `"cg_user"`); the value is
    stored **as-entered otherwise** (not force-lowercased — Instagram usernames are
    case-insensitive for lookup but often displayed in the case the user set).
    Sending an empty string clears a previously-set handle. **This is a
    self-reported field, not real Instagram OAuth** — there is no ownership
    verification that the caller actually controls the handle they enter (no Meta
    Developer app is registered for this project); see `MOCK_FEATURES.md`.
- **Success response:** `200 OK` (update) or `201 Created` (first creation) —
  `{ "profile": { ... } }`.
- **Errors:** `400` — validation failure (`{ "message", "errors": [...] }` with all
  failing fields); `401` — unauthenticated; `409` — duplicate profile race; `500`.

### `GET /api/profile/:userId`
- Returns another user's **public** profile view — a smaller field set than
  `GET /me`: no `profileCompletionPercentage`/`completionHints`, no exact geo
  coordinates (only `city`/`district`), no `dateOfBirth` (only the derived `age`).
  Also includes `mobileVerified`/`photoVerified` booleans (Task #9 —
  Verification, see Section 6 below) — never the raw phone number or
  submitted selfie. Also includes `instagramHandle` (or `null`) — not treated as
  private/sensitive, it's meant to be shared, same trust level as `bio`; see the
  `instagramHandle` note under `PUT /api/profile/me` above.
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
`personalityPrompts`, `instagramHandle` (string or `null`; see the validation note
under `PUT /api/profile/me` above — post-MVP, self-reported, not OAuth-verified),
`photos` (`[{ id, url, isPrimary }]`), `profileCompletionPercentage`
(0-100, recomputed server-side on every save; a filled `instagramHandle` contributes
a small bonus, see `backend/utils/profileUtils.js#COMPLETION_WEIGHTS` — it is never
required to reach 100%), `completionHints` (array of short strings, most-impactful
first, e.g. `"Add a bio to improve your profile"`), `createdAt`, `updatedAt`.

`instagramHandle` is also included in the smaller public field set returned by
`GET /api/profile/:userId` and in discovery feed cards (`GET /api/discovery/feed`,
which reuses the same public-profile serializer) — see
`backend/utils/profileSerializers.js`. It is **not** included in the deliberately
minimal match-list card (`GET /api/matches`), which also omits `bio` for the same
"condensed card" reason.

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
  either decision means "don't show again"), anyone the caller is already
  matched with, — `[IMPLEMENTED]`, Task #10, see this doc's Safety section
  below — anyone involved in a block with the caller in **either** direction
  (someone the caller has blocked, or someone who has blocked the caller), and
  — `[IMPLEMENTED]`, Task #11, see this doc's Admin section — anyone with
  `accountStatus: 'SUSPENDED'`, in both directions (mostly defense-in-depth,
  since a suspended user is also blocked at login — see
  `POST /api/auth/login` above — so this mainly matters for a still-valid,
  not-yet-expired token from before the suspension took effect).
  Profiles missing `displayName`/`dateOfBirth`/`gender` (i.e. not complete
  enough to be worth showing) are also excluded.
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
- **Free-tier daily like limit (Task #12 — Subscription scaffolding):** a
  *new* `"like"` swipe (not `"pass"`, and not an idempotent repeat of an
  already-recorded swipe — see above) is checked against the caller's
  free-tier daily like quota **before** being recorded — see §9's
  "Server-side entitlement enforcement" for the full explanation and the
  exact limit. Over the limit → `429 Too Many Requests`,
  `{ "message": "...", "upgradeRequired": true, "dailyLikeLimit": 20 }` — the
  swipe is **not** persisted, so the caller can retry once their quota
  resets (or after upgrading) without having "used up" the attempt. Bypassed
  entirely for a caller with the `unlimited_likes` plan feature.
- **Success response:** `201 Created` —
  `{ "like": { "id", "fromUserId", "toUserId", "action", "createdAt" }, "matchCreated": true|false, "match": { "id", "users", "matchedAt" } | null }`
- **Errors:** `400` — invalid `toUserId`/`action`, or swiping on yourself; `404` —
  caller or target has no profile; `409` — see above; `429` — daily like limit
  reached, see above; `401`; `500`.

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
- `[IMPLEMENTED]`, Task #10 (see this doc's Safety section below): a match is
  also excluded from this list — for **both** participants — while either side
  has blocked the other. The underlying `Match` document isn't deleted or
  mutated (unlike unmatch); this is a query-time filter only, so unblocking
  makes the match reappear exactly as it was.
- **Success response:** `200 OK` —
  ```json
  {
    "matches": [
      {
        "id": "...",
        "matchedAt": "...",
        "otherUser": { "userId", "displayName", "age", "city", "district", "datingIntention", "photo", "mobileVerified", "photoVerified" },
        "compatibility": { "score": 87, "reasons": ["Same relationship goal: Serious dating", "You both love Travel, Cricket and Cooking", "Both in Raipur"] }
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
  `compatibility` — `[IMPLEMENTED, Task #15, V2, user-requested]` — see "Why-You-Match
  & Smart Icebreakers" below. Computed live, on every call, between the caller's own
  profile and each match partner's profile — never stored/cached on the `Match`
  document itself. `{ score: 0, reasons: [] }` if either side has no profile (shouldn't
  normally happen for an existing match, but handled without erroring either way).
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

### Why-You-Match & Smart Icebreakers — `[IMPLEMENTED, Task #15, V2, user-requested, heuristic — NOT real AI]`

Added post-MVP, 2026-08-18, by explicit user request (V2 scope brought forward — see
`docs/ROADMAP.md`'s Phase 11 and `PROJECT_STATE.md`'s newest entry). Both endpoints below
are **deterministic, server-side profile-comparison heuristics** — this project has no
`ANTHROPIC_API_KEY` configured anywhere (see `backend/.env.example`), so neither of these
ever calls the real Claude API or any other LLM. See `backend/utils/compatibilityUtils.js`
/ `backend/utils/icebreakerUtils.js`'s top comments and `MOCK_FEATURES.md` for the full
explanation, the exact weighting used, and what a real AI upgrade would need
(`docs/ARCHITECTURE.md`'s AI layer section). Both routes reuse the exact same
`loadAuthorizedMatch()` participant/unmatch/block gate as the Messaging routes below —
same auth, same 400/403/404 semantics.

#### `GET /api/matches/:matchId/compatibility`
- **Auth:** required, caller must be a participant of an active (not-unmatched,
  not-blocked) match.
- "Why You Match": recomputes the same `compatibility` object already embedded in each
  row of `GET /api/matches` above, exposed as its own endpoint so a screen that only has
  a `matchId` (e.g. Chat, or the "It's a Match!" modal right after a swipe) doesn't need
  to re-page through the matches list just to get it.
- **Success response:** `200 OK` —
  ```json
  { "matchId": "...", "compatibility": { "score": 87, "reasons": ["Same relationship goal: Serious dating", "..."] } }
  ```
  `score` is 0-100 (never claims scientific/psychological accuracy); `reasons` is 0-5
  short, plain-language strings, only ever built from genuine profile overlap — never
  fabricated to pad the list out. A pair with no real overlap gets `{ "score": 0,
  "reasons": [] }`.
- **Errors:** `400` — invalid `matchId`; `403` — not a participant, unmatched, or a block
  is in effect; `404` — no such match; `401`; `500`.

#### `GET /api/matches/:matchId/icebreakers`
- **Auth:** required, same participant gate as above.
- Smart Icebreakers: a pool of 3-6 deterministic, template-filled conversation-starter
  strings built from real overlaps between the two participants' `Profile` documents
  (shared interests, shared personality-prompt themes, same dating intention, same city,
  shared language, matching diet) — e.g. `"You both love Travel — ask them about it!"`.
  Falls back to a small set of generic-but-decent starters (never `"Hi"`/`"Hello"`) when
  there isn't enough real overlap to personalize from.
- **No `exclude` param / no server-side "regenerate":** the returned pool is already
  fully deterministic for a given pair of profiles, so the frontend's "Generate another"
  button (`frontend/src/pages/Chat.jsx`) simply cycles through the already-fetched pool
  locally rather than re-calling this endpoint — a re-call would only ever return the
  same list.
- **Success response:** `200 OK` —
  ```json
  { "matchId": "...", "icebreakers": ["You both love Travel — ask them about it!", "..."] }
  ```
- **Errors:** same as `GET .../compatibility` above.

## 5. Messaging — `[IMPLEMENTED]`

Base path: `/api/matches/:matchId/messages` (routes live in `backend/routes/
matches.js`, alongside match listing), plus Socket.IO events (`backend/
socket.js`). All routes require auth and require the caller to be one of the
two users in that match — `403` otherwise, `403` again if the match has been
unmatched, `403` again — `[IMPLEMENTED]`, Task #10, see this doc's Safety
section below — if either participant has blocked the other (regardless of
which of the two blocked the other, and regardless of which of the two is
making the request), `404` if `matchId` doesn't resolve to any match. Every
text message must go through `POST` below — nothing is ever written directly
by a socket event; see the "REST is the single write path" note under
Socket.IO events below.

**Divergence from the original draft:** no `/api/conversations` base path —
a `Match` already uniquely identifies a two-person conversation, so
messaging is nested under `/api/matches/:matchId` instead of a separate
Conversation resource; see the `conversations` divergence note in
`docs/DATABASE_SCHEMA.md`.

### `GET /api/matches/:matchId/messages`
- **Query params (optional):** `limit` (default `30`, capped at `50`),
  `before` (a message id — fetches the page of messages strictly older than
  that message).
- **Pagination direction:** newest-first, cursor-paginated. Chosen over
  offset pagination because it's the natural fit for "show the latest
  messages, then load older ones as the user scrolls up" (infinite scroll),
  and stays correct even as new messages keep arriving while the user
  scrolls back through history (unlike a page-number offset, which would
  shift under concurrent inserts). The response's `messages` array is
  ordered newest-first; the frontend reverses it for oldest-at-top display
  (see `frontend/src/pages/Chat.jsx`).
- **Success response:** `200 OK` —
  ```json
  {
    "messages": [
      { "id", "matchId", "senderId", "recipientId", "text", "createdAt", "readAt" }
    ],
    "hasMore": true
  }
  ```
- **Errors:** `400` — invalid `matchId`/`before`; `403` — caller isn't a
  participant, or the match has been unmatched; `404` — no such match;
  `401`; `500`.

### `POST /api/matches/:matchId/messages`
- **Request body:** `{ "text": "..." }`
- **Validation:** `text` required (non-empty after trimming), max 2000
  characters. The recipient is always derived server-side from the match's
  two participants — never taken from the client — which also means you can
  never message yourself (a match's two users are, by construction,
  distinct).
- Persists the message, then broadcasts it to the match's Socket.IO room as
  `message:new` (see below) — REST persistence and real-time delivery are
  one call, not two separate write paths.
- **Success response:** `201 Created` —
  `{ "message": { "id", "matchId", "senderId", "recipientId", "text", "createdAt", "readAt": null } }`
- **Errors:** `400` — missing/empty/over-length `text`, or invalid
  `matchId`; `403` — not a participant, or unmatched; `404` — no such match;
  `401`; `500`.

### `PATCH /api/matches/:matchId/messages/read`
- Marks every message addressed *to* the caller in this match as read
  (`readAt` set to now). Idempotent — re-calling with nothing unread simply
  reports `readCount: 0`.
- Broadcasts `message:read` to the match's Socket.IO room (see below) so the
  sender's UI can flip its read-receipt checkmarks live. The write itself
  still only ever happens via this REST call, never from a socket event —
  same single-write-path principle as sending.
- **Success response:** `200 OK` — `{ "matchId", "readCount", "readAt" }`
- **Errors:** `403` — not a participant, or unmatched; `404` — no such
  match; `401`; `500`.

### Socket.IO events — `[IMPLEMENTED]`
Same Express HTTP server, mounted via `backend/socket.js`'s `initSocket()`.
**Auth:** the client passes the JWT at handshake as
`{ auth: { token: "<JWT>" } }` (a `Bearer` `Authorization` header is
accepted as a fallback for non-browser clients). The server verifies it with
the exact same `verifyToken()` the REST `requireAuth` middleware uses
(`backend/middleware/auth.js`) — one place owns JWT secret-handling for both
transports. A missing/invalid/expired token rejects the connection with a
`connect_error` before any event handler runs.

**Design note — REST is the single write path.** Every event below either
reads/authorizes (`match:join`), is purely ephemeral and never persisted
(`typing:start`/`typing:stop`), or is a server->client broadcast that
*follows* a REST write (`message:new` after `POST`, `message:read` after
`PATCH`). There is no `message:send` socket event — sending only ever goes
through the REST `POST` above, so there is exactly one code path that can
ever create a `Message` document.

- **`match:join`** (client → server) — `{ matchId }`, with an ack callback
  `(ack) => ...`. Server verifies the connected user is a participant of an
  active (not-unmatched) match with that id (via the same `isParticipant()`
  helper the REST routes use) and — `[IMPLEMENTED]`, Task #10 — that neither
  participant has blocked the other (via the same `isBlockedEitherWay()`
  helper `loadAuthorizedMatch()` uses for the REST message routes above) and,
  if both hold, joins the socket to that match's room (`match:<matchId>`);
  acks `{ ok: true }` on success or `{ ok: false, message }` otherwise. Must
  be called before any `message:new` broadcasts for that match will reach
  this socket. Note this gate only stops a *new* `match:join` — it doesn't
  forcibly evict a socket already sitting in a match's room from before the
  block took effect; that's not a gap in practice, though, since the REST
  `POST`/`PATCH` message routes 403 for both participants the instant a
  block exists, so no new `message:new`/`message:read` broadcast can ever be
  triggered for that room again regardless of who's still joined to it.
- **`match:leave`** (client → server) — `{ matchId }`. Leaves the room; no ack.
- **`message:new`** (server → room) — emitted after a successful
  `POST /api/matches/:matchId/messages`, to every socket joined to that
  match's room (including the sender's own, if joined) — payload is the same
  shape as the REST response's `message` object.
- **`typing:start`** / **`typing:stop`** (client → server) — `{ matchId }`.
  Ephemeral, never persisted. Server re-broadcasts to the room (excluding
  the sender) as **`typing`** (server → room) —
  `{ matchId, userId, isTyping: true | false }`.
- **`message:read`** (server → room) — emitted after a successful
  `PATCH .../messages/read` that actually changed at least one message —
  `{ matchId, readBy, readAt }`.

## 6. Verification — `[IMPLEMENTED, MOCK SMS delivery + manual photo review]`

Base path: `/api/verification`. Routes in `backend/routes/verification.js`.
All routes require auth. Two independent verification levels, each its own
status: `NOT_VERIFIED` (default), `PENDING`, `VERIFIED`, `REJECTED`,
`EXPIRED` (see `docs/DATABASE_SCHEMA.md`'s `verifications` section for the
full field list and the divergence from the original draft's endpoint
paths/collection shape).

**MOCK/TEMPORARY note (SMS):** there is no real SMS provider (Twilio/MSG91/
etc) configured — see `MOCK_FEATURES.md`. OTP generation, hashing, expiry,
and verification are all real; only the *delivery* is mocked (logged to the
server console, and echoed back in the response body ONLY when
`NODE_ENV !== 'production'` — never in production).

**MOCK/TEMPORARY note (photo storage):** selfie submission reuses the exact
same non-Cloudinary storage pattern as profile photos
(`backend/utils/mockImageUpload.js`, shared with
`backend/routes/profile.js`'s `POST /me/photos`) — see `MOCK_FEATURES.md`.

**Manual review, not automated:** there is no automated face-match against
profile photos. `POST /api/verification/photo/submit` only gets the record
to `PENDING` for a human reviewer — nothing in this pass ever transitions a
`photoVerification.status` to `VERIFIED`/`REJECTED`; that will be the future
Admin panel's verification review queue (`docs/ROADMAP.md`'s Phase 9,
`docs/API_DOCUMENTATION.md`'s `GET`/`PUT /api/admin/verifications*` in the
Admin section below).

### `POST /api/verification/mobile/request-otp`
- **Request body (optional):** `{ "phone": "+91XXXXXXXXXX" }` — required
  only if the caller has no phone on file yet, or is verifying a *different*
  number than the one currently on file (10-15 digits, optional leading
  `+`). If omitted, reuses the caller's existing `users.phone`.
- Generates a 6-digit OTP, hashes it (bcrypt, same cost factor as password
  hashing) and stores the hash + a 10-minute expiry on the user — the
  plaintext OTP is never persisted. Sets `mobileVerification.status` to
  `PENDING`.
- **Rate limiting:** at most 3 requests per rolling 10-minute window per
  user (sliding window over `mobileVerification.otpRequestTimestamps`) —
  `429` once exceeded.
- **MOCK SMS delivery:** the OTP is logged server-side
  (`[MOCK SMS] OTP for user <id> (<masked phone>): <otp>`) standing in for
  an actual SMS send.
- **Success response:** `200 OK` —
  ```json
  { "message": "OTP sent", "phone": "*********3210", "expiresInSeconds": 600 }
  ```
  When `NODE_ENV !== 'production'` (dev/test only), an additional
  **`devOtp`** field with the plaintext OTP is included — this is the ONLY
  place a plaintext OTP is ever returned to a client, and it is never
  present when `NODE_ENV === 'production'`.
- **Errors:** `400` — invalid/missing phone, or already `VERIFIED` for the
  same number; `429` — rate limited; `401`; `500`.

### `POST /api/verification/mobile/verify-otp`
- **Request body:** `{ "otp": "123456" }`
- Compares the submitted OTP against the stored hash; on success sets
  `mobileVerification.status` to `VERIFIED` and `verifiedAt` to now, and
  invalidates the OTP (cannot be replayed). An expired OTP flips the status
  to `EXPIRED` as a side effect of the failed verify attempt (the caller
  must call `request-otp` again).
- **Success response:** `200 OK` — same shape as `GET /status` below.
- **Errors:** `400` — missing `otp`, no active OTP request found, incorrect
  OTP, or the OTP has expired; `401`; `500`.

### `POST /api/verification/photo/submit`
- **Request body:** same MOCK/TEMPORARY shape as
  `POST /api/profile/me/photos` — either `{ "url": "https://..." }` (or an
  already-formed `data:image/...;base64,...` URI), or
  `{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }`.
- Sets `photoVerification.status` to `PENDING` and stores the submitted
  photo (owner-visible only, see the field-level note in
  `docs/DATABASE_SCHEMA.md`). Resubmitting after `REJECTED`/`EXPIRED`/
  `NOT_VERIFIED` clears any prior review outcome.
- **Success response:** `201 Created` — same shape as `GET /status` below.
- **Errors:** `400` — invalid/missing `url`/`imageBase64`; `409` — a
  submission is already `PENDING` review (no duplicate spam); `401`; `500`.

### `GET /api/verification/status`
- Returns the caller's current state for both verification levels.
- **Success response:** `200 OK` —
  ```json
  {
    "mobileVerification": { "status": "VERIFIED", "verifiedAt": "...", "phone": "*********3210" },
    "photoVerification": { "status": "PENDING", "verifiedAt": null, "submittedPhotoUrl": "...", "submittedAt": "..." }
  }
  ```
  Never includes `otpHash`/`otpExpiresAt`/`otpRequestTimestamps` or
  `reviewNotes`/`reviewedBy`/`reviewedAt` — built from an explicit
  whitelist, see `backend/utils/verificationUtils.js#toOwnVerificationStatusJSON()`.
- **Errors:** `401`; `500`.

### Verification badges on profiles
`GET /api/profile/:userId` (public profile view), `GET /api/discovery/feed`
(candidate cards), and `GET /api/matches` (`otherUser`) all now include two
booleans derived from the *other* user's verification state:
`mobileVerified`, `photoVerified` — never the raw phone number or submitted
selfie (see `backend/utils/verificationUtils.js#toPublicVerificationBadges()`).
`GET /api/profile/me` does **not** include these — the caller's own badges
come from `GET /api/verification/status` instead, so verification data isn't
duplicated across two response shapes.

## 7. Safety (Report / Block) — `[IMPLEMENTED]`

Base path: `/api/reports`, `/api/blocks` (routes in `backend/routes/reports.js`
and `backend/routes/blocks.js`; models in `backend/models/Report.js` and
`backend/models/Block.js`; shared enums/config in
`backend/constants/safetyOptions.js`; the shared "who does this affect"
helpers in `backend/utils/blockUtils.js`). Frontend: `frontend/src/
components/SafetyMenu.jsx` (the Report/Block entry point, reused from a
profile card in Discovery and from the Chat header) + `frontend/src/
components/ReportModal.jsx`, `frontend/src/pages/BlockedUsers.jsx` (manage
blocked users, reachable from Settings), `frontend/src/pages/
SafetyCenter.jsx` (static safety/scam-awareness content, reachable from
Settings).

### `POST /api/reports`
- **Request body:** `{ "reportedUserId": "...", "reason": "...", "details"?: "...", "evidence"?: ["..."] }`
- **`reason`** must be one of: `fake_profile`, `harassment`, `spam`, `scam`,
  `inappropriate_content`, `hate_abuse`, `threats`, `impersonation`, `other`
  (`backend/constants/safetyOptions.js#REPORT_REASONS`) — a 400 otherwise.
- **`details`** optional free text, trimmed, capped at 1000 characters.
- **`evidence`** optional array of strings (a photo/message-reference URL, or
  a short free-text reference) — capped at 10 entries, 2000 characters each.
  **MOCK/TEMPORARY:** no file-upload path exists for evidence in this pass —
  see `MOCK_FEATURES.md`.
- The reporter is always the authenticated caller, never taken from the
  client. A report is created `PENDING` and reviewed later by the future
  Admin moderation queue (Task #11 — see this doc's Admin section); no code
  path in this pass ever transitions a report away from `PENDING`.
- Reporting is **not itself a block** — filing a report doesn't stop the
  reported user from seeing/messaging the reporter; block that user
  separately (via `POST /api/blocks` below) if that's also wanted, which is
  exactly what the frontend's Report/Block menu offers as two separate
  actions.
- **Success response:** `201 Created` —
  `{ "report": { "id", "reportedUserId", "reason", "details", "evidence", "status": "PENDING", "createdAt" } }`
- **Errors:** `400` — invalid/missing `reportedUserId`, invalid `reason`,
  reporting yourself, `details`/`evidence` over length/count limits; `404` —
  `reportedUserId` doesn't resolve to a real user; `401`; `500`.
- **Not implemented:** there is no `GET /api/reports` ("my reports") list in
  this pass — no screen was asked for one; a report's only client-visible
  moment is the direct response to this `POST`. The future Admin panel's
  `GET /api/admin/reports` (Task #11, see this doc's Admin section) is a
  separate, role-gated endpoint.

### `POST /api/blocks`
- **Request body:** `{ "blockedUserId": "..." }`
- Blocking is **one-directional to create** (only the caller decided this —
  if the blocked user also wants to block back, they create their own
  separate `Block` document) but its **effects are enforced bidirectionally**
  at query time, wherever it matters — see "Effects of a block" below.
- **Idempotent:** blocking someone you already blocked returns `200 OK` with
  the existing block (not an error) rather than a duplicate document — the
  `(blocker, blocked)` pair has a unique index.
- Blocking is **silent** — the blocked user is never notified in any way (no
  `Notification` document is ever created for a block); per the product
  spec, only the blocker's own view changes.
- **Success response:** `201 Created` (or `200 OK` if already blocked) —
  `{ "block": { "id", "blockedUserId", "createdAt" } }`
- **Errors:** `400` — invalid/missing `blockedUserId`, blocking yourself;
  `404` — `blockedUserId` doesn't resolve to a real user; `401`; `500`.

### `DELETE /api/blocks/:userId`
- Unblocks. Deletes the `Block` document outright (there's no soft-delete /
  block-history concept — see `backend/models/Block.js`) — this restores
  full mutual visibility (discovery, matches list, messaging) immediately.
- **Success response:** `200 OK` — `{ "unblocked": true, "userId": "..." }`
- **Errors:** `400` — invalid `userId`; `404` — the caller isn't currently
  blocking that user; `401`; `500`.

### `GET /api/blocks`
- Lists the caller's own blocked-users, newest first — for the "manage
  blocked users" screen (`frontend/src/pages/BlockedUsers.jsx`). Not
  paginated in this pass (a user's own block list is expected to stay
  small).
- **Success response:** `200 OK` —
  `{ "blocks": [ { "blockedUserId", "displayName", "photo", "createdAt" } ] }`
  (`displayName`/`photo` come from the blocked user's `Profile`, and are
  `null` if they have none.)
- **Errors:** `401`; `500`.

### Effects of a block — bidirectional exclusion
Once a `Block` exists between two users (in either direction), it is
enforced identically everywhere via the shared
`backend/utils/blockUtils.js#getBlockedUserIds()` /
`#isBlockedEitherWay()` helpers:
- **Discovery feed** (`GET /api/discovery/feed`) — neither user appears in
  the other's candidate feed.
- **Matches list** (`GET /api/matches`) — a match between the two is hidden
  from **both** their lists (the underlying `Match` document itself is
  untouched — unblocking makes it reappear exactly as it was; this is
  different from unmatch, which is a separate, permanent action not yet
  implemented — see this doc's Matching section).
- **Messaging** (`GET`/`POST /api/matches/:matchId/messages`,
  `PATCH .../messages/read`) — `403` for both participants on that match,
  even though the underlying `Match` still exists (defense-in-depth for
  anyone who already has the `matchId`, e.g. a still-open chat tab).
- **Socket.IO `match:join`** — acks `{ ok: false }` for that match, so a
  blocked conversation can't be (re)joined for live delivery either — see
  this doc's Socket.IO events section.
- Everything above is **query-time filtering only** — no other collection is
  mutated when a block is created or removed, so unblocking cleanly restores
  the prior state (the match reappears, messaging works again) with no data
  to "undo".

## 8. Notifications — `[IMPLEMENTED, in-app only — FCM push is MOCK/TEMPORARY-deferred]`

Base path: `/api/notifications`, plus one Socket.IO event
(`backend/socket.js`). Routes in `backend/routes/notifications.js`. All
routes require auth; a notification is only ever visible to/actionable by
its own `recipient` — no route accepts another user's notification id (a
mismatched id is a `404`, not a `403`, so callers can't probe for the
existence of other users' notifications).

**Divergence from the original draft:** `PUT /api/notifications/:id/read`
and `PUT /api/notifications/read-all` are implemented as `PATCH`, not `PUT`
(a mark-read is a partial state transition, not a full resource
replacement) — matches this codebase's existing convention
(`PATCH /api/matches/:matchId/messages/read`). Two additional routes beyond
the original draft were added: `GET /api/notifications/unread-count` (a
cheap badge-count endpoint so the frontend doesn't have to paginate the
full list just to show a number) and `GET`/`PUT
/api/notifications/preferences` (per-type opt-out toggles — see
`docs/DATABASE_SCHEMA.md`'s `notification_preferences` section).

**MOCK/TEMPORARY note:** real push notifications (Firebase Cloud Messaging,
so a device gets notified even when the app isn't open) are **not
implemented at all** in this pass — no FCM credentials configured yet, see
`MOCK_FEATURES.md`. Everything below (the REST API, the DB-backed
notification center, and the live Socket.IO event) is a real, non-mocked
in-app-only implementation.

### `GET /api/notifications`
- **Query params (optional):** `page` (default `1`), `limit` (default `20`,
  capped at `50`).
- Returns the caller's notifications, newest first.
- **Success response:** `200 OK` —
  ```json
  {
    "notifications": [
      {
        "id": "...",
        "type": "match" | "like" | "message" | "verification" | "safety" | "subscription",
        "payload": { "matchId": "...", "fromUserId": "...", "fromUserName": "..." },
        "read": false,
        "createdAt": "..."
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
  `payload` shape varies by `type` — see `docs/DATABASE_SCHEMA.md`'s
  `notifications` section for the full breakdown per type. Notably, `like`
  notifications always have `payload: {}` — no identifying fields, since
  "see who liked you" is a premium-gated reveal (see
  `docs/BUSINESS_PLAN.md`); the frontend renders a generic "Someone liked
  your profile" message from `type` alone.
- **Errors:** `401`; `500`.

### `GET /api/notifications/unread-count`
- **Success response:** `200 OK` — `{ "unreadCount": 3 }`.
- **Errors:** `401`; `500`.

### `PATCH /api/notifications/:id/read`
- Marks one notification as read. Idempotent — re-calling an already-read
  notification just returns its current state.
- **Success response:** `200 OK` — `{ "notification": { "id", "type", "payload", "read": true, "createdAt" } }`.
- **Errors:** `400` — invalid `id`; `404` — no such notification for this
  caller (including one that belongs to someone else); `401`; `500`.

### `PATCH /api/notifications/read-all`
- Marks every unread notification for the caller as read. Idempotent —
  re-calling with nothing unread reports `updatedCount: 0`.
- **Success response:** `200 OK` — `{ "updatedCount": 2 }`.
- **Errors:** `401`; `500`.

### `GET /api/notifications/preferences`
- Returns the caller's current per-type notification toggles, defaulting
  every field to `true` (opt-out, not opt-in) if the caller's account
  predates this field or has never customized it.
- **Success response:** `200 OK` —
  ```json
  { "preferences": { "matchNotifications": true, "likeNotifications": true, "messageNotifications": true } }
  ```
- **Errors:** `401`; `500`.

### `PUT /api/notifications/preferences`
- **Request body (all optional, partial update):**
  ```json
  { "matchNotifications": true, "likeNotifications": false, "messageNotifications": true }
  ```
- **Validation:** any provided field must be a boolean; unknown fields are
  silently ignored. There is deliberately no field here to disable
  `verification`/`safety`/`subscription` notifications — they aren't
  user-toggleable at all (safety/account-critical notifications must always
  be delivered); see `docs/DATABASE_SCHEMA.md`.
- **Effect:** a disabled type is enforced at notification-creation time —
  the triggering action (swipe, message) still succeeds normally, it just
  silently skips creating that `Notification` document (no error surfaced).
- **Success response:** `200 OK` — same shape as the `GET` above, reflecting
  the merged result.
- **Errors:** `400` — a provided field isn't a boolean (`{ "message":
  "Invalid preferences", "errors": [...] }`); `401`; `500`.

### When notifications are created — trigger points
No dedicated "create notification" endpoint exists for clients — every
`Notification` is created server-side as a side effect of an existing
action, via the shared `backend/utils/notificationUtils.js#createNotification()`
helper (which also handles the preference check and the live socket emit
below):
- **`match`** — `POST /api/discovery/swipe` (`backend/routes/discovery.js`),
  when a swipe completes a mutual like. **Both** participants are notified,
  each learning the *other* person's identity (`fromUserId`/`fromUserName`
  in their own notification's payload).
- **`like`** — same route, when a `like` swipe does **not** yet complete a
  mutual match. Only the recipient is notified, with an empty `payload`
  (see the MOCK/TEMPORARY note above re: premium-gated reveal).
- **`message`** — `POST /api/matches/:matchId/messages`
  (`backend/routes/matches.js`), after the message is persisted and
  broadcast via `message:new`. **Skipped** if the recipient currently has an
  active socket joined to that match's room (i.e. they have the chat open
  right now) — determined via `backend/socket.js#isUserInRoom()`, so an
  already-visible live message doesn't also produce redundant notification
  noise.
- Notification creation is wrapped in its own `try`/`catch` at both trigger
  points, isolated from the main request's success path — a notification
  failure never turns an otherwise-successful swipe or message send into a
  `500`.

### Socket.IO event — `notification:new`
Reuses the same Socket.IO server as Chat (`backend/socket.js`'s
`initSocket()`), same JWT handshake auth. Every connected socket
additionally auto-joins a personal room, `user:<userId>` (distinct from the
per-match `match:<matchId>` rooms Chat uses), immediately on connect — no
separate `join`-style event needed for notifications, unlike `match:join`
for chat.
- **`notification:new`** (server → the recipient's personal room) — emitted
  whenever `createNotification()` creates a document, to
  `user:<recipientId>`. Payload is the same shape as one entry in
  `GET /api/notifications`'s `notifications` array
  (`{ id, type, payload, read: false, createdAt }`). Emitting to a room with
  no connected sockets is a no-op, so this naturally only reaches the
  recipient if they currently have an active connection — no separate
  online/presence check needed. The frontend uses this to bump the
  notification bell's badge count live (see
  `frontend/src/context/NotificationContext.jsx`) without polling.

## 9. Payments / Subscription — `[IMPLEMENTED, with a prominent MOCK-checkout caveat below]`

Task #12 in the internal TaskList — Subscription scaffolding. Implemented in
`backend/models/Plan.js`/`Subscription.js`, `backend/routes/subscription.js`,
`backend/utils/entitlementUtils.js`.

**Base path divergence from the original `[PLANNED]` draft:** the plural
`/api/subscriptions` + `/api/payments` base paths were never built. Instead:
`GET /api/plans` (singular, no `/subscriptions` prefix — this is the public
paywall listing, not a subscription-scoped resource) and
`/api/subscription/*` (singular) for the caller's own subscription actions.
Both are served by the same router, `backend/routes/subscription.js`,
mounted at the bare `/api` root in `backend/server.js`. There is no
`/api/payments/webhook` at all — see the MOCK CHECKOUT warning below.

- `GET /api/plans` — **public, no auth** — list active plans
  (`{ plans: [{ id, code, name, priceInPaise, billingPeriod, features,
  isActive }] }`), cheapest first. This is what a paywall screen shows
  before the user commits to anything. Plan pricing/features are
  admin-editable in the database (see `docs/DATABASE_SCHEMA.md`'s `plans`
  section) — never hardcoded in route/frontend code, per
  `docs/BUSINESS_PLAN.md`.
- `GET /api/subscription/me` — auth required — the caller's current
  effective subscription: `{ subscription: {...} | null }`. `null` means
  free tier. Always re-derived from the database on every call (never
  cached on the JWT) — see `backend/utils/entitlementUtils.js#getEffectiveSubscription()`.
  An `ACTIVE` subscription and a `CANCELLED`-but-not-yet-`expiresAt`
  subscription are both returned here (not just `ACTIVE`) — cancelling
  doesn't erase the row until it actually expires.
- `POST /api/subscription/subscribe` — auth required — body
  `{ "planCode": "CG_PLUS" | "CG_PRO" | "CG_ELITE" }`. Creates a new
  `ACTIVE` `Subscription` with `expiresAt = now + billingPeriod`. Returns
  `201 { message, subscription }`.

  > ## ⚠️ MOCK / TEMPORARY — NOT REAL PAYMENT PROCESSING
  > There is **no real Razorpay integration** behind this endpoint — no
  > credentials are configured for this project at all (see
  > `MOCK_FEATURES.md`). Calling this endpoint while authenticated
  > **immediately activates the plan for free** — there is no Razorpay
  > order created, no checkout redirect, no payment actually collected, and
  > no webhook verification of any kind. A real integration would instead:
  > (1) create a Razorpay order for the plan's price and return it to the
  > client to open Razorpay Checkout, (2) the user completes payment,
  > (3) Razorpay calls a **signature-verified webhook**
  > (`POST /api/payments/webhook`, not built in this pass), and only then
  > would a subscription be marked `ACTIVE`. `paymentProvider`
  > (`'mock_razorpay'`) and `paymentReference` (a fake generated string) are
  > still recorded on the created `Subscription` document so mock-path rows
  > stay traceable in the database. **This must not ship to production
  > as-is.**
- `POST /api/subscription/cancel` — auth required, no body — sets the
  caller's current `ACTIVE` subscription to `CANCELLED`. Standard SaaS
  behavior: stops future renewal, does **not** immediately revoke access —
  the subscription (and `hasFeature()`, see below) both stay valid until
  its already-active `expiresAt`. Idempotent: cancelling an
  already-cancelled-but-still-valid subscription returns its current state
  (`200`) rather than erroring; `404` only if there's nothing to cancel at
  all (genuinely free-tier, or already fully expired).

### Server-side entitlement enforcement

`backend/utils/entitlementUtils.js#hasFeature(userId, featureName)` is the
**only** sanctioned way anywhere in this codebase to check whether a user
has a premium feature — it always re-queries the database for the caller's
current effective `Subscription` -> `Plan.features`. **No code path ever
trusts a client-submitted "isPremium" flag, a JWT claim, or a request body
field for entitlement** — see `docs/BUSINESS_PLAN.md`'s "entitlement is
always validated server-side" requirement.

As a concrete demonstration (no other "premium feature" has a gated code
path yet in this codebase), `hasFeature()` is applied to the discovery
feed's daily **like** limit:

- `POST /api/discovery/swipe` (see the Discovery section above) now enforces a **free-tier limit of
  20 likes per UTC calendar day** (passes are free/unlimited) — the exact
  number is documented in `docs/BUSINESS_PLAN.md`. A caller with the
  `unlimited_likes` feature (currently only `CG_PLUS`/`CG_PRO`/`CG_ELITE`,
  see `docs/DATABASE_SCHEMA.md`'s `plans` seed data) bypasses the limit
  entirely. Hitting the limit on a *new* like (idempotent repeats of an
  already-recorded swipe are unaffected, and the swipe is never persisted
  when blocked) returns:
  ```json
  // 429 Too Many Requests
  {
    "message": "You've reached today's free like limit (20/day). Upgrade to CG_PLUS for unlimited likes.",
    "upgradeRequired": true,
    "dailyLikeLimit": 20
  }
  ```
  The frontend (`frontend/src/pages/Discovery.jsx`) checks for
  `upgradeRequired: true` on a `429` and shows a friendly "upgrade to
  CG_PLUS" prompt linking to `/subscription`, instead of a raw error.

## 10. Events — `[PLANNED]` (V3 — CG Connect)

Base path: `/api/events`

- `GET /api/events?city=&district=` — auth required — nearby/local events.
- `POST /api/events` — admin/organizer role required — create an event.
- `POST /api/events/:id/rsvp` — auth required.

## 11. Admin — `[IMPLEMENTED, basic]`

Base path: `/api/admin` (routes in `backend/routes/admin.js`; role middleware in
`backend/middleware/adminAuth.js`; audit-log helper in
`backend/utils/auditUtils.js`; models: `backend/models/AuditLog.js`, plus the
`role`/`accountStatus` fields on `backend/models/User.js`). Every route requires auth
(`requireAuth`) **and** an appropriate role (`requireRole(...)`, checked fresh from the
database on every request — a role change or suspension takes effect on the caller's
very next request, not only after their token expires).

**Divergence from the original draft:** the role enum is `USER`/`SUPER_ADMIN`/`ADMIN`/
`MODERATOR` only (no `SUPPORT`/`ANALYST` — see `docs/DATABASE_SCHEMA.md`'s divergence
note); there is no `GET /api/admin/audit-logs` route yet (audit entries are written on
every mutation below, but nothing reads them back via the API in this pass — a future
"recent admin activity" view can add one without a schema change, since
`backend/models/AuditLog.js` already has a `createdAt` index for exactly that access
pattern); `PUT /api/admin/verifications/:id` (by report/verification id) became
`PATCH /api/admin/verifications/photo/:userId` (by target user id, and `PATCH` — a
partial state transition, not a full resource replacement, matching this codebase's
existing `PATCH .../messages/read` /
`PATCH /api/notifications/:id/read` convention); `POST /api/admin/users/:id/suspend` /
`.../ban` / `.../unban` became `PATCH /api/admin/users/:userId/suspend` /
`.../reinstate` only — no ban/unban in this basic pass (see `accountStatus`'s 2-value
enum divergence in `docs/DATABASE_SCHEMA.md`); a role-change route
(`PATCH /api/admin/users/:userId/role`, `SUPER_ADMIN`-only) and a basic user
search/list route (`GET /api/admin/users`) were added beyond the original draft — both
needed to make suspend/reinstate/role-change usable without already knowing a target
`userId`.

### `GET /api/admin/dashboard`
- **Role:** `MODERATOR`+ (`MODERATOR`, `ADMIN`, or `SUPER_ADMIN`).
- Simple aggregate counts for the admin dashboard's stat grid — plain `countDocuments()`
  calls, **not** a full analytics engine (that's the separate, still-`[PLANNED]` Task
  #13/Section 12 below).
- **Success response:** `200 OK` —
  ```json
  {
    "counts": {
      "totalUsers": 128,
      "mobileVerifiedUsers": 40,
      "photoVerifiedUsers": 22,
      "totalMatches": 57,
      "totalMessages": 610,
      "pendingReports": 3,
      "pendingPhotoVerifications": 5
    }
  }
  ```
  `mobileVerifiedUsers`/`photoVerifiedUsers` are reported as two separate counts (not one
  combined "verified users" figure) since a user can be verified on one level, both, or
  neither independently. `totalMatches` counts only active (`unmatched: false`) matches.
- **Errors:** `401`; `403` (caller's role isn't `MODERATOR`+); `500`.

### `GET /api/admin/reports?status=PENDING&page=&limit=`
- **Role:** `MODERATOR`+.
- The reports moderation queue — paginated (`page` default `1`, `limit` default `20`,
  capped at `50`), newest first. `status` defaults to `PENDING` (the actual queue view)
  but accepts any of `PENDING`/`REVIEWED`/`ACTION_TAKEN`/`DISMISSED` so a moderator can
  also review past decisions.
- Each report includes basic reporter/reportedUser info (`id`, `email`, `displayName` —
  batch-fetched, not N+1) alongside the report's own fields, plus `reviewNotes` (private,
  `select: false` on the schema elsewhere, explicitly re-selected here since this IS the
  admin-only view that's allowed to see it).
- **Success response:** `200 OK` —
  ```json
  {
    "reports": [
      {
        "id": "...",
        "reporter": { "id": "...", "email": "...", "displayName": "..." },
        "reportedUser": { "id": "...", "email": "...", "displayName": "..." },
        "reason": "harassment",
        "details": "...",
        "evidence": [],
        "status": "PENDING",
        "reviewNotes": null,
        "reviewedAt": null,
        "reviewedBy": null,
        "createdAt": "..."
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
- **Errors:** `400` — invalid `status`; `401`; `403`; `500`.

### `PATCH /api/admin/reports/:id`
- **Role:** `MODERATOR`+.
- **Request body:** `{ "status": "REVIEWED" | "ACTION_TAKEN" | "DISMISSED", "reviewNotes"?: "..." }`
  (`status` back to `PENDING` is rejected — `PENDING` is only ever a report's starting
  state, never something set via this route).
- Sets `reviewedAt`/`reviewedBy` from the acting admin, and — if `reviewNotes` is
  provided — the private moderation note (capped at the same
  `REPORT_DETAILS_MAX_LENGTH` as `details`). Writes an `AuditLog` entry
  (`action: 'report.reviewed'`, `targetUserId`: the reported user, `details: { reportId,
  status }`).
- **Success response:** `200 OK` — `{ "report": { ...same shape as the list above } }`.
- **Errors:** `400` — invalid `id`, invalid `status`, or `reviewNotes` too long; `401`;
  `403`; `404` — no such report; `500`.

### `GET /api/admin/verifications/photo?status=PENDING&page=&limit=`
- **Role:** `MODERATOR`+.
- The photo-verification review queue — same pagination shape as the reports queue
  above, defaulting to `status=PENDING`. **This IS an admin-only view of
  `submittedPhotoUrl`** — unlike the public profile view
  (`GET /api/profile/:userId`), which only ever surfaces the derived `photoVerified`
  boolean (see Section 6's Verification badges note), this route intentionally returns
  the raw submitted selfie so a moderator can actually review it.
- **Success response:** `200 OK` —
  ```json
  {
    "verifications": [
      {
        "userId": "...",
        "email": "...",
        "displayName": "...",
        "status": "PENDING",
        "submittedPhotoUrl": "data:image/jpeg;base64,...",
        "submittedAt": "..."
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
- **Errors:** `400` — invalid `status`; `401`; `403`; `500`.

### `PATCH /api/admin/verifications/photo/:userId`
- **Role:** `MODERATOR`+.
- **Request body:** `{ "status": "VERIFIED" | "REJECTED" }`.
- The transition Section 6's Verification docs noted nothing in this codebase ever
  performed before this task — sets `photoVerification.status`, `verifiedAt` (now, on
  approval; `null` on rejection), `reviewedAt`/`reviewedBy` from the acting admin.
  Writes an `AuditLog` entry (`action: 'verification.approved'` or
  `'verification.rejected'`, `targetUserId`: the reviewed user).
- **Success response:** `200 OK` —
  `{ "userId": "...", "photoVerification": { "status": "VERIFIED", "verifiedAt": "..." } }`
- **Errors:** `400` — invalid `userId`, or `status` isn't `VERIFIED`/`REJECTED`; `401`;
  `403`; `404` — no such user; `500`.

### `GET /api/admin/users?email=&page=&limit=`
- **Role:** `ADMIN`+ (`ADMIN` or `SUPER_ADMIN` — tighter than the `MODERATOR`+ routes
  above, since this is part of the account-management surface, same tier as
  suspend/reinstate below). **Addition beyond the original task spec's route list** —
  needed so suspend/reinstate/role-change are actually usable from the frontend without
  already knowing a target `userId`; a simple case-insensitive partial match on `email`
  (`?email=` omitted returns the full user list, newest-first, paginated).
- **Success response:** `200 OK` —
  ```json
  {
    "users": [
      {
        "id": "...",
        "email": "...",
        "displayName": "...",
        "role": "USER",
        "accountStatus": "ACTIVE",
        "mobileVerified": false,
        "photoVerified": false,
        "createdAt": "...",
        "lastLoginAt": "..."
      }
    ],
    "page": 1,
    "hasMore": false
  }
  ```
- **Errors:** `401`; `403`; `500`.

### `PATCH /api/admin/users/:userId/suspend`
- **Role:** `ADMIN`+.
- Sets `accountStatus` to `SUSPENDED`. A suspended user is blocked at their next login
  attempt (`POST /api/auth/login` — see Section 1 below) and excluded from the
  discovery feed (Section 3) for everyone; existing matches/messages/reports are
  untouched (this is an account-access gate, not a data deletion). Self-suspend is
  rejected (`400`) — an admin cannot suspend their own account through this route.
  Writes an `AuditLog` entry (`action: 'user.suspended'`).
- **Success response:** `200 OK` — `{ "userId": "...", "accountStatus": "SUSPENDED" }`
- **Errors:** `400` — invalid `userId`, or suspending your own account; `401`; `403`;
  `404` — no such user; `500`.

### `PATCH /api/admin/users/:userId/reinstate`
- **Role:** `ADMIN`+.
- Reverses a suspension (`accountStatus` back to `ACTIVE`). Writes an `AuditLog` entry
  (`action: 'user.reinstated'`).
- **Success response:** `200 OK` — `{ "userId": "...", "accountStatus": "ACTIVE" }`
- **Errors:** `400` — invalid `userId`; `401`; `403`; `404` — no such user; `500`.

### `PATCH /api/admin/users/:userId/role`
- **Role:** `SUPER_ADMIN` only — restricted tighter than every other route in this
  section. An `ADMIN`/`MODERATOR` caller is `403`'d by the role middleware before this
  handler ever runs, so **ADMIN/MODERATOR can never escalate anyone's privileges,
  including their own** — there is no in-handler self-escalation check to bypass,
  because the role gate itself is the entire enforcement.
- **Request body:** `{ "role": "USER" | "SUPER_ADMIN" | "ADMIN" | "MODERATOR" }`.
- Writes an `AuditLog` entry (`action: 'user.role_changed'`, `details: { oldRole,
  newRole }`). No special-case preventing a `SUPER_ADMIN` from changing their own role —
  that's a first-admin's own informed decision, not something this basic pass guards
  against.
- **Success response:** `200 OK` — `{ "userId": "...", "role": "MODERATOR" }`
- **Errors:** `400` — invalid `userId` or `role`; `401`; `403` (caller isn't
  `SUPER_ADMIN`); `404` — no such user; `500`.

### Becoming the first admin
There is no self-serve "become admin" flow, anywhere — that's intentional, promoting an
account to any admin role is a security-sensitive action and must be done by directly
editing the database. See `SETUP.md`/`MOCK_FEATURES.md` for the exact `mongosh`
command a real deployment needs to run once, manually, to create its first
`SUPER_ADMIN` account.

## 12. Analytics — `[PLANNED]`

Base path: `/api/admin/analytics` — role: `ANALYST`+.

- `GET /api/admin/analytics/overview` — signups, active users, match-to-conversation
  rate, conversation response rate, verified-user rate, D30 retention, premium
  conversion (see `docs/BUSINESS_PLAN.md` for why these metrics over raw swipe volume).

## 13. Referral Program ("Invite & Earn") — `[IMPLEMENTED, Task #17, V2 scope]`

Base path: `/api/referrals` (routes in `backend/routes/referrals.js`); referral-code
generation and signup-time linking live in `backend/routes/auth.js`; the shared
generation/reward helpers live in `backend/utils/referralUtils.js`; enums/constants in
`backend/constants/referralOptions.js`. See `docs/BUSINESS_PLAN.md`'s Growth Strategy
and `docs/DATABASE_SCHEMA.md`'s `referrals` section for the full design writeup
(including the divergence from the originally-`[PLANNED]` separate `referrals`
collection, and the reward-mechanism rationale).

### `POST /api/auth/signup` — extended request body

- **Request body (additive to Section 1 above):**
  ```json
  { "email": "user@example.com", "password": "at-least-8-chars", "referralCode": "AB3D9FQ" }
  ```
- `referralCode` is **optional**. If provided:
  - It's normalized (trimmed, upper-cased) and checked against the referral code
    format (7 characters, from the alphabet in
    `backend/constants/referralOptions.js#REFERRAL_CODE_ALPHABET` — uppercase
    alphanumeric excluding ambiguous `0`/`O`/`1`/`I`), then looked up against
    existing users' `referralCode`.
  - **Documented UX choice:** an invalid-format or unknown/typo'd code does **not**
    reject the signup — the account is still created normally (`201`), just without a
    referral relationship, and a warning is logged server-side
    (`backend/routes/auth.js`). This is the explicitly-preferred, more user-friendly
    option per this feature's design (real referral programs don't block account
    creation over a mistyped code) — see `docs/DATABASE_SCHEMA.md`'s `referrals`
    section for the full reasoning.
  - A valid, existing code links the new user's `referredBy` to the code owner and —
    synchronously, before the signup response is sent — grants **both** the referrer
    and the new referee a reward: **7 days of `CG_PLUS`**, each via a new
    `Subscription` document (`paymentProvider: 'referral_reward'`,
    `backend/utils/referralUtils.js#grantMutualReferralReward()`). A reward-grant
    failure (e.g. a transient error) never turns the signup response into an error —
    each side's grant is isolated in its own try/catch, and the signup itself always
    succeeds once the account is created.
  - "Can't refer yourself" is structurally impossible at signup time (the referrer
    must already have an account — and therefore an existing `referralCode` — for
    their code to resolve to anyone at all; a brand-new signup's own code doesn't
    exist yet at the moment its `referralCode` body field would be checked), so no
    separate self-referral check exists.
- No change to the success/error response shapes documented in Section 1.

### `GET /api/referrals/me`
- **Auth:** required.
- Returns the caller's own referral code, a shareable invite string (no real
  deep-link infrastructure — see `MOCK_FEATURES.md` — just a copyable code + a
  templated message), how many people have signed up using their code (computed via
  `User.countDocuments({ referredBy: callerId })`, not a denormalized counter — see
  `docs/DATABASE_SCHEMA.md`), and the caller's own most recent reward grants (the
  rewards *they* earned from referring people — not their referees' rewards).
- **Success response:** `200 OK`
  ```json
  {
    "referralCode": "AB3D9FQ",
    "shareText": "Join CG Dating with my code: AB3D9FQ",
    "referralCount": 3,
    "rewards": [
      { "id": "...", "planCode": "CG_PLUS", "planName": "CG Plus", "grantedAt": "...", "expiresAt": "..." }
    ]
  }
  ```
  `rewards` is capped at the 5 most recent (`RECENT_REWARDS_LIMIT` in
  `backend/routes/referrals.js`) — this is a summary, not a paginated history.
- **Errors:** `401`; `404` — caller's user record not found (should not happen for a
  valid token); `500`.

### Anti-abuse notes
- A user's `referredBy` can be set **at most once, ever**, enforced at the schema
  level (`immutable: true` on `backend/models/User.js`'s `referredBy` field) — not
  just app logic. There is no route anywhere in this codebase that can set or change
  `referredBy` after signup (`GET /api/referrals/me` above is the only referral route
  that exists, and it's read-only) — referral linking only ever happens inline in the
  `POST /api/auth/signup` handler, on the brand-new document, at creation time.
- Referral codes are guaranteed unique by `backend/models/User.js`'s schema-level
  `unique` index on `referralCode`, generated with retry-on-collision
  (`backend/utils/referralUtils.js#generateUniqueReferralCode()`); see
  `docs/DATABASE_SCHEMA.md` for the full generation-strategy writeup.

## 14. Safe Date mode + Date Planner — `[IMPLEMENTED, Task #18, V2 scope]`

Two independent pieces, both V2 (see `docs/ROADMAP.md`'s Phase 12 "Growth & Engagement
Features"): **Safe Date mode** (`/api/safe-dates`, routes in
`backend/routes/safeDates.js`, model in `backend/models/SafeDate.js`, read-time status
computation in `backend/utils/safeDateUtils.js`) and the **Date Planner**
(`/api/date-ideas`, a stateless suggestion generator, routes in
`backend/routes/dateIdeas.js`, curated list + filtering in
`backend/utils/datePlanUtils.js`). See `docs/DATABASE_SCHEMA.md`'s `safe_dates`/
`date_plans` sections for the full field-by-field divergence writeup, and
`MOCK_FEATURES.md`'s Safe Date entry for the "why read-time, not a real scheduler/SMS
alert" explanation reproduced in condensed form below.

### `POST /api/safe-dates`
- **Auth:** required. Creates a new plan, owned by the caller.
- **Request body:**
  ```json
  {
    "matchId": "...",
    "location": "Marine Drive area, VIP Road, Raipur",
    "plannedStartAt": "2026-08-20T15:00:00.000Z",
    "plannedEndAt": "2026-08-20T17:00:00.000Z",
    "trustedContactName": "Priya",
    "trustedContactPhone": "+91 98765 43210"
  }
  ```
- **Validation:** `location` required, trimmed, non-empty, max 200 chars — an
  **approximate public location**, never exact GPS coordinates (see the privacy note
  below). `plannedStartAt`/`plannedEndAt` required valid dates; `plannedEndAt` must be
  after `plannedStartAt`; `plannedStartAt` cannot be more than 5 minutes in the past
  (a small clock-skew allowance, not a hard "must be in the future" edge case).
  `matchId` optional — if provided, must be a valid id resolving to a real `Match` the
  caller is a participant in (`404`/`403` otherwise); this feature is meant for
  meeting a match, but the reference isn't required (e.g. a date arranged outside the
  app). `trustedContactName` optional, max 100 chars. `trustedContactPhone` optional,
  max 20 chars, loosely format-checked (digits/spaces/`+`/`-`/parens only) — **stored
  for the user's own reference only; NEVER actually used to send an SMS/call** (no SMS
  provider is configured in this project — see `MOCK_FEATURES.md`).
- **Success response:** `201 Created` — `{ "safeDate": { ...see the shared shape below } }`.
- **Errors:** `400` — validation failure (see above); `403` — `matchId` given but the
  caller isn't a participant of that match; `404` — `matchId` given but no such match;
  `401`; `500`.

### `GET /api/safe-dates`
- **Auth:** required. The caller's own plans only — **owner-only**, no route in this
  section ever returns another user's Safe Date plan.
- **Query params (optional):** `page` (default `1`), `limit` (default `20`, capped at
  `50`), `status` (filter to one exact status).
- Returns both past and upcoming plans, newest planned-start first. **Every item's
  `status`/`isOverdue`/`isReminderWindow` is (re)computed fresh on this call** — see
  the "Read-time status computation" note below; a `PLANNED` plan discovered to be
  well past due is transitioned to `MISSED_CHECKIN` and persisted right here, and a
  plan newly inside its reminder window gets its one-time in-app reminder
  `Notification` created right here too.
- **Success response:** `200 OK` —
  ```json
  {
    "safeDates": [
      {
        "id": "...", "userId": "...", "matchId": "..." ,
        "location": "Marine Drive area, VIP Road, Raipur",
        "plannedStartAt": "...", "plannedEndAt": "...",
        "trustedContactName": "Priya", "trustedContactPhone": "+91 98765 43210",
        "status": "PLANNED",
        "checkedInAt": null, "completedAt": null, "cancelledAt": null,
        "isOverdue": false, "isReminderWindow": false,
        "createdAt": "...", "updatedAt": "..."
      }
    ],
    "page": 1, "hasMore": false
  }
  ```
- **Errors:** `401`; `500`.

### `GET /api/safe-dates/:id`
- **Auth:** required, **owner-only** — same shape as one entry above. A valid id that
  belongs to a *different* user is a `404`, not a `403` (same "don't leak existence of
  another user's record" convention already used by `GET /api/notifications/:id`-style
  routes elsewhere in this codebase) — a caller genuinely cannot tell the difference
  between "doesn't exist" and "exists but isn't yours".
- Same read-time computation as the list route above applies to this single item too.
- **Errors:** `400` — invalid id; `401`; `404` — no such plan for this caller
  (including one that belongs to someone else); `500`.

### `PATCH /api/safe-dates/:id/check-in`
- **Auth:** required, owner-only. "I've arrived / I'm safe." Sets `status:
  'CHECKED_IN'` and `checkedInAt`. Allowed from `PLANNED` **or** `MISSED_CHECKIN` (a
  late check-in is still a valid "I'm safe" signal) — `400` if the plan is already
  `COMPLETED`/`CANCELLED`.
- **Success response:** `200 OK` — `{ "safeDate": { ... } }`.
- **Errors:** `400` — already terminal; `401`; `404` — not found/not owner; `500`.

### `PATCH /api/safe-dates/:id/complete`
- **Auth:** required, owner-only. The user manually confirms the date ended safely.
  Sets `status: 'COMPLETED'` and `completedAt`. Allowed from any non-terminal state
  (`PLANNED`, `CHECKED_IN`, or `MISSED_CHECKIN`) — `400` if already
  `COMPLETED`/`CANCELLED`.
- **Success response:** `200 OK` — `{ "safeDate": { ... } }`.
- **Errors:** `400` — already terminal; `401`; `404` — not found/not owner; `500`.

### `PATCH /api/safe-dates/:id/cancel`
- **Auth:** required, owner-only. Sets `status: 'CANCELLED'` and `cancelledAt`. Same
  non-terminal-state allowance/`400` behavior as `complete` above.
- **Success response:** `200 OK` — `{ "safeDate": { ... } }`.
- **Errors:** `400` — already terminal; `401`; `404` — not found/not owner; `500`.

### Read-time status computation — `isOverdue` / `MISSED_CHECKIN` / the reminder notification

> ## ⚠️ SIMPLIFICATION — read-time computation, not a real scheduler or SMS alert
> There is **no background job scheduler anywhere in this codebase** (no `node-cron`,
> no task queue) and **no real SMS/push provider configured** (same MOCK/DEV-ONLY gap
> already documented for mobile-OTP verification, see `MOCK_FEATURES.md`). Building a
> real "alert me / alert my trusted contact if I don't check in" feature would need
> both. Instead, `backend/utils/safeDateUtils.js#computeSafeDateStatus()` is a pure
> function re-evaluated **every time** `GET /api/safe-dates` or
> `GET /api/safe-dates/:id` is called:
> - `isOverdue: true` once a still-`PLANNED` plan is more than 30 minutes
>   (`CHECKIN_GRACE_MINUTES`) past `plannedStartAt` with no check-in.
> - `status` is persisted to `MISSED_CHECKIN` once a still-`PLANNED` plan is more than
>   120 minutes (`MISSED_CHECKIN_GRACE_MINUTES`) past `plannedEndAt` with no check-in —
>   the only write this computation ever performs.
> - `isReminderWindow: true`, and a one-time real in-app `Notification` (type
>   `'safety'`, via the existing `backend/utils/notificationUtils.js#createNotification()`
>   — the same helper `match`/`like`/`message` notifications use, including the live
>   `notification:new` Socket.IO emit), when `now` falls within 60 minutes
>   (`REMINDER_WINDOW_MINUTES`) before `plannedStartAt` for a still-`PLANNED` plan.
>   `reminderNotifiedAt` gates this to firing at most once per plan.
> **What this means in practice:** the reminder notification is a REAL, persisted,
> live-delivered in-app notification — but it only fires if/when the plan owner's own
> client happens to call a GET route while `now` is inside the reminder window. There
> is no proactive push telling the user "your date starts in an hour" the way a real
> scheduled job would guarantee. Likewise, `MISSED_CHECKIN` only becomes visible the
> next time *anyone* reads that plan (or the list) after the grace period has passed —
> nothing watches the clock in the background. **Nobody — not the app, not any real
> person — is ever paged/SMS'd/called if a user misses a check-in;** the trusted
> contact's phone number is stored for the user's own reference only (see
> `POST /api/safe-dates` above) and is never actually contacted. A real
> implementation would need a job queue (e.g. `node-cron` or a proper task queue) plus
> a real SMS provider (e.g. Twilio/MSG91, same gap already open for mobile-OTP
> delivery), neither of which exist in this project yet.

### `GET /api/date-ideas`
- **Auth:** required.
- **Query params (all optional):** `budget` (`low`|`medium`|`high`), `activityType`
  (`coffee`|`food`|`outdoor`|`movie`|`walk`|`other`), `city` (free text, used only to
  personalize the returned description text — there is no places/maps API integrated
  in this project, so it never looks up a real venue).
- **Stateless — nothing is persisted.** Returns 2-4 suggestions from a small curated,
  in-code static list (`backend/utils/datePlanUtils.js`), progressively relaxing the
  filter (budget-only, then activity-only, then a small default set) if an exact
  budget+activityType combination would otherwise return fewer than 2 results — this
  endpoint never returns an empty or single-item list.
  > ## ⚠️ NOT REAL AI
  > This is plain heuristic filtering over an in-code list — there is no
  > `ANTHROPIC_API_KEY` configured for this project (same constraint already
  > documented for Task #15's Icebreakers/Why-You-Match). See `MOCK_FEATURES.md`.
- **Safety rule (explicit product-spec requirement):** every curated suggestion is a
  **public** place/activity — cafés, restaurants, parks, malls, multiplexes, public
  lakes/gardens — never a private residence or an isolated/unsupervised spot. This is
  enforced by hand-curating the list itself, not by any runtime filter (there's
  nothing to filter — nothing private is ever in the list to begin with).
- **Success response:** `200 OK` —
  ```json
  {
    "ideas": [
      {
        "id": "coffee-evening-walk",
        "title": "Coffee + evening walk",
        "description": "Grab a coffee at a well-known local café, then take an easy walk together somewhere public and well-lit — a market road or a park with other people around.",
        "budgets": ["low", "medium"],
        "activityTypes": ["coffee", "walk"]
      }
    ],
    "budget": null, "activityType": null, "city": null
  }
  ```
- **Errors:** `400` — `budget`/`activityType` not one of the allowed values; `401`; `500`.
