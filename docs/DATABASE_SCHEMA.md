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

### `profiles`
Public-facing dating profile, 1:1 with `users`.
- `_id`, `userId` (ref `users`, unique, indexed)
- `displayName`, `dob` (age derived server-side), `gender`
- `datingIntention` — enum: `DATING`, `SERIOUS_RELATIONSHIP`, `MARRIAGE`, `FRIENDSHIP` — first-class matching field
- `bio`
- `city`, `district`, `state` (default `Chhattisgarh`), `location` (GeoJSON `Point`) — city/district only, never exact address
- `profession`, `education`
- `interestIds` (ref `interests`, array)
- `promptAnswers` (array of `{ promptId (ref prompts), answer }`)
- `profileStrengthScore` (computed)
- `isPrimaryPhotoVerified` (denormalized from `verifications` for fast reads)
- `createdAt`, `updatedAt`
- Indexes: unique on `userId`; `2dsphere` on `location`; compound index on
  `(datingIntention, district)` for discovery filtering.

### `photos`
- `_id`, `userId` (ref `users`, indexed), `url` (Cloudinary), `thumbnailUrl`, `order`,
  `isPrimary` (bool), `moderationStatus` (`PENDING`, `APPROVED`, `REJECTED`), `createdAt`
- Indexes: `(userId, order)`.

### `interests`
Reference/lookup list (e.g. "Cricket", "Cooking", "Traveling").
- `_id`, `name` (unique), `category`, `isActive`
- Indexes: unique on `name`.

### `preferences`
Discovery/matching preferences, 1:1 with `users`.
- `_id`, `userId` (ref `users`, unique), `ageMin`, `ageMax`, `genderPreference`,
  `distanceKm`, `datingIntentionFilter`, `showMeOnDiscovery` (bool)
- Indexes: unique on `userId`.

### `prompts`
Personality prompt bank (e.g. "My ideal weekend...").
- `_id`, `text`, `category`, `isActive`
- Indexes: index on `isActive`.

### `likes`
- `_id`, `fromUserId` (ref `users`, indexed), `toUserId` (ref `users`, indexed),
  `type` (`LIKE`, `SUPER_LIKE`, `PASS`), `createdAt`
- Indexes: unique compound on `(fromUserId, toUserId)`; index on `toUserId` (for
  "who liked you").

### `matches`
Created when two users mutually like each other.
- `_id`, `userAId`, `userBId` (both ref `users`, order-independent pair, indexed),
  `matchedAt`, `status` (`ACTIVE`, `UNMATCHED`), `unmatchedBy` (ref `users`, nullable)
- Indexes: unique compound on `(userAId, userBId)`; index on each user id.

### `conversations`
- `_id`, `matchId` (ref `matches`, unique), `participantIds` (array, ref `users`),
  `lastMessageAt`, `lastMessagePreview`
- Indexes: unique on `matchId`; index on `participantIds`.

### `messages`
- `_id`, `conversationId` (ref `conversations`, indexed), `senderId` (ref `users`),
  `text`, `attachmentUrl` (Cloudinary, nullable), `status` (`SENT`, `DELIVERED`, `READ`),
  `createdAt`
- Indexes: compound on `(conversationId, createdAt)`.

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
