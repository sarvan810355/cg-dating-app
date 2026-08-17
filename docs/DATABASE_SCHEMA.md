# Database Schema — CG-Dating-App (MongoDB / Mongoose)

This document describes the planned normalized data model: key fields, indexes, and
relationships for each collection. It is the source of truth for schema design; actual
Mongoose model files should follow this document (some models — `User`, `Profile`,
`Match`, `Message` — currently exist only as placeholders and will be filled in as each
feature is implemented).

**Field-level access rule (applies globally):** the following kinds of fields must
**never** be serialized directly into API responses to clients, regardless of
collection: password hashes/salts, exact street address, government ID
numbers/documents, internal trust/risk scores, and private admin/moderation notes.
Where a schema below lists such a field, it is annotated `[NEVER EXPOSED]`.

---

### `users`
Core account/auth record.
- `_id`
- `phone` (indexed, not unique — see divergence note below) — set via the
  Verification flow (Task #9 in the internal TaskList; = Phase 7), not at
  signup; signup is currently email/password only.
- `email` (unique, sparse, indexed) — optional
- `passwordHash` `[NEVER EXPOSED]`
- `role` — `[IMPLEMENTED, Task #11]` enum: `USER`, `SUPER_ADMIN`, `ADMIN`,
  `MODERATOR` (default `USER`). **Divergence:** the originally-drafted enum
  also included `SUPPORT`/`ANALYST` — Task #11 (Admin panel, basic; see
  `docs/ROADMAP.md`'s Phase 9) implements only the 4 values above, since no
  route/permission in this pass needs to distinguish a support-only or
  analyst-only role (no dedicated support queue, and no analytics dashboard
  yet — that's the future Task #13/Phase 12 scope). See
  `backend/constants/adminOptions.js#USER_ROLES`; widen the enum back to 6
  whenever a route actually needs those two values.
- `accountStatus` — `[IMPLEMENTED, Task #11]` enum: `ACTIVE`, `SUSPENDED`
  (default `ACTIVE`). **Divergence:** the originally-drafted field was named
  `status` with a 4-value enum (`ACTIVE`, `SUSPENDED`, `BANNED`, `DELETED`) —
  implemented instead as `accountStatus` (avoids any ambiguity with other
  status-like fields already on this document, e.g. verification statuses)
  with just the 2 values this basic moderation pass actually uses; there is
  no permanent-ban or account-deletion flow built yet, only a reversible
  suspend/reinstate pair (`PATCH /api/admin/users/:userId/suspend` /
  `.../reinstate`, see `docs/API_DOCUMENTATION.md`'s Admin section). A
  suspended account is blocked at login (`backend/routes/auth.js`) and
  excluded from the discovery feed (`backend/routes/discovery.js`). Widen
  back to `BANNED`/`DELETED` if/when a permanent-removal flow is built.
- `mobileVerification`, `photoVerification` — see the `verifications`
  section below; **this replaced the originally drafted plain
  `isPhoneVerified`/`isPhotoVerified` booleans** once Task #9 actually
  implemented verification, since the product spec calls for a richer
  `NOT_VERIFIED`/`PENDING`/`VERIFIED`/`REJECTED`/`EXPIRED` state machine per
  level, not just a boolean.
- `trustScore` `[NEVER EXPOSED]` — internal only, used by moderation/matching heuristics — **not implemented yet**, no code path sets or reads this.
- `dailyLikeCount`, `lastLikeCountReset` — Task #12 (Subscription
  scaffolding). Free-tier daily LIKE quota tracking, reset once per UTC
  calendar day — see the `plans`/`subscriptions` sections below and
  `backend/utils/entitlementUtils.js#tryConsumeDailyLike()`. Not part of the
  original draft; added because enforcing the freemium daily-like limit
  (`docs/BUSINESS_PLAN.md`) needed *some* per-user counter, and this is the
  same "1:1-with-user, always-fetched-together account state" pattern
  already used for `notificationPreferences`/`mobileVerification` above.
- `createdAt`, `updatedAt`, `lastLoginAt`
- Indexes: unique+sparse on `email`; index on `role` (admin queries — see
  `admin_users` below, now `[IMPLEMENTED]`).
  **Divergence:** `phone` is **not** unique-indexed in the implemented
  schema (`backend/models/User.js`) — signup doesn't collect a phone number
  at all (email/password only), and Task #9 lets a caller set/change their
  phone via `POST /api/verification/mobile/request-otp` with no
  cross-account uniqueness check in this MVP pass. A future hardening pass
  should probably add a uniqueness constraint once phone becomes a
  meaningful identifier (e.g. before phone-based login/2FA is added).

### `profiles` — `[IMPLEMENTED, with divergences from the original draft below]`
Public-facing dating profile, 1:1 with `users`. Implemented in
`backend/models/Profile.js`; routes in `backend/routes/profile.js`.
- `_id`, `user` (ref `users`, unique, indexed — field is named `user`, not `userId`,
  to match the existing `User`/`Profile` ref convention already in the codebase)
- `displayName`, `dateOfBirth` (age derived server-side via a virtual + a
  request-time helper — never stored as a separately editable "age" field), `gender`
  — enum: `male`, `female`, `non_binary`, `other`
- `interestedIn` (array, "who they want to meet") — enum: same as `gender` plus
  `everyone`
- `datingIntention` — enum: `long_term`, `serious_dating`, `marriage`, `casual`,
  `friendship`, `new_people` — first-class matching field.
  **Divergence from the original draft:** this replaces the earlier planned enum
  (`DATING`, `SERIOUS_RELATIONSHIP`, `MARRIAGE`, `FRIENDSHIP`) — the implemented
  list matches the actual product spec for Task #3 (adds `casual` and
  `new_people`, renames `DATING`→`long_term`/`casual` split). Update any future
  code that still assumes the old 4-value enum.
- `bio` (max 500 chars)
- `city`, `district` (free text — supports any Chhattisgarh district/town, not a
  closed list; see `backend/constants/profileOptions.js` for the *suggested*,
  non-exhaustive `CG_DISTRICTS` list used only as UI autocomplete), `state`
  (default `Chhattisgarh`), `location` (GeoJSON `Point`, optional, not yet
  populated by any UI — reserved for Task #4 discovery) — city/district only,
  never exact address
- `profession`, `education`
- `interests` (array of free strings, max 15).
  **Divergence:** implemented as free strings directly on the profile rather than
  `interestIds` referencing a separate `interests` lookup collection — simpler for
  MVP; a shared lookup collection can be introduced later without an API shape
  change (the field is still just called `interests`).
- `languages` (array of free strings) — **new field**, not in the original draft;
  added per the Task #3 product spec.
- `lifestyle` (object: `{ smoking, drinking, diet }`, each an optional small enum)
  — **new field**, not in the original draft; added per the Task #3 product spec.
- `personalityPrompts` (array of `{ prompt, answer }`, max 5).
  **Divergence:** `prompt` is validated against a fixed in-code prompt bank
  (`PERSONALITY_PROMPTS` in `backend/constants/profileOptions.js`) rather than a
  `promptId` reference into a separate `prompts` collection — same simplification
  rationale as `interests` above.
- `photos` (array of `{ url, isPrimary, addedAt }`, max 6, embedded directly in
  the profile document).
  **Divergence:** embedded on `profiles` rather than a separate top-level `photos`
  collection — simpler for MVP and matches the mock (non-Cloudinary) storage path;
  see `MOCK_FEATURES.md`. No `thumbnailUrl`, `order`, or `moderationStatus` yet —
  can be added when real Cloudinary + moderation land.
- `profileCompletionPercentage` (computed, 0-100, recomputed server-side on every
  save — see `backend/utils/profileUtils.js`). Named `profileCompletionPercentage`
  rather than the originally drafted `profileStrengthScore` (same concept).
- `isPrimaryPhotoVerified` — **still not implemented as a Profile field.**
  Task #9 (Verification) landed `photoVerification` on `users` instead (see
  the `verifications` section below) rather than adding this field to
  `profiles` — same "verification is account-level trust state, not a
  profile-content field" reasoning already applied to
  `notificationPreferences`. `GET /api/profile/:userId`'s public response
  now includes a `photoVerified` boolean (and `mobileVerified`) derived from
  `users.photoVerification`/`users.mobileVerification`, which serves the
  same purpose this field was reserved for.
- `createdAt`, `updatedAt`
- Indexes: unique on `user`; `2dsphere` on `location`; compound index on
  `(datingIntention, district)` for discovery filtering.

### `photos` — **not implemented as a separate collection**
See the `profiles.photos` divergence note above — photos are embedded on the
profile document for MVP instead of living in their own collection. This section
is kept here as the target shape if/when photos are split out (e.g. once
per-photo moderation status is needed).
- `_id`, `userId` (ref `users`, indexed), `url` (Cloudinary), `thumbnailUrl`, `order`,
  `isPrimary` (bool), `moderationStatus` (`PENDING`, `APPROVED`, `REJECTED`), `createdAt`
- Indexes: `(userId, order)`.

### `interests` — **not implemented as a separate collection**
See the `profiles.interests` divergence note above — kept as free strings on the
profile for MVP. This section is kept as the target shape if a shared lookup list
is introduced later (e.g. for interest-based discovery filtering/autocomplete).
- `_id`, `name` (unique), `category`, `isActive`
- Indexes: unique on `name`.

### `preferences` — `[PLANNED]`, still deferred past Task #4 (Discovery)
Discovery/matching preferences, 1:1 with `users`. **Still not implemented as a
persisted collection.** Task #4 (Discovery) shipped basic ad-hoc filtering
instead — `GET /api/discovery/feed?datingIntention=&city=` accepts these as
per-request query params rather than a saved, editable preferences record. Age
range, distance/geo-radius (`profiles.location` is still not populated by any
UI — see the `profiles` section above), and a persisted `showMeOnDiscovery`
toggle are all still not built; a dedicated `preferences` collection (or fields
folded onto `profiles`) remains future scope if/when saved filters are needed.
- `_id`, `userId` (ref `users`, unique), `ageMin`, `ageMax`, `genderPreference`,
  `distanceKm`, `datingIntentionFilter`, `showMeOnDiscovery` (bool)
- Indexes: unique on `userId`.

### `prompts` — **not implemented as a separate collection**
See the `profiles.personalityPrompts` divergence note above — the prompt bank is
a fixed in-code list (`backend/constants/profileOptions.js`) for MVP rather than
an admin-editable collection.
- `_id`, `text`, `category`, `isActive`
- Indexes: index on `isActive`.

### `likes` — `[IMPLEMENTED]`
Implemented in `backend/models/Like.js`; routes in `backend/routes/discovery.js`.
Records a single swipe decision (not just likes — passes too, so a candidate is
never re-shown once decided on).
- `_id`, `fromUser` (ref `users`, indexed), `toUser` (ref `users`, indexed),
  `action` — enum: `like`, `pass` (only `createdAt` timestamp, no `updatedAt` — a
  swipe is a point-in-time decision, never edited in place).
  **Divergence from the original draft:** fields renamed `fromUserId`/`toUserId`
  → `fromUser`/`toUser` (matches the `Profile.user` ref-naming convention already
  in the codebase) and `type` → `action`; the enum is `like`/`pass` (lowercase,
  two values) rather than `LIKE`/`SUPER_LIKE`/`PASS` — `SUPER_LIKE` is out of
  scope for this MVP pass and can be added as a third `action` value later
  without a schema shape change.
- Indexes: unique compound on `(fromUser, toUser)` — this is both the "no
  duplicate swipe" integrity constraint and the lookup used for mutual-like
  detection; compound index on `(toUser, action)` for "who liked me" lookups.

### `matches` — `[IMPLEMENTED]`
Implemented in `backend/models/Match.js`; routes in `backend/routes/matches.js`
(list) and `backend/routes/discovery.js` (creation, on a mutual like).
- `_id`, `userA`, `userB` (both ref `users`) — the pair stored in **canonical
  order** (ascending id string, computed by `backend/utils/matchUtils.js`'s
  `canonicalPair()` in a `pre('validate')` hook) so the same two users always
  map to the same document regardless of which direction the mutual like
  completed in, `users` (array mirroring `[userA, userB]`, the field most
  callers actually query against — e.g. "matches involving me"), `matchedAt`,
  `unmatched` (bool, default `false`), `unmatchedAt`, `unmatchedBy` (ref `users`,
  nullable).
  **Divergence from the original draft:** `userAId`/`userBId` → `userA`/`userB`
  (ref-naming convention) plus the `users` convenience array; `status`
  (`ACTIVE`/`UNMATCHED`) replaced with a plain `unmatched` boolean +
  `unmatchedAt` timestamp — simpler for MVP, and matches the literal shape from
  the Task #4 product spec (`{ users, createdAt, unmatched }`). Unmatch
  (`DELETE /api/matches/:matchId`) itself is not yet implemented — only match
  creation and listing shipped in this pass; see `docs/API_DOCUMENTATION.md`.
- Indexes: unique compound on `(userA, userB)` — the actual duplicate-match
  guard, race-safe because both swipe directions canonicalize to the identical
  pair before insert; index on `users` (array) for "all matches involving this
  user" queries.

### `conversations` — **not implemented as a separate collection**
**Divergence, implemented for Task #5 (Chat):** a `Match` document already
uniquely identifies the two participants of a conversation (it's created
exactly once per mutually-liked pair — see the `matches` section above), so
there is no separate `conversations` collection. `Match._id` *is* the
conversation id; messages are simply queried by `match` (see `messages`
below). This also means there's no `lastMessageAt`/`lastMessagePreview`
denormalized onto anything yet — `GET /api/matches` doesn't currently return
a last-message preview (see `docs/API_DOCUMENTATION.md`'s Matching section);
that's a reasonable follow-up if the match list needs it later, computable
either by a cheap per-match latest-message lookup or a denormalized field
maintained on `Match` when a message is sent.

### `messages` — `[IMPLEMENTED]`
Implemented in `backend/models/Message.js`; routes in `backend/routes/
matches.js` (mounted under `/api/matches/:matchId/messages` — see
`docs/API_DOCUMENTATION.md`'s Messaging section), real-time delivery via
Socket.IO (`backend/socket.js`).
- `_id`, `match` (ref `matches`, indexed — doubles as the conversation id,
  see the `conversations` divergence note above), `sender` (ref `users`),
  `recipient` (ref `users`) — **new field, not in the original minimal
  draft** (`{ match, sender, text, createdAt, readAt }`); added so "mark all
  messages sent *to* me in this match as read" is a single indexed query
  instead of re-deriving "the other participant" per message on every read,
  `text` (required, trimmed, 1-2000 chars), `readAt` (nullable `Date`,
  `null` until read), `createdAt`, `updatedAt` (via `timestamps: true`).
  **Divergence from the original draft:** `conversationId` → `match`
  (matches this codebase's ref-naming convention, and there's no separate
  Conversation collection to reference — see above); `senderId` → `sender`;
  `status` (`SENT`/`DELIVERED`/`READ`) replaced with a plain nullable
  `readAt` timestamp, same simplification pattern already used for
  `matches.unmatched`/`unmatchedAt` — a message is either read or it isn't,
  and delivery status isn't tracked separately since Socket.IO delivery is
  fire-and-forget (no ack/retry queue) for this MVP pass; `attachmentUrl` is
  **not implemented** — text-only messages for this pass, see
  `MOCK_FEATURES.md`/`TODO.md` (image/voice messages are V2 scope, not a
  mock — never built for Task #5 at all).
- Indexes: compound on `(match, createdAt)` — the actual "paginated history
  for this match" access pattern (see the Messaging API's newest-first
  cursor pagination); compound on `(match, recipient, readAt)` — supports
  "mark all my unread messages in this match as read" without a collection
  scan.

### `notifications` — `[IMPLEMENTED]`
Implemented in `backend/models/Notification.js`; routes in
`backend/routes/notifications.js`; created from
`backend/routes/discovery.js` (match/like events) and
`backend/routes/matches.js` (message events) via the shared
`backend/utils/notificationUtils.js#createNotification()` helper.
- `_id`, `recipient` (ref `users`, indexed — **not** `userId`, matches this
  codebase's `ref`-naming convention already used by `Like.fromUser`/
  `Match.userA` etc.), `type` — enum: `match`, `like`, `message`,
  `verification`, `safety`, `subscription` (lowercase, matching the
  `datingIntention`/`action` enum style already used elsewhere in this
  codebase, rather than the originally-drafted `LIKE`/`MATCH`/`MESSAGE`/
  `SYSTEM`). Only `match`, `like`, and `message` have any code path that
  creates them in this pass — `verification`/`safety`/`subscription` are
  reserved for later phases (Task #7+) so the schema won't need to change
  when those land.
  **Divergence:** `SYSTEM` was dropped in favor of the more specific
  `verification`/`safety`/`subscription` values, which better match this
  product's actual planned notification sources per `docs/ROADMAP.md`.
- `payload` (`Mixed`, default `{}`) — shape varies by `type`:
  - `match`: `{ matchId, fromUserId, fromUserName }` — the *other*
    participant's identity, safe to reveal because a match already reveals
    both sides to each other by definition.
  - `like`: `{}` — **deliberately empty, no identifying fields.** "See who
    liked you" is listed as a premium-tier reveal in `docs/BUSINESS_PLAN.md`
    (`CG_PLUS`/`CG_PRO`/`CG_ELITE`), so a plain (non-premium) like
    notification never carries the liker's identity — the frontend renders
    a generic "Someone liked your profile" message from `type` alone. There
    is no premium-reveal code path yet (Subscription/Task #10 is not
    started); when it lands, an *additional* enriched notification/endpoint
    for premium users can be layered on without changing this shape.
  - `message`: `{ matchId, fromUserId, fromUserName, messageId, preview }`
    — `preview` is the message text truncated to 140 chars.
- `read` (bool, default `false`) — **field named `read`, not `isRead`** (no
  particular reason beyond matching this codebase's terser boolean-field
  style, e.g. `matches.unmatched`).
- `createdAt` only (no `updatedAt`) — a notification is never edited in
  place except a targeted `read` flip via `PATCH .../read` /
  `.../read-all`, not a general update path (same pattern as
  `likes`/`matches.unmatched`).
- Indexes: compound on `(recipient, createdAt)` — the actual "my
  notifications, newest first" access pattern (`GET /api/notifications`);
  compound on `(recipient, read)` — "my unread notifications" /
  unread-count lookups (`GET /api/notifications/unread-count`,
  `PATCH /api/notifications/read-all`) without a collection scan.
  **Divergence:** two separate two-field indexes instead of one three-field
  `(userId, isRead, createdAt)` compound index — both actual access patterns
  (`GET /api/notifications` sorted by `createdAt`, and unread-only lookups
  filtered by `read`) are each fully served by one of the two indexes on
  their own; a single three-field index would only help the unread+sorted
  case and not "all notifications, sorted", so two indexes cover both
  queries as well as one would have covered only the unread one.

### `notification_preferences` — not a separate collection; fields on `users`
Per-type in-app notification opt-out toggles (Task #6). **Divergence from
the original draft's implicit separate-collection framing:** implemented as
a `notificationPreferences` sub-document directly on `users`
(`backend/models/User.js`) rather than its own collection — same
simplification rationale already used for `admin_users` (role field on
`users`) — a 1:1-with-`users`, always-fetched-together settings blob doesn't
need its own document.
- `users.notificationPreferences.matchNotifications` (bool, default `true`)
- `users.notificationPreferences.likeNotifications` (bool, default `true`)
- `users.notificationPreferences.messageNotifications` (bool, default `true`)
- **Deliberately no field exists for disabling `verification`/`safety`/
  `subscription` notifications** — those types are not user-toggleable at
  all (see `backend/constants/notificationOptions.js`'s
  `PREFERENCE_FIELD_BY_TYPE`); safety/account-critical notifications must
  always be delivered. No code path creates those types yet, so this is
  future-proofing, not a currently-enforced gate.
- Read/written via `GET`/`PUT /api/notifications/preferences`; enforced at
  notification-creation time by
  `backend/utils/notificationUtils.js#isNotificationTypeEnabled()` — a
  disabled type is silently skipped (no `Notification` document is created,
  no error surfaced to the action that would have triggered it).

### Real-time delivery — `[IMPLEMENTED, MOCK/TEMPORARY push deferred]`
`notification:new` is emitted over the same Socket.IO server used for chat
(`backend/socket.js`) to the recipient's personal `user:<id>` room (every
connected socket auto-joins its own on connect) whenever
`createNotification()` creates a document — see
`docs/API_DOCUMENTATION.md`'s Notifications section for the event contract.
**Real push notifications (Firebase Cloud Messaging) are MOCK/TEMPORARY —
not implemented at all in this pass, no FCM credentials configured yet.**
In-app notifications (this collection + the socket event + the frontend
bell/dropdown) are fully real; only off-app push delivery to a device that
doesn't have the app open is deferred. See `MOCK_FEATURES.md`.

### `reports` — `[IMPLEMENTED, with divergences from the original draft below]`
Implemented in `backend/models/Report.js`; routes in
`backend/routes/reports.js`; the `reason`/`status` enums and evidence limits
live in `backend/constants/safetyOptions.js` (Task #10, see
`docs/ROADMAP.md`'s Phase 8).

**Divergences from the original draft:** field names are `reporter`/
`reportedUser` (not `reporterId`/`reportedUserId` — matches this codebase's
existing `Like`/`Match` naming, which drops the `Id` suffix on ref fields);
`status` enum is `PENDING`/`REVIEWED`/`ACTION_TAKEN`/`DISMISSED` (not the
draft's `OPEN`/`IN_REVIEW`/`RESOLVED`/`DISMISSED`) — `PENDING` is every
report's starting state, matching this codebase's other "just created, needs
action" defaults (`Notification.read: false`, `photoVerification.status`);
`resolvedAt`/`resolvedBy` are named `reviewedAt`/`reviewedBy` for the same
reason. An `evidence` field was added beyond the original draft (not
present in it at all) — see below.

- `_id`
- `reporter` (ref `users`, required) — always the authenticated caller, never
  taken from client input.
- `reportedUser` (ref `users`, required, indexed)
- `reason` — enum: `fake_profile`, `harassment`, `spam`, `scam`,
  `inappropriate_content`, `hate_abuse`, `threats`, `impersonation`, `other`
  (required)
- `details` — free text, trimmed, optional, capped at 1000 characters
  (`REPORT_DETAILS_MAX_LENGTH`), enforced at the route layer
- `evidence` — array of strings (a photo/message-reference URL, or a short
  free-text reference), optional, capped at 10 entries / 2000 characters
  each (`MAX_EVIDENCE_ITEMS`/`EVIDENCE_ITEM_MAX_LENGTH`). **MOCK/TEMPORARY:**
  plain strings only — no file-upload path exists for report evidence in
  this pass, see `MOCK_FEATURES.md`.
- `status` — enum: `PENDING` (default), `REVIEWED`, `ACTION_TAKEN`,
  `DISMISSED`. `[IMPLEMENTED, Task #11]` — `PATCH /api/admin/reports/:id`
  (role: `MODERATOR`+) now transitions a report to one of the three
  non-`PENDING` values, see `docs/API_DOCUMENTATION.md`'s Admin section.
- `reviewedAt` (`Date`, null until a moderator acts on it — set by
  `PATCH /api/admin/reports/:id`)
- `reviewedBy` (ref `users`, admin; null until reviewed — set to the acting
  admin's id by `PATCH /api/admin/reports/:id`)
- `reviewNotes` `[NEVER EXPOSED]` — private moderation notes; `select: false`
  on the schema so a default `Report.find()`/`findById()` never loads it, on
  top of the global field-level access rule at the top of this document.
- `createdAt` only (no `updatedAt`) — a report's moderation outcome lives in
  the separate, deliberately-nullable `reviewedAt`, same choice already made
  for `Like`/`Notification`.
- Indexes: `{ status: 1, createdAt: -1 }` (the future Admin queue's real
  access pattern: "reports in this status, newest first"); `{ reportedUser: 1 }`
  ("all reports filed against this user").

### `blocks` — `[IMPLEMENTED]`
Implemented in `backend/models/Block.js`; routes in
`backend/routes/blocks.js`; the bidirectional-exclusion effects (discovery
feed, matches list, messaging authorization, Socket.IO `match:join`) are
centralized in `backend/utils/blockUtils.js` and documented in full in
`docs/API_DOCUMENTATION.md`'s Safety section (Task #10, see
`docs/ROADMAP.md`'s Phase 8).

- `_id`
- `blocker` (ref `users`, required) — who took the block action.
- `blocked` (ref `users`, required) — who got blocked.
- `createdAt` only (no `updatedAt`) — a block is a point-in-time decision;
  unblocking deletes the document (`DELETE /api/blocks/:userId`) rather than
  flipping a flag, so there's no "history of past blocks" to track.
- Indexes: `{ blocker: 1, blocked: 1 }` unique (prevents a duplicate block
  for the same pair — a repeat `POST /api/blocks` is idempotent, not an
  error, see `docs/API_DOCUMENTATION.md`); `{ blocked: 1 }` ("who has blocked
  me" — the other half of the bidirectional exclusion rule).
- **Design note:** blocking is one-directional *to create* — only `blocker`
  decided this; if the blocked user also wants to block back, they create
  their own separate `Block` document. The *effects* of a block are applied
  bidirectionally at query time wherever it matters, rather than by mutating
  any other collection (`Match`, etc.) — see `docs/API_DOCUMENTATION.md`'s
  Safety section for the full list of affected surfaces.

### `verifications` — `[IMPLEMENTED, with divergences from the original draft below]`
Implemented in `backend/models/User.js` (see the `users` section above);
routes in `backend/routes/verification.js`; helpers in
`backend/utils/verificationUtils.js`, `backend/utils/mockImageUpload.js`
(shared with the profile-photo mock path), constants in
`backend/constants/verificationOptions.js`.

**Divergence from the original draft:** implemented as two sub-documents
directly on `users` (`mobileVerification`, `photoVerification`) rather than
a separate `verifications` collection keyed by `(userId, type)` — same
simplification rationale already used for `notificationPreferences` and the
`admin_users` role field: a 1:1-with-user, always-fetched-together piece of
account trust state doesn't need its own collection. The status enum was
also expanded from the draft's `PENDING`/`APPROVED`/`REJECTED` to
`NOT_VERIFIED`/`PENDING`/`VERIFIED`/`REJECTED`/`EXPIRED` — `NOT_VERIFIED` is
the real default state (the draft had no "never attempted" value), `VERIFIED`
replaces `APPROVED` (matches this codebase's `Match`/`Like` terser style),
and `EXPIRED` is new (an OTP that timed out before being entered, or —
reserved for future use — a stale pending photo review).

- `users.mobileVerification`:
  - `status` — enum: `NOT_VERIFIED` (default), `PENDING`, `VERIFIED`,
    `REJECTED`, `EXPIRED`.
  - `verifiedAt` (`Date`, null until `VERIFIED`).
  - `otpHash` `[NEVER EXPOSED]` — bcrypt hash of the current OTP (same cost
    factor as password hashing), `select: false` on the schema so a default
    `User.find()`/`findById()` never loads it.
  - `otpExpiresAt` `[NEVER EXPOSED]` — `select: false`; OTP is valid for 10
    minutes from generation.
  - `otpRequestTimestamps` `[NEVER EXPOSED]` — `select: false`; sliding
    window of recent `request-otp` calls, used for rate limiting (max 3
    requests per 10-minute window).
- `users.photoVerification`:
  - `status` — same 5-value enum as above. `[IMPLEMENTED, Task #11]` —
    `PATCH /api/admin/verifications/photo/:userId` (role: `MODERATOR`+) now
    transitions a `PENDING` submission to `VERIFIED`/`REJECTED`.
  - `verifiedAt` (`Date`, null until `VERIFIED` — now set by
    `PATCH /api/admin/verifications/photo/:userId` on approval, and cleared
    back to `null` on rejection).
  - `submittedPhotoUrl` — the selfie submitted for review. **MOCK/TEMPORARY**
    storage, same non-Cloudinary pattern as `profiles.photos` (real external
    URL, or a base64 `data:` URI stored directly on the document — see
    `backend/utils/mockImageUpload.js` and `MOCK_FEATURES.md`). Returned to
    the **owner** of the submission (`GET /api/verification/status`) and —
    `[IMPLEMENTED, Task #11]` — to an **admin/moderator** reviewing the
    queue (`GET /api/admin/verifications/photo`), but
    `[NEVER EXPOSED as raw evidence to any OTHER, non-admin user]` — a
    regular user's view of this profile only ever sees the derived
    `photoVerified` boolean, via
    `backend/utils/verificationUtils.js#toPublicVerificationBadges()`.
  - `submittedAt` (`Date`).
  - `reviewNotes`, `reviewedBy` (ref `users`, admin), `reviewedAt`
    `[NEVER EXPOSED]` — `[IMPLEMENTED, Task #11]`: `reviewedBy`/`reviewedAt`
    are now set by `PATCH /api/admin/verifications/photo/:userId`;
    `reviewNotes` remains reserved/unused (no route accepts a note on this
    particular action — only the Report review route,
    `PATCH /api/admin/reports/:id`, takes a `reviewNotes` body field).
    `select: false` on the schema, still reset to `null` on a fresh
    resubmission.
- No dedicated indexes beyond the ones `users` already has — verification
  state is always looked up by the owning user's `_id` (already the primary
  key), never queried independently across users in this MVP pass (the
  future Admin review queue will need a `(photoVerification.status)` index
  once it's built — not added preemptively here).

### `plans` — `[IMPLEMENTED, with divergences from the original draft below]`
Task #12 (Subscription scaffolding, see `docs/ROADMAP.md`). Implemented in
`backend/models/Plan.js`; routes in `backend/routes/subscription.js`.
**Divergence from the original draft:** this collection didn't exist in the
original draft at all — pricing/features were assumed to live only on the
`subscriptions` row below (or be hardcoded). A separate, DB-backed `Plan`
collection was added instead because `docs/BUSINESS_PLAN.md` explicitly
requires plan naming/pricing to be **admin-editable, never hardcoded** — a
constants-file approach couldn't satisfy that without a deploy per price
change.
- `_id`, `code` (unique — `CG_PLUS`, `CG_PRO`, `CG_ELITE`), `name`,
  `priceInPaise` (Number — India-first, priced in paise not rupees to avoid
  float rounding on currency, same reasoning as `payments.amount` below),
  `billingPeriod` (`monthly`, `yearly`), `features` (array of strings, e.g.
  `unlimited_likes`, `advanced_filters`, `see_who_liked_you`, `boost`,
  `incognito`), `isActive` (bool)
- Indexes: unique on `code`.
- Seeding: the three default plans are seeded **idempotently at server
  startup** (`backend/utils/entitlementUtils.js#seedDefaultPlans()`, called
  from `backend/server.js`'s `mongoose.connect().then()`) — it only ever
  *inserts* a plan whose `code` doesn't already exist, so an admin's later
  price/feature edits are never overwritten by a restart. No Admin-panel
  pricing screen exists yet to make those edits through (that's a separate,
  not-yet-built piece of the Admin panel task, TODO.md's Admin section) —
  for now, editing a seeded plan means a direct DB write.

### `subscriptions` — `[IMPLEMENTED, with divergences from the original draft below]`
Implemented in `backend/models/Subscription.js`; routes in
`backend/routes/subscription.js`.
- `_id`, `user` (ref `users`, indexed — field named `user`, not `userId`, to
  match the existing ref-field convention already in this codebase — see
  `profiles.user`), `plan` (ref `plans`, **not** an inline enum string — see
  the `plans` divergence note above), `status` (`ACTIVE`, `EXPIRED`,
  `CANCELLED`), `startedAt`, `expiresAt`, `cancelledAt`, `paymentProvider`
  (`mock_razorpay` — **MOCK/TEMPORARY**, see below), `paymentReference`
  (string, fake/generated — **MOCK/TEMPORARY**)
- Indexes: compound `(user, status, expiresAt)`.
- **Divergence from the original draft:** no `autoRenew` boolean — this MVP
  pass never auto-renews anything (there's no billing cycle job / real
  payment provider to trigger a renewal from); a "subscribed" action always
  creates a brand-new `ACTIVE` row via the mock checkout below, and expiry
  is a one-shot `expiresAt` timestamp.
- "The caller's current subscription" (`GET /api/subscription/me`,
  `backend/utils/entitlementUtils.js#getEffectiveSubscription()`) is derived
  by querying for the most-recently-expiring row that is either `ACTIVE`, or
  `CANCELLED` but not yet past `expiresAt` — cancelling stops renewal, it
  does **not** immediately revoke access (standard SaaS behavior). This is
  also exactly what `hasFeature()` (see below) checks — a cancelled-but-
  still-valid subscriber keeps their features until `expiresAt`.

### `payments` — **not implemented as a separate collection; MOCK/TEMPORARY payment fields live on `subscriptions` instead**
**Divergence from the original draft:** there is no real Razorpay
integration in this codebase (no credentials configured — see
`MOCK_FEATURES.md`), so a full `payments` collection (with `providerPaymentId`,
`amount`, `currency`, a `CREATED`/`PAID`/`FAILED`/`REFUNDED` status machine,
and a `webhookVerifiedAt` signature-verification timestamp) was not built —
there is no webhook receiver anywhere in this pass. Instead,
`subscriptions.paymentProvider`/`paymentReference` record just enough to
trace which subscriptions came from the mock checkout path. **This is the
single most important gap to close before this ships to real users:**
`POST /api/subscription/subscribe` (`backend/routes/subscription.js`)
immediately marks a subscription `ACTIVE` on nothing more than the caller
being authenticated — there is no real payment collected, no Razorpay order
created, and no verified webhook gating activation. A real integration
would restore something like this `payments` collection (with its
`webhookVerifiedAt` field) as the **only** path allowed to flip a
subscription to `ACTIVE`, exactly as the original draft's note already said:
entitlement must only ever be granted/updated from a **verified webhook**,
never a client-reported "payment succeeded" call. See `MOCK_FEATURES.md`'s
Razorpay entry and `docs/API_DOCUMENTATION.md`'s Subscription section for
the full mock-checkout explanation.

### `boosts` — **not implemented** (Profile Boost is `PLAN_FEATURES`-listed but not yet enforced anywhere — see `docs/DATABASE_SCHEMA.md`'s `plans` section and `MOCK_FEATURES.md`)

### `events`
(V3 — CG Connect local events)
- `_id`, `title`, `description`, `city`, `district`, `location` (GeoJSON `Point`),
  `startsAt`, `endsAt`, `createdBy` (ref `users`, admin/organizer), `attendeeIds` (ref
  `users`, array)
- Indexes: `2dsphere` on `location`; index on `startsAt`.

### `date_plans`
(V2 — Date Planner)
- `_id`, `matchId` (ref `matches`), `createdBy` (ref `users`), `ideaText`, `venue`,
  `scheduledAt`, `status` (`PROPOSED`, `CONFIRMED`, `CANCELLED`)
- Indexes: index on `matchId`.

### `safe_dates`
(V2 — Safe Date mode)
- `_id`, `userId` (ref `users`, indexed), `matchId` (ref `matches`), `trustedContactId`
  (ref `users` or external contact info), `scheduledAt`, `checkInStatus`
  (`PENDING`, `CHECKED_IN`, `MISSED`, `SOS_TRIGGERED`), `location` (GeoJSON `Point`)
- Indexes: index on `(userId, scheduledAt)`.

### `referrals`
(V2 — Invite & Earn)
- `_id`, `referrerUserId` (ref `users`, indexed), `refereeUserId` (ref `users`),
  `code`, `status` (`PENDING`, `REWARDED`), `rewardedAt`
- Indexes: unique on `code`; index on `referrerUserId`.

### `admin_users` (role field on `users`) — `[IMPLEMENTED, Task #11]`
Roles are modeled as the `role` enum field directly on `users` (see above) rather than
a separate collection, to keep authz checks a single lookup — implemented exactly as
originally planned here. No separate collection built (or currently planned) unless a
future need (e.g. per-admin fine-grained permissions beyond the role enum) requires it.
Enforced by `backend/middleware/adminAuth.js#requireRole(...)`, which runs after
`backend/middleware/auth.js`'s `requireAuth` on every `/api/admin/*` route (see
`docs/API_DOCUMENTATION.md`'s Admin section) — it does **not** re-verify the JWT itself,
only adds the role check on top of the already-authenticated caller, so there is still
exactly one place in this codebase that owns JWT secret/token handling.

### `moderation_actions` — **not implemented as a separate collection**
Task #11 (Admin panel, basic; see `docs/ROADMAP.md`'s Phase 9) folds this concept into
the more general `audit_logs` collection below instead of a dedicated
`moderation_actions` collection — every admin mutation (report review, photo
verification approve/reject, suspend/reinstate, role change) writes one `AuditLog` entry
via `backend/utils/auditUtils.js#writeAuditLog()`, with `action` as a free string (e.g.
`'user.suspended'`) rather than a closed `WARN`/`SUSPEND`/`BAN`/... enum. This section is
kept here as a reminder of the target shape if a moderator ever needs a stricter,
enum-typed action log distinct from the general audit trail; not needed for this basic
pass.

### `audit_logs` — `[IMPLEMENTED, Task #11, with divergences from the original draft below]`
Implemented in `backend/models/AuditLog.js`; written from every state-changing route in
`backend/routes/admin.js` via `backend/utils/auditUtils.js#writeAuditLog()` (report
review, photo-verification approve/reject, suspend, reinstate, role change) — see
`docs/API_DOCUMENTATION.md`'s Admin section for exactly which action strings each route
writes.

**Divergences from the original draft:** `actorUserId` → `actor` (matches this
codebase's `ref`-naming convention already used by `Like.fromUser`/`Match.userA`/
`Report.reporter` etc. — drops the `Id` suffix on ref fields); the generic
`entityType`/`entityId` pair is replaced by a single `targetUserId` (ref `users`,
nullable) — every admin action in this basic pass targets a user (or no particular
entity, e.g. none currently), so a generic polymorphic reference isn't needed yet (see
the `moderation_actions` note above for the fuller shape this could grow into);
`metadata` → `details` (same free-form-object role, renamed only to avoid confusion with
Mongo's own connotations of "metadata").
- `_id`, `actor` (ref `users`, admin, required), `action` (free string, e.g.
  `'report.reviewed'`, `'user.suspended'`, `'user.reinstated'`, `'user.role_changed'`,
  `'verification.approved'`, `'verification.rejected'` — not a closed enum, so a new
  admin action never requires a schema change), `targetUserId` (ref `users`, nullable),
  `details` (object) `[may contain private moderation context — NEVER EXPOSED to
  non-admin API responses; no route in this pass exposes AuditLog documents to any API
  response at all, admin or otherwise — there is no `GET /api/admin/audit-logs` route
  yet, see `docs/API_DOCUMENTATION.md`'s Admin section note]`, `createdAt` only (no
  `updatedAt` — an audit entry is never edited in place, same pattern already used for
  `Like`/`Notification`/`Report`).
- Indexes: index on `createdAt` (the actual "recent admin activity" access pattern, for
  whenever a `GET /api/admin/audit-logs` view is built). No `(entityType, entityId)`
  index (that pair doesn't exist in the implemented shape) — a `targetUserId` index can
  be added later if "all audit entries about this user" becomes a real query need; not
  added preemptively here since nothing queries it yet.

---

## Notes

- All `ref users` foreign keys should use ObjectId references, not embedded documents,
  to keep the `users`/`profiles` split clean and avoid duplicating sensitive fields.
- Geospatial fields (`profiles.location`, `events.location`, `safe_dates.location`) use
  GeoJSON `Point` with a `2dsphere` index to support "near me" discovery without
  hardcoding specific cities — this must work for any CG district/town, not just
  Raipur/Bhilai/Durg/Bilaspur.
- Any new field that stores something sensitive (ID documents, exact address, private
  notes, internal scores) must be added to the `[NEVER EXPOSED]` list here and excluded
  from API serializers/DTOs at implementation time.
