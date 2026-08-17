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
- `role` — enum: `USER`, `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT`, `ANALYST` (default `USER`)
- `status` — enum: `ACTIVE`, `SUSPENDED`, `BANNED`, `DELETED`
- `mobileVerification`, `photoVerification` — see the `verifications`
  section below; **this replaced the originally drafted plain
  `isPhoneVerified`/`isPhotoVerified` booleans** once Task #9 actually
  implemented verification, since the product spec calls for a richer
  `NOT_VERIFIED`/`PENDING`/`VERIFIED`/`REJECTED`/`EXPIRED` state machine per
  level, not just a boolean.
- `trustScore` `[NEVER EXPOSED]` — internal only, used by moderation/matching heuristics — **not implemented yet**, no code path sets or reads this.
- `createdAt`, `updatedAt`, `lastLoginAt`
- Indexes: unique+sparse on `email`; index on `role` (admin queries — role
  field itself not yet implemented, see `admin_users` below).
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

### `reports`
- `_id`, `reporterId` (ref `users`), `reportedUserId` (ref `users`, indexed),
  `reason` (enum), `details`, `status` (`OPEN`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`),
  `createdAt`, `resolvedAt`, `resolvedBy` (ref `users`, admin)
- Indexes: index on `status`; index on `reportedUserId`.

### `blocks`
- `_id`, `blockerId` (ref `users`, indexed), `blockedUserId` (ref `users`, indexed),
  `createdAt`
- Indexes: unique compound on `(blockerId, blockedUserId)`.

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
  - `status` — same 5-value enum as above.
  - `verifiedAt` (`Date`, null until `VERIFIED` — no code path sets this yet
    in this pass, since photo approval is an Admin-panel action not built
    yet; see the MOCK/TEMPORARY note in `docs/API_DOCUMENTATION.md`'s
    Verification section).
  - `submittedPhotoUrl` — the selfie submitted for review. **MOCK/TEMPORARY**
    storage, same non-Cloudinary pattern as `profiles.photos` (real external
    URL, or a base64 `data:` URI stored directly on the document — see
    `backend/utils/mockImageUpload.js` and `MOCK_FEATURES.md`). Returned to
    the **owner** of the submission (`GET /api/verification/status`), but
    `[NEVER EXPOSED as raw evidence to OTHER users]` — any other user's view
    of this profile only ever sees the derived `photoVerified` boolean, via
    `backend/utils/verificationUtils.js#toPublicVerificationBadges()`.
  - `submittedAt` (`Date`).
  - `reviewNotes`, `reviewedBy` (ref `users`, admin), `reviewedAt`
    `[NEVER EXPOSED]` — reserved fields for the future Admin panel's
    verification review queue (docs/ROADMAP.md's Phase 9); `select: false`
    on the schema; no code path reads or writes them in this pass beyond
    resetting them to `null` on a fresh resubmission.
- No dedicated indexes beyond the ones `users` already has — verification
  state is always looked up by the owning user's `_id` (already the primary
  key), never queried independently across users in this MVP pass (the
  future Admin review queue will need a `(photoVerification.status)` index
  once it's built — not added preemptively here).

### `subscriptions`
- `_id`, `userId` (ref `users`, indexed), `plan` (`CG_PLUS`, `CG_PRO`, `CG_ELITE`),
  `status` (`ACTIVE`, `EXPIRED`, `CANCELLED`), `startedAt`, `expiresAt`,
  `autoRenew` (bool)
- Indexes: index on `(userId, status)`.

### `payments`
- `_id`, `userId` (ref `users`, indexed), `subscriptionId` (ref `subscriptions`),
  `provider` (`RAZORPAY`), `providerPaymentId`, `amount`, `currency`, `status`
  (`CREATED`, `PAID`, `FAILED`, `REFUNDED`), `webhookVerifiedAt`, `createdAt`
- Indexes: index on `userId`; unique on `providerPaymentId`.
- Note: entitlement is only ever granted/updated from a **verified webhook**, never
  from a client-reported "payment succeeded" call.

### `boosts`
- `_id`, `userId` (ref `users`, indexed), `startedAt`, `expiresAt`, `source`
  (`PURCHASED`, `PROMOTIONAL`)
- Indexes: compound `(userId, expiresAt)`.

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

### `admin_users` (role field on `users`)
Roles are modeled as the `role` enum field directly on `users` (see above) rather than
a separate collection, to keep authz checks a single lookup. No separate collection
planned unless a future need (e.g. per-admin fine-grained permissions beyond the role
enum) requires it.

### `moderation_actions`
- `_id`, `adminUserId` (ref `users`), `targetUserId` (ref `users`, indexed),
  `action` (`WARN`, `SUSPEND`, `BAN`, `UNBAN`, `VERIFY_APPROVE`, `VERIFY_REJECT`, ...),
  `reason`, `relatedReportId` (ref `reports`, nullable), `createdAt`
- Indexes: index on `targetUserId`; index on `adminUserId`.

### `audit_logs`
- `_id`, `actorUserId` (ref `users`, admin), `action`, `entityType`, `entityId`,
  `metadata` (object) `[metadata may contain private notes — NEVER EXPOSED to non-admin
  API responses]`, `createdAt`
- Indexes: index on `(entityType, entityId)`; index on `createdAt`.

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
