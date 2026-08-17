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
- `phone` (unique, indexed) — primary identifier for OTP-based auth
- `email` (unique, sparse, indexed) — optional
- `passwordHash` `[NEVER EXPOSED]`
- `role` — enum: `USER`, `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT`, `ANALYST` (default `USER`)
- `status` — enum: `ACTIVE`, `SUSPENDED`, `BANNED`, `DELETED`
- `isPhoneVerified`, `isPhotoVerified` (booleans)
- `trustScore` `[NEVER EXPOSED]` — internal only, used by moderation/matching heuristics
- `createdAt`, `updatedAt`, `lastLoginAt`
- Indexes: unique on `phone`; unique+sparse on `email`; index on `role` (admin queries).

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
- `isPrimaryPhotoVerified` — **not yet implemented**; deferred until the
  Verification feature (photo/selfie verification) lands.
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

### `notifications`
- `_id`, `userId` (ref `users`, indexed), `type` (`LIKE`, `MATCH`, `MESSAGE`, `SYSTEM`,
  ...), `payload` (small object, e.g. `{ fromUserId, matchId }`), `isRead`, `createdAt`
- Indexes: compound on `(userId, isRead, createdAt)`.

### `reports`
- `_id`, `reporterId` (ref `users`), `reportedUserId` (ref `users`, indexed),
  `reason` (enum), `details`, `status` (`OPEN`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`),
  `createdAt`, `resolvedAt`, `resolvedBy` (ref `users`, admin)
- Indexes: index on `status`; index on `reportedUserId`.

### `blocks`
- `_id`, `blockerId` (ref `users`, indexed), `blockedUserId` (ref `users`, indexed),
  `createdAt`
- Indexes: unique compound on `(blockerId, blockedUserId)`.

### `verifications`
- `_id`, `userId` (ref `users`, unique per type via compound), `type` (`MOBILE_OTP`,
  `SELFIE_PHOTO`), `status` (`PENDING`, `APPROVED`, `REJECTED`), `evidenceUrl`
  (Cloudinary, selfie only) `[NEVER EXPOSED as raw govt ID — selfie/photo verification
  only in MVP, no government ID collection planned in MVP]`, `reviewedBy` (ref `users`,
  admin), `reviewedAt`, `createdAt`
- Indexes: compound `(userId, type)`.

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
