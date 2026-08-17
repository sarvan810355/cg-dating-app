# Implementation Progress Log

Purpose: this file is an append-only running log of completed and in-progress checkpoints
for CG-Dating-App. After every meaningful completed task, append a new entry at the TOP
of the log below (newest first). Never delete or rewrite history — if something is later
reverted or changed, add a new entry describing that instead of editing the old one.

Each entry should include: date, phase, task, files touched, tests performed, and the
next task that follows from it.

---

## 2026-08-17 — Subscription scaffolding: Plans, mock checkout, entitlement checks (Task #12) implemented

- **Phase:** Roughly Phase 10-equivalent scope in `docs/ROADMAP.md`'s
  numbering (that doc doesn't yet have a dedicated Subscription phase
  number distinct from Payments — see the internal TaskList's Task #12,
  which is authoritative for this pass; `docs/ROADMAP.md` and the internal
  numbering are deliberately not 1:1, per this project's established note).
- **Task:** Subscription scaffolding (basic): configurable, admin-editable
  Plan model (seeded idempotently at startup, not hardcoded — per
  `docs/BUSINESS_PLAN.md`'s explicit requirement), a Subscription model,
  `GET /api/plans` (public paywall listing), `GET /api/subscription/me`,
  `POST /api/subscription/subscribe` (explicit MOCK checkout — no real
  Razorpay), `POST /api/subscription/cancel` (stays valid until
  `expiresAt`, standard SaaS behavior), and a server-side
  `hasFeature()` entitlement helper that always reads from the database and
  never trusts a client claim — demonstrated by gating the discovery feed's
  free-tier daily like limit (20/day) behind the `unlimited_likes` feature.
  Frontend: a Subscription/Upgrade page, a Membership status section (+
  Cancel) on Settings, and an upgrade prompt on Discovery when the daily
  limit is hit.
- **Concurrency note — built alongside another background agent's Task #11
  (Admin panel) in the SAME live working tree at the same time**, not
  separate clones each pushing independently as the task's own launch
  instructions anticipated (they described a `git pull --rebase`
  reconciliation step; that didn't apply here because there was only ever
  one working tree to begin with — both sessions' edits landed directly on
  disk as they happened). This was discovered mid-task via a "file modified
  since read" tool signal, not announced up front. Six files ended up
  touched by both passes: `backend/models/User.js`, `backend/routes/
  discovery.js`, `backend/server.js`, `frontend/src/App.jsx`, `frontend/src/
  pages/Settings.jsx`, `frontend/src/api.js`. In every case both passes'
  edits were structurally independent (different hunks in different parts
  of the same file — verified by diffing), so nothing was actually
  conflicting at the code level. To keep authorship cleanly separable in
  git history despite the shared working tree, this pass's commit does NOT
  `git add` the live (combined) version of those six files. Instead it
  reconstructs a "this-task's-hunks-only" version of each (starting from
  `git show HEAD:<path>`, re-applying only this pass's own edits — the
  exact same edits already made to the live file, in the same order) and
  stages that reconstructed blob directly via `git hash-object -w` +
  `git update-index --cacheinfo`, leaving the actual working-tree file
  (which still has both passes' combined edits) completely untouched on
  disk so the other agent's session can keep working in it and commit its
  own additions normally. Verified correct by diffing each reconstructed
  file against the live working-tree file and confirming the *only*
  remaining difference is the other agent's own (clearly Task #11-labeled,
  in their own code comments) additions — see the diff output captured in
  this session's transcript. All of this pass's fully-owned new files
  (`backend/constants/subscriptionOptions.js`, `backend/models/Plan.js`,
  `Subscription.js`, `backend/utils/entitlementUtils.js`,
  `subscriptionSerializers.js`, `backend/routes/subscription.js`,
  `frontend/src/pages/Subscription.jsx`) plus `frontend/src/pages/
  Discovery.jsx` (confirmed untouched by the other pass) were `git add`ed
  normally.
- **Files touched:** see `PROJECT_STATE.md`'s "Last Modified Files" entry
  for this pass for the complete, categorized list (new vs. additive
  changes to shared files) — not repeated here to avoid the two documents
  drifting out of sync on a list this long.
- **Tests performed:**
  - Backend: `node server.js` boots cleanly with every route group mounted
    (including the concurrent Task #11 admin routes — no syntax/import
    errors from either pass' files). Curled `GET /api/plans` (no auth
    required — confirmed by the absence of a 401; it does 500 in this
    sandbox, but confirmed via server logs to be a genuine ~10s Mongoose
    buffering timeout from the unreachable MongoDB, not a route/wiring bug
    — consistent with every prior pass' documented sandbox limitation) and
    `GET /api/subscription/me` / `POST /api/subscription/subscribe` /
    `POST /api/subscription/cancel` with no/bad auth, confirming `401` in
    all three cases (plus a bogus-JWT case separately confirming "Invalid
    or expired token").
  - A standalone Node script (`/tmp/.../verify_entitlement.js`, deleted
    before this commit per this project's established convention — never
    commit a scratch verification script) loaded the ACTUAL
    `backend/utils/entitlementUtils.js` with `Plan`/`Subscription`/`User`'s
    Mongoose model modules swapped for tiny in-memory fakes via
    `require.cache` injection (same "fake-model" spirit as prior passes'
    integration scripts, applied here directly to a pure-logic utility
    module rather than over HTTP, since `entitlementUtils.js` has no route
    layer of its own). 15/15 checks passed:
    - `seedDefaultPlans()`: first call creates all 3 default plans; a
      second call creates none (idempotent) AND does not clobber a
      simulated admin price edit made in between; all 3 plan codes present
      with the expected `features` arrays.
    - `hasFeature()`: `false` for a free-tier user; `true` for an ACTIVE
      CG_PLUS subscriber's `unlimited_likes` (and correctly `false` for
      that same user's `see_who_liked_you`, a CG_PRO-only feature — proving
      the check is plan-specific, not "any active subscription grants
      everything"); `true` for a CANCELLED-but-not-yet-`expiresAt`
      subscriber (proving cancel doesn't immediately revoke access); `false`
      for an EXPIRED-status subscriber; and `false` for that same
      CANCELLED-but-valid subscriber once evaluated at a point in time
      *after* their `expiresAt` actually passes (proving the check is
      time-based, not merely status-based).
    - `tryConsumeDailyLike()`: allows exactly the first 20 likes in a UTC
      calendar day and blocks the 21st (without incrementing the stored
      counter past 20); resets to a fresh count of 1 on the next UTC
      calendar day; does NOT reset mid-way through the same UTC day (23:59
      same-day check); and an `unlimited_likes` subscriber bypasses the
      counter entirely, confirmed by checking their `dailyLikeCount` stayed
      at 0 after a call that would otherwise have consumed quota.
  - Frontend: `npm run build` succeeded; `npm run lint` (oxlint) passed with
    the same two pre-existing `only-export-components` warnings carried
    forward from every prior pass, no new warnings introduced by
    `Subscription.jsx` or the `Settings.jsx`/`Discovery.jsx`/`api.js`
    changes.
- **Known limitation carried forward:** DB-touching behavior (actual
  Plan/Subscription persistence, the `Plan.code` unique index and the
  `Subscription` compound `(user, status, expiresAt)` index under real
  concurrent inserts, the startup seed actually running against a real
  database) could not be exercised end-to-end — same root cause
  (unreachable MongoDB in this sandbox) as every prior pass; see
  `PROJECT_STATE.md`'s Known Technical Debt.
- **Next task:** Per the task's own launch instructions, whichever of Task
  #9/#11 is still open, else Task #6 (Final polish). Task #9 (Verification)
  was already complete before this pass started. Task #11 (Admin panel)
  appeared complete or very nearly so by the time this pass finished (role
  fields, admin routes, admin frontend pages, and a Settings link were all
  observed live in the shared working tree) but this pass could not
  directly confirm the other agent's session reached a finished, committed
  state — whoever picks up next should verify that before assuming Task #6
  is unblocked. See `PROJECT_STATE.md`'s "Next Exact Task"/"Next Recommended
  Action" for the full reasoning.

---

## 2026-08-17 — Safety: Report/Block + Safety Center (Task #10) implemented

- **Phase:** Phase 8 — Safety (docs/ROADMAP.md numbering; internal TaskList
  numbering for this same task is #10).
- **Task:** Report and Block user flows plus a Safety Center screen —
  `POST /api/reports` (reason enum + optional details/evidence),
  `POST`/`DELETE`/`GET /api/blocks`, and bidirectional exclusion of blocked
  users from the discovery feed, matches list, and messaging (REST +
  Socket.IO), reachable from a Report/Block menu on Discovery cards and in
  Chat, plus a Blocked Users management screen and a static Safety Center
  screen.
- **Continuity note — recovered from a prior session's mid-task
  interruption.** A previous background session started this exact task and
  produced the entire backend (`backend/models/Block.js`, `Report.js`,
  `backend/routes/blocks.js`, `reports.js`, `backend/constants/
  safetyOptions.js`, `backend/utils/blockUtils.js`, and the discovery/
  matches/socket/server.js wiring) before hitting a session/API limit and
  stopping mid-task, leaving that work uncommitted in the working tree. This
  session picked it up: reviewed every backend file line-by-line against the
  task spec (found it solid — correct validation, dedup, 404s, consistent
  bidirectional-exclusion logic, well-commented) rather than rewriting or
  second-guessing it, re-verified it independently with a fresh integration
  test (see "Tests performed" below, which is new work in this pass, not
  inherited), and then built the entire frontend + this doc pass on top,
  which had not been started yet. This is the project's own
  credit-interruption protocol working as intended — flagged here explicitly
  per that protocol's own convention, same as PROJECT_STATE.md's "Current
  Task" line for this entry.
- **Design decisions:**
  - **Blocking is one-directional to create, bidirectional in effect.**
    `backend/models/Block.js` only ever records the blocker's own decision —
    if the blocked user also wants to block back, they create their own
    separate document. But *nothing else* about a block is one-directional:
    `backend/utils/blockUtils.js#getBlockedUserIds()`/`#isBlockedEitherWay()`
    are the single source of truth for "does a block affect this pair",
    consumed identically by the discovery feed, the matches list, all three
    message routes' `loadAuthorizedMatch()`, and Socket.IO's `match:join` —
    so a blocked user can never see or reach the blocker through any
    surface, and vice versa, regardless of who blocked whom.
  - **Blocking doesn't mutate `Match` (or anything else) — it's a
    query-time filter only.** Unlike unmatch (a permanent, mutating action
    that sets `unmatched`/`unmatchedAt`/`unmatchedBy` on the `Match`
    document itself), a block's effect on an existing match is enforced
    entirely by filtering at read time. This was a deliberate choice (kept
    from the inherited backend work, and endorsed on review): it means
    unblocking is a clean, total undo — the match, its full message history,
    and read receipts all reappear exactly as they were, with nothing to
    "restore" because nothing was ever touched.
  - **Blocking is silent; reporting is confidential.** `POST /api/blocks`
    never creates a `Notification` for the blocked user — they simply stop
    being able to reach or be reached by the blocker, with no explanation
    surfaced anywhere. `POST /api/reports` never notifies the reported user
    either, and nothing about a report is visible to anyone but the
    reporter (their own `POST` response) and, later, an admin — there's no
    `GET /api/reports` "my reports" list, since nothing asked for one and
    the response to the `POST` is the report's only client-visible moment.
  - **Report evidence is plain strings, no automated moderation.** Kept the
    inherited backend's choice not to build a file-upload path for report
    evidence (`evidence` is capped free-text/URL strings) and not to add any
    automated spam/scam/abuse-detection signal — both are explicitly
    documented as out of scope in `MOCK_FEATURES.md`'s two new entries for
    this pass, with automated detection specifically deferred to the
    already-planned V3 "Trust Engine" (see `docs/ROADMAP.md`/`TODO.md`), not
    invented as a new scope decision in this pass.
  - **Frontend: one shared `SafetyMenu` component, not two separate
    Report/Block UIs.** Discovery (report/block a profile card) and Chat
    (report/block the other person in a match) both need the identical
    "⋯ -> Report / Block" interaction against a different target user each
    time — built once as `frontend/src/components/SafetyMenu.jsx` (which
    itself owns opening `ReportModal.jsx` and the block confirm+API call)
    and reused from both places with just `userId`/`userName`/`onBlocked`
    props, rather than duplicating the menu, the confirm dialog, and the
    error handling in each page.
  - **Block confirmation is a plain `window.confirm`, not a custom
    Dialog component.** Per the task spec's explicit allowance
    ("doesn't need to be fancy") and to avoid building a full generic
    Dialog/Modal component (docs/DESIGN_SYSTEM.md lists one but nothing has
    built it yet) just for this one consequential-but-simple confirmation;
    `ReportModal.jsx` still gets a proper Modal-style overlay since it's a
    real form, following `MatchModal.jsx`'s existing pattern.
- **Backend files touched (inherited from the interrupted prior session,
  reviewed and independently re-verified in this pass — see "Continuity
  note" above):** `backend/constants/safetyOptions.js` (new), `backend/
  models/Block.js` (new), `backend/models/Report.js` (new), `backend/utils/
  blockUtils.js` (new), `backend/routes/blocks.js` (new), `backend/routes/
  reports.js` (new), `backend/routes/discovery.js` (feed exclusion),
  `backend/routes/matches.js` (matches-list exclusion + message-route
  authorization), `backend/socket.js` (`match:join` authorization),
  `backend/server.js` (mounted the two new route groups).
- **Frontend files touched (new work this pass):** `frontend/src/
  constants/safetyOptions.js` (new), `frontend/src/api.js` (`reportUser`/
  `blockUser`/`unblockUser`/`getBlockedUsers`), `frontend/src/components/
  ReportModal.jsx` (new), `frontend/src/components/SafetyMenu.jsx` (new),
  `frontend/src/pages/Discovery.jsx` (SafetyMenu overlay on the card photo;
  a successful block removes that card from the queue immediately),
  `frontend/src/pages/Chat.jsx` (SafetyMenu in the header; a successful
  block navigates to `/matches`), `frontend/src/pages/BlockedUsers.jsx`
  (new), `frontend/src/pages/SafetyCenter.jsx` (new, static content),
  `frontend/src/pages/Settings.jsx` (Safety Center + Blocked Users links),
  `frontend/src/App.jsx` (`/safety-center`, `/settings/blocked-users`
  routes).
- **Tests performed (all new work this pass — none of this was inherited):**
  - Backend boots cleanly with `/api/reports` and `/api/blocks` mounted
    alongside the existing seven route groups, no syntax/import errors.
  - Curled `POST/GET/DELETE /api/blocks` and `POST /api/reports` with
    no/bad auth — all return `401`.
  - A standalone Node script (65/65 checks, no live DB) built a REAL
    Express app + real HTTP server + real Socket.IO server mounting the
    ACTUAL `backend/routes/blocks.js`, `reports.js`, `discovery.js`,
    `matches.js`, and `backend/socket.js` files (only the Mongoose model
    modules swapped for tiny in-memory fakes via `require.cache`
    injection, since MongoDB is unreachable in this sandbox — same
    workaround pattern used for every DB-touching test in this project so
    far) and drove it over real HTTP plus one real Socket.IO client<->
    server round trip (`socket.io-client` installed transiently via
    `npm install --no-save --no-package-lock`, used for exactly this test,
    then removed again — never added to `package.json`/`package-lock.json`,
    confirmed via `git status`/`git diff --stat` afterward). Covered: Block
    create-dedup (duplicate `POST` is `200` idempotent, same document, not
    a new one; self-block and invalid-id `400`), Report reason-enum
    validation (all 9 real values from `REPORT_REASONS` round-trip
    correctly; an invalid reason, self-report, and missing reason all
    `400`), and — the core of this task — bidirectional blocking exclusion
    end-to-end with a three-user (A/B/C) setup where A blocks B and C is an
    uninvolved control: B disappears from A's discovery feed AND A
    disappears from B's feed (C's feed unaffected), the A↔B match
    disappears from `GET /api/matches` for BOTH A and B (the unrelated A↔C
    match stays visible for both as a control), `GET`/`POST`-message and
    `PATCH`-read-receipt all `403` for both A and B on the blocked match
    (with zero `Message` documents created), a real Socket.IO
    `match:join` acks `{ok:false}` for both A and B on the blocked match
    while acking `{ok:true}` on the unaffected A↔C match, and after
    `DELETE /api/blocks/:userId` the match reappears and messaging/`GET`
    succeed again (`200`) for both, with a repeat unblock correctly `404`ing.
  - Frontend `npm run build` and `npm run lint` both pass with the new
    `SafetyMenu.jsx`/`ReportModal.jsx`/`BlockedUsers.jsx`/`SafetyCenter.jsx`
    and the Discovery/Chat/Settings/App.jsx wiring; no new lint warnings
    (the two pre-existing `only-export-components` warnings in
    `AuthContext.jsx`/`NotificationContext.jsx` are unrelated and already
    an accepted pattern from prior sessions).
  - The standalone verification script and the transiently-installed
    `socket.io-client` package were both removed before committing — same
    "no scratch/debug files in the tree" convention every prior session on
    this project has followed; confirmed via `git status`/`git diff --stat`
    that only intended app-code/doc files are staged.
  - Not exercised (see PROJECT_STATE.md's Known Technical Debt): real
    MongoDB persistence of `Block`/`Report` (including the `Block` unique
    compound index under real concurrent inserts), and anything involving
    automated abuse detection or file-upload evidence (neither exists —
    both are intentionally out of scope, see `MOCK_FEATURES.md`).
- **Next task:** Task #11 — Admin Panel (basic) (see PROJECT_STATE.md's
  "Next Exact Task" for the full scope breakdown and the note that a
  TaskList tool was not available in this session to cross-check the
  internal task graph directly).

---

## 2026-08-17 — Verification (Task #9) implemented

- **Phase:** Phase 7 — Verification (docs/ROADMAP.md numbering; internal
  TaskList numbering for this same task is #9).
- **Task:** Two independent verification levels for a user's account: mobile
  OTP verification and photo/selfie verification, each with a
  `NOT_VERIFIED`/`PENDING`/`VERIFIED`/`REJECTED`/`EXPIRED` state machine,
  plus `mobileVerified`/`photoVerified` badges surfaced on other users'
  views of a profile (public profile, discovery feed cards, match list
  cards). SMS delivery for the OTP is MOCK/DEV-ONLY (no real provider
  configured); photo verification has no automated face-match and only
  reaches `PENDING` in this pass (approve/reject is a future Admin-panel
  job).
- **Design decisions:**
  - **Verification state lives on `User`, not a separate `verifications`
    collection.** `docs/DATABASE_SCHEMA.md` originally drafted a standalone
    `verifications` collection keyed by `(userId, type)`. Implemented
    instead as two sub-documents directly on `backend/models/User.js`
    (`mobileVerification`, `photoVerification`) — same simplification
    already used for `notificationPreferences` and the `role` field: a
    1:1-with-user, always-fetched-together piece of account trust state
    doesn't need its own collection, and the two levels have different
    enough shapes (one has OTP hashing/expiry, the other has a submitted
    photo + moderation fields) that flattening them into one generic
    `(userId, type, status)` row would have meant a lot of type-conditional
    field access anyway.
  - **Real OTP logic, mocked delivery only.** OTP generation
    (`crypto.randomInt`, not `Math.random()`), hashing (bcrypt, same cost
    factor as password hashing), 10-minute expiry, and a 3-requests-per-
    10-minute sliding-window rate limit are all real, non-mocked logic
    (`backend/utils/verificationUtils.js`). Only the SMS *send* is mocked —
    the OTP is logged to the server console and, **only when
    `NODE_ENV !== 'production'`**, echoed back in the `request-otp`
    response as a `devOtp` field. This was directly verified two ways: a
    real-HTTP integration test with `NODE_ENV=development` confirms
    `devOtp` is present and correct, and a separate run with
    `NODE_ENV=production` confirms it's completely absent from the
    response (while still being logged) — see "Tests performed" below.
  - **Internal fields are `select: false` on the schema, not just omitted
    by a serializer.** `mobileVerification.otpHash`/`otpExpiresAt`/
    `otpRequestTimestamps` and `photoVerification.reviewNotes`/
    `reviewedBy`/`reviewedAt` are marked `select: false` in
    `backend/models/User.js`, so a default `User.findById()` anywhere else
    in the codebase (e.g. a future route someone adds) can't accidentally
    load and leak them — the verification routes that *do* need the OTP
    fields explicitly opt back in via
    `.select('+mobileVerification.otpHash ...')`. This is defense-in-depth
    on top of the explicit-whitelist serializers
    (`toOwnVerificationStatusJSON()`/`toPublicVerificationBadges()` in
    `backend/utils/verificationUtils.js`), not a replacement for them.
  - **Photo verification reuses the existing mock photo-storage pattern,
    factored into a shared helper.** Rather than re-inlining the same
    URL/base64/data-URI validation `backend/routes/profile.js`'s
    `POST /me/photos` already has, pulled it into
    `backend/utils/mockImageUpload.js#resolveMockImageUrl()` and had
    `backend/routes/verification.js`'s photo/submit route call that. Left
    `profile.js` itself untouched (still has its own inline copy) to avoid
    touching a working, already-tested route in an unrelated task — a
    natural follow-up would be to have `profile.js` adopt the shared helper
    too, but that's out of scope here.
  - **Verification badges added to three call sites, not just the one the
    task named.** The task brief only explicitly named
    `GET /api/profile/:userId`, but the frontend brief separately asked for
    badges on Discovery and Matches cards too — since
    `backend/utils/profileSerializers.js#toPublicProfileJSON()` is already
    the shared "public profile" shape reused by
    `backend/routes/discovery.js`'s feed and (indirectly, via the same
    badge-boolean helper) `backend/routes/matches.js`'s `otherUser`, all
    three were updated together (each bulk-fetching verification status for
    its page of results in one query, not N+1) so the frontend requirement
    could actually be met without a follow-up backend task.
  - **`GET /api/profile/me` deliberately does NOT get verification badges
    added to it.** The caller's own badges are served by the already-built
    `GET /api/verification/status` instead, so verification data has one
    authoritative response shape rather than being duplicated (and
    potentially drifting) across two endpoints.
  - **Signup was not changed to collect a phone number.** The task
    described this as a flow that could reuse "whatever signup already
    captures" — signup (`backend/routes/auth.js`) is email/password only,
    so the mobile verification flow collects/confirms the phone number
    itself, via an optional `phone` field on `request-otp`. `users.phone`
    is therefore not unique-indexed (no cross-account collision check in
    this pass) — flagged as technical debt in PROJECT_STATE.md, since the
    original schema draft assumed phone-based signup which never happened.
- **Backend files touched:** `backend/constants/verificationOptions.js`
  (new), `backend/utils/verificationUtils.js` (new), `backend/utils/
  mockImageUpload.js` (new — shared with profile photos in spirit, not code,
  see above), `backend/routes/verification.js` (new — `POST mobile/
  request-otp`, `POST mobile/verify-otp`, `POST photo/submit`,
  `GET status`), `backend/models/User.js` (added `mobileVerification`/
  `photoVerification`), `backend/routes/profile.js` (public `GET /:userId`
  now includes badges), `backend/routes/discovery.js` (feed cards now
  include badges, bulk-fetched), `backend/routes/matches.js` (`otherUser`
  now includes badges, bulk-fetched), `backend/utils/profileSerializers.js`
  (`toPublicProfileJSON()` takes an optional verification-source param),
  `backend/server.js` (mounted `/api/verification`).
- **Frontend files touched:** `frontend/src/api.js` (four new verification
  calls), `frontend/src/components/VerificationBadge.jsx` (new),
  `frontend/src/pages/Verification.jsx` (new — status-driven mobile OTP +
  photo/selfie flows), `frontend/src/App.jsx` (added `/verification` route),
  `frontend/src/pages/Dashboard.jsx` (own badges + a "Get Verified"/
  "Verification" link), `frontend/src/pages/Settings.jsx` (Verification
  link), `frontend/src/pages/Discovery.jsx` (badges on discovery cards),
  `frontend/src/pages/Matches.jsx` (badges + a verified ring on the match
  list's Avatar).
- **Tests performed:**
  - Backend boots cleanly with the new `/api/verification` route group
    mounted alongside the existing six, no syntax/import errors.
  - Curled all four new routes with no/bad auth — all four return `401`.
  - A standalone Node script (38/38 checks, no live DB) directly exercised
    `backend/constants/verificationOptions.js`,
    `backend/utils/verificationUtils.js`, and
    `backend/utils/mockImageUpload.js` in isolation: OTP entropy/format,
    phone masking, phone-format validation, the pure sliding-window
    rate-limit check (allows under the cap, blocks at the cap, prunes
    entries outside the 10-minute window, exact-boundary pruning), OTP
    expiry math, both serializers never leaking any internal/moderation
    field even when the field is deliberately present on the input object,
    the mock image-upload validator's URL/base64/size-cap handling, and
    Mongoose schema-level checks — enum acceptance across all 5 statuses on
    both sub-documents, rejection of an invalid enum value, and (via
    `User.schema.path(...).options.select`) confirming the six internal
    fields are genuinely `select: false` while the client-safe fields are
    not.
  - A second standalone script built a REAL Express app mounting the ACTUAL
    `backend/routes/verification.js` file (only `backend/models/User.js`
    swapped for an in-memory fake via `require.cache` injection, since
    MongoDB is unreachable in this sandbox — same workaround pattern used
    for every DB-touching test in this project so far) and drove it over
    real HTTP with a real signed JWT: 33/33 checks covering request-otp
    (happy path, invalid-phone rejection, missing-phone rejection, rate
    limiting blocking exactly the 4th request in a 10-minute window,
    already-verified short-circuit, allowing verification of a genuinely
    different number even when already verified), verify-otp (correct OTP
    accepted and flips to `VERIFIED`, wrong OTP rejected without changing
    status, expired OTP rejected and flips status to `EXPIRED`, a used OTP
    cannot be replayed, missing OTP body rejected), photo/submit (happy
    path incl. the base64->data-URI path, `409` while already `PENDING`),
    and `GET /status` (correct shape, reflects real state, never leaks
    `otpHash`/`reviewNotes` even when both are deliberately present on the
    fake user).
  - That same request-otp flow was additionally run as a separate
    `NODE_ENV=production` process and confirmed the response body contains
    only `message`/`phone`/`expiresInSeconds` — no `devOtp` key at all —
    while the OTP is still logged server-side, directly verifying the
    "dev-only, never in production" requirement both ways.
  - Frontend `npm run build` and `npm run lint` both pass; no new lint
    warnings introduced (the two pre-existing `only-export-components`
    warnings in `AuthContext.jsx`/`NotificationContext.jsx` are unrelated
    and already an accepted pattern from prior sessions).
  - Not exercised (see PROJECT_STATE.md's Known Technical Debt): real
    MongoDB persistence of the new User fields (including confirming
    `select: false` behavior against an actual query rather than only the
    schema-level `.options.select` check), real concurrent-OTP-request
    races, and anything involving a real SMS/photo-moderation provider
    (neither exists — both are intentionally out of scope, see
    `MOCK_FEATURES.md`).
- **Next task:** Task #10 — Report/Block + Safety Center (see
  PROJECT_STATE.md's "Next Exact Task" for the full scope breakdown and the
  note that a TaskList tool was not available in this session to
  cross-check the internal task graph directly).

---

## 2026-08-17 — Notifications (Task #6) implemented

- **Phase:** Phase 6 — Notifications (docs/ROADMAP.md numbering; internal
  TaskList numbering for this same task was #8 — see the numbering note in
  PROJECT_STATE.md's "Next Exact Task").
- **Task:** Basic in-app notifications for match/like/message events, plus
  per-type preferences: a `Notification` model + REST API, notification
  creation wired into the existing swipe/match and message-send code paths,
  a live `notification:new` Socket.IO event, and a frontend bell/badge +
  dropdown notification center + a new minimal Settings page for the
  preference toggles. Real push delivery (Firebase Cloud Messaging) is
  explicitly out of scope for this pass and marked MOCK/TEMPORARY/deferred.
- **Design decisions:**
  - **No identity in `like` notifications.** Checked `docs/BUSINESS_PLAN.md`
    per the task brief — "see who liked you" is listed as a premium-tier
    (`CG_PLUS`/`CG_PRO`/`CG_ELITE`) reveal. A `like` notification's
    `payload` is therefore always `{}`; only a `match` notification (which
    already mutually reveals both sides) carries `fromUserId`/
    `fromUserName`. There's no premium-reveal code path yet (Subscription
    is Task #10/Phase 10, not started) — when it lands, it can add an
    *additional* enriched notification without changing this shape.
  - **Preferences live on `User`, not a new collection.** A
    `notificationPreferences` sub-document
    (`matchNotifications`/`likeNotifications`/`messageNotifications`, all
    default `true`) was added directly to `backend/models/User.js` — same
    simplification already used for the `role` field (`admin_users`) in
    `docs/DATABASE_SCHEMA.md`. Preference gating is enforced once, centrally,
    inside `backend/utils/notificationUtils.js#createNotification()` (via
    the pure, DB-independent `isNotificationTypeEnabled()`), not duplicated
    at each of the three trigger call sites.
  - **Safety-critical types can't be disabled — by construction, not by a
    runtime check.** `verification`/`safety`/`subscription` simply have no
    entry in `PREFERENCE_FIELD_BY_TYPE`
    (`backend/constants/notificationOptions.js`), so there's no field for a
    client to even attempt to toggle for them; `isNotificationTypeEnabled()`
    always returns `true` for any type not in that map. No code path creates
    those types yet (future phases), so this is future-proofing.
  - **Message-notification suppression reuses existing Socket.IO room
    bookkeeping.** Rather than adding separate presence tracking, every
    socket already auto-joins a per-match room (`match:<id>`) when actively
    viewing a chat (existing Task #5 behavior) — a new
    `backend/socket.js#isUserInRoom()` helper checks that room's connected
    sockets for the recipient before creating a `message` notification, so
    an already-open chat doesn't also produce redundant notification noise.
  - **New per-user Socket.IO room for delivery.** Every connected socket now
    also auto-joins `user:<userId>` on connect (`backend/socket.js`), a
    second room alongside the existing per-match ones. Emitting
    `notification:new` to a room with no connected sockets is a no-op, which
    is exactly "only push live if the recipient is actively connected" from
    the task spec — no separate online/presence check needed.
  - **Frontend socket lifecycle changed.** Previously only `Chat.jsx`
    connected the shared Socket.IO client (on mount) and disconnected it (on
    unmount) — fine when sockets only mattered inside a chat screen, but
    notifications need live delivery from *any* authenticated screen. The
    new `NotificationContext` now connects the socket for the whole
    authenticated session (as soon as `user` is set) and
    `AuthContext.logout()` is what disconnects it; `Chat.jsx` still
    connects defensively if needed but no longer tears the connection down
    on unmount. This is called out explicitly as a technical-debt item to
    re-verify once a real two-browser-session DB-backed test is possible.
- **Backend files touched:** `backend/models/Notification.js` (new),
  `backend/constants/notificationOptions.js` (new — `NOTIFICATION_TYPES`,
  `PREFERENCE_FIELD_BY_TYPE`, pagination defaults), `backend/utils/
  notificationUtils.js` (new — `createNotification()`,
  `isNotificationTypeEnabled()`, `toNotificationJSON()`),
  `backend/routes/notifications.js` (new — `GET /`, `GET /unread-count`,
  `GET`/`PUT /preferences`, `PATCH /read-all`, `PATCH /:id/read`),
  `backend/models/User.js` (added `notificationPreferences`),
  `backend/socket.js` (added `userRoomName()`/`isUserInRoom()`, auto-join on
  connect), `backend/routes/discovery.js` (match/like notification
  creation, wrapped in try/catch), `backend/routes/matches.js` (message
  notification creation with room-presence suppression, wrapped in
  try/catch), `backend/server.js` (mounted `/api/notifications`).
- **Frontend files touched:** `frontend/src/api.js` (six new notification
  API functions), `frontend/src/context/NotificationContext.jsx` (new),
  `frontend/src/components/NotificationBell.jsx` (new), `frontend/src/
  pages/Settings.jsx` (new), `frontend/src/App.jsx` (`/settings` route),
  `frontend/src/main.jsx` (`NotificationProvider` wraps `App`),
  `frontend/src/context/AuthContext.jsx` (`logout()` disconnects the shared
  socket), `frontend/src/socket.js` (comment update — lifecycle ownership
  changed, no code change), `frontend/src/pages/Chat.jsx` (no longer
  disconnects on unmount — see design decisions above), `frontend/src/
  pages/Dashboard.jsx` / `Discovery.jsx` / `Matches.jsx` (added
  `NotificationBell` to nav; Dashboard also gets a Settings link).
- **Tests performed:** Backend server boot-checked clean (all six route
  groups + Socket.IO, no import/syntax errors). Curled every new
  `/api/notifications*` route with no/bad auth → all `401`s, plus a
  regression check that pre-existing `/api/matches`/`/api/discovery/*`
  routes still correctly `401` (unaffected by this session's changes). A
  standalone Node script (38/38 checks, no live DB — same pattern as prior
  sessions) covered: full `Notification` schema validation (all 6 enum
  types, required-field rejection, invalid-type rejection, defaults,
  createdAt-only timestamps, both declared indexes present),
  `User.notificationPreferences` defaults + validation,
  `isNotificationTypeEnabled()`'s preference-gating logic across every
  combination (including proving safety-critical types can't be disabled
  even when every preference field is `false`), and `socket.js`'s
  `roomName()`/`userRoomName()`/`isUserInRoom()` helpers against a fake `io`
  object. A real `socket.io-client` connected a live JWT-authed socket
  against the running server specifically to exercise the new
  `socket.join(userRoomName(...))` connect-time line for real — connection
  succeeded, no server crash, clean server log. Frontend `npm run build`
  and `npm run lint` both pass (one pre-existing unrelated oxlint warning in
  `AuthContext.jsx` carried forward, plus an equivalent one now in the new
  `NotificationContext.jsx` for the same already-accepted
  hook-plus-component-in-one-file pattern). DB-touching behavior (actual
  notification persistence/pagination/preference-gating against real
  writes, a live `notification:new` broadcast reaching a real second
  browser session, the new socket lifecycle across a real login->navigate->
  logout cycle) could not be exercised end-to-end in this sandbox — see
  PROJECT_STATE.md's Known Technical Debt.
- **Docs updated:** `docs/DATABASE_SCHEMA.md` (`notifications` marked
  `[IMPLEMENTED]` with full field/index/divergence detail, new
  `notification_preferences` section describing the `User` sub-document,
  new "Real-time delivery" subsection), `docs/API_DOCUMENTATION.md`
  (Notifications section rewritten from `[PLANNED]` to `[IMPLEMENTED]` with
  full request/response contracts for all 6 routes plus the
  `notification:new` socket event and the trigger-point breakdown),
  `docs/ROADMAP.md` (Phase 6 row marked Complete), `TODO.md` (Notifications
  checklist items checked off, FCM push added as an explicit remaining
  item), `MOCK_FEATURES.md` (FCM push delivery entry rewritten to
  distinguish it from the now-real in-app notification system).
- **Next task:** Task #9 (internal TaskList numbering) / Phase 7 (docs/
  ROADMAP.md numbering) — Verification (mobile OTP + selfie/photo
  verification, verification badge on profiles). See PROJECT_STATE.md's
  "Next Exact Task" for full scope and the numbering-reconciliation note.

## 2026-08-17 — Chat (Task #5) implemented

- **Phase:** Phase 5 — Real-Time Chat
- **Task:** Real-time messaging between matched users: fleshed out the `Message`
  model, REST history/send/read-receipt endpoints nested under
  `/api/matches/:matchId/messages`, a Socket.IO real-time layer sharing the
  Express HTTP server with JWT handshake auth, typing indicators, and a full
  chat UI replacing the `ChatComingSoon.jsx` placeholder.
- **Design decisions (see doc updates below for full detail):** no separate
  `Conversation` collection — a `Match` already uniquely identifies a
  two-person conversation, so messages are queried by `match` directly;
  REST is the single write path for messages (`POST` persists, then emits
  `message:new` via Socket.IO to the match's room) rather than also
  accepting a `message:send` socket event, so there is exactly one code
  path that can ever create a `Message`; newest-first cursor pagination
  (`before=<messageId>`) for message history, chosen over offset pagination
  because it stays correct under concurrent inserts while scrolling back;
  read receipts persist via a REST `PATCH` (not a socket event) for the
  same single-write-path reason, but still broadcast a `message:read`
  socket event so the sender's UI updates live.
- **Backend files touched:** `backend/models/Message.js` (fleshed out from
  the placeholder — `match`/`sender`/`recipient`/`text`/`readAt`, required
  + trimmed + 1-2000-char text validation, compound indexes on
  `(match, createdAt)` and `(match, recipient, readAt)`),
  `backend/constants/chatOptions.js` (new — `MAX_MESSAGE_LENGTH`,
  pagination defaults, same convention as `discoveryOptions.js`),
  `backend/utils/matchUtils.js` (added `isParticipant()`/
  `otherParticipant()` — pure, DB-independent, shared by the REST message
  routes' authorization check and the Socket.IO `match:join` handler so
  both transports enforce identical rules), `backend/middleware/auth.js`
  (extracted `verifyToken()` out of `requireAuth` so socket auth can reuse
  the exact same JWT-verification logic instead of duplicating
  secret-handling), `backend/socket.js` (new — `initSocket()`: JWT
  handshake auth via the shared `verifyToken()`, `match:join`/`match:leave`
  room management with the same participant/unmatched authorization the
  REST routes use, ephemeral `typing:start`/`typing:stop` ->  `typing`
  re-broadcast, `roomName()` helper shared with `routes/matches.js`),
  `backend/routes/matches.js` (added `GET`/`POST /:matchId/messages` and
  `PATCH /:matchId/messages/read`, plus a shared `loadAuthorizedMatch()`
  helper — 400 invalid id, 404 no match, 403 not-a-participant, 403
  unmatched), `backend/server.js` (now creates an `http.Server`, mounts
  Socket.IO on it via `initSocket()`, attaches `io` to the Express app via
  `app.set('io', io)` so route handlers can broadcast after a REST write),
  `backend/package.json` (added `socket.io`).
- **Frontend files touched:** `frontend/src/pages/Chat.jsx` (new — replaces
  `ChatComingSoon.jsx` on the `/chat/:matchId` route; loads history via
  REST on mount, connects + authenticates a Socket.IO client, joins the
  match's room, listens for `message:new`/`typing`/`message:read`, sends
  via REST, auto-scrolls, shows a typing indicator, "load older messages"
  button using cursor pagination, marks incoming messages read), `frontend/
  src/components/ChatBubble.jsx` (new — sent/received bubble variants,
  timestamp, single/double-checkmark read-receipt indicator, per
  `docs/DESIGN_SYSTEM.md`'s component list), `frontend/src/socket.js` (new
  — a lazily-created, reused Socket.IO client singleton, authenticated with
  the stored JWT read fresh on every (re)connect), `frontend/src/api.js`
  (added `getMessages`/`sendMessage`/`markMessagesRead`), `frontend/src/
  App.jsx` (swapped the `ChatComingSoon` import/route for `Chat`),
  `frontend/src/components/MatchModal.jsx` ("Start a conversation" now
  navigates straight to `/chat/:matchId` when the new match's id is known,
  falling back to `/matches` otherwise), `frontend/src/pages/Discovery.jsx`
  (carries the newly-created match's id into `MatchModal` so the CTA above
  has something to route to), `frontend/src/pages/Matches.jsx` (comment
  update only — its link already pointed at `/chat/:matchId`), `frontend/
  src/pages/Dashboard.jsx` (removed the now-stale "chat coming soon" line),
  `frontend/package.json` (added `socket.io-client`); `frontend/src/pages/
  ChatComingSoon.jsx` deleted.
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`conversations` section
  rewritten to explain the Match-as-conversation simplification; `messages`
  moved to `[IMPLEMENTED]` with the full field list, index list, and
  divergence notes — `recipient` added, `status` replaced with nullable
  `readAt`, `attachmentUrl` not implemented); `docs/API_DOCUMENTATION.md`
  (Messaging section rewritten from `[PLANNED]` to `[IMPLEMENTED]` — full
  REST contract for all three routes plus the complete Socket.IO event
  list with payload shapes and the "REST is the single write path" design
  note); `docs/ROADMAP.md` (Phase 5 marked Complete; also brought Phases
  0-4's stale "Not Started" status markers up to date while touching this
  file, since they'd drifted from `PROJECT_STATE.md`'s actual completed-
  features list over the last few sessions); `MOCK_FEATURES.md` (two new
  entries: chat is text-only for this pass — not a mock, image/voice
  attachments were never in scope and are deferred to V2; matches list has
  no last-message preview/unread badge yet — a scope gap, not a mock);
  `TODO.md` (checked off all four Chat items with notes on what shipped).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded every model/route/
    `socket.js` file (no syntax/import errors). Started the server and
    confirmed it boots cleanly with Socket.IO mounted alongside Express, no
    regressions to the existing non-fatal "MongoDB connection error,
    continuing without a database connection" pattern. Curled the three new
    REST routes: no Authorization header -> `401` on all three; bad token
    -> `401` with the correct message; invalid-format `matchId` -> `400`;
    a well-formed but DB-unreachable `matchId` -> `500` after the same
    known Mongoose-buffering-timeout pattern prior phases already hit (not
    a new bug, see Known Technical Debt). Verified the pure/schema-level
    logic with a standalone Node script
    (`_tmp_verify_chat_logic.js`, run against the real model/util files, no
    `mongoose.connect()` call) — 29/29 checks passed, covering
    `isParticipant`/`otherParticipant` (including the fixed edge case where
    a non-participant used to get back an arbitrary other id instead of
    `null` — caught and fixed by this same test script during this
    session), the full 200/403/403-unmatched/404 authorization matrix,
    `roomName()` stability/namespacing, `verifyToken()` accept/reject-wrong-
    secret/reject-expired, and full `Message` schema validation (required
    fields, empty/whitespace text, trimming, exact max-length boundary).
    Additionally — beyond the "pure logic only" pattern prior phases used —
    ran a **live Socket.IO smoke test** with a real `socket.io-client`
    against the running server: no-token and bad-token connections both
    correctly reject with `connect_error`; a validly-signed token connects
    successfully; `match:join` with an invalid-format `matchId` is rejected
    via its ack callback; `match:join` for a well-formed but DB-unreachable
    `matchId` fails gracefully through its ack (`{ ok: false }`) rather than
    crashing the server (confirmed via the server's own log output, which
    showed the caught Mongoose buffering-timeout error, not an uncaught
    exception). All temporary verification scripts and the temporarily
    `--no-save`-installed `socket.io-client` dev dependency used only for
    this live socket test were removed from `backend/` afterward; confirmed
    via `git diff`/`git status` that `backend/package.json`/
    `package-lock.json` only carry the intended `socket.io` addition.
  - Frontend: `npm install` pulled in `socket.io-client` (saved to
    `package.json`), `npm run build` succeeded, `npm run lint` (oxlint)
    passed with only the same pre-existing, unrelated `AuthContext.jsx`
    warning carried forward from every prior phase. Also ran `npm run dev`
    and confirmed the Vite dev server boots cleanly and serves `200` for
    the app shell, confirming no import-time errors in the new
    `Chat.jsx`/`ChatBubble.jsx`/`socket.js` files.
- **Known limitation carried forward:** end-to-end DB-backed testing (two
  real matched users, actual message persistence + pagination against real
  seeded data, an actual two-client Socket.IO room broadcast where both
  sockets are backed by real authorized matches) was not possible in this
  sandbox for the same reason prior phases couldn't verify it either — no
  reachable MongoDB. What *was* newly verifiable in this session beyond
  prior phases' pattern is the full Socket.IO JWT-handshake auth path and
  graceful-failure behavior against the running server, via a live
  `socket.io-client`, since that layer doesn't require a DB connection to
  exercise up to the point where a DB read/write would actually happen.
- **Next task:** Task #6 — Notifications, per `docs/ROADMAP.md`'s canonical
  phase numbering (Notification schema/API, match/like/message notification
  events — this can reuse this session's Socket.IO infrastructure directly
  for real-time delivery instead of building a second real-time channel —
  and a basic in-app notification center UI).

---

## 2026-08-17 — Discovery + Matching (Task #4) implemented

- **Phase:** Phase 3 — Discovery + Matching
- **Task:** Swipe-based discovery feed with pagination/basic filters, Like/Pass
  API, mutual-like match detection with race-safe duplicate-match prevention,
  matches list, and the corresponding frontend (Discovery card stack, "It's a
  Match!" modal, Matches list, chat-coming-soon placeholder).
- **Backend files touched:** `backend/models/Like.js` (new — `fromUser`,
  `toUser`, `action` (`like`/`pass`), unique compound index on
  `(fromUser, toUser)`), `backend/models/Match.js` (fleshed out from the
  placeholder — `userA`/`userB` stored in canonical/sorted order via a
  `pre('validate')` hook so a compound unique index on `(userA, userB)` can
  prevent duplicate matches regardless of which direction the mutual like
  completed in; `users` convenience array kept for "matches involving me"
  queries; `isActive` replaced with `unmatched`/`unmatchedAt`/`unmatchedBy` per
  the product spec), `backend/utils/matchUtils.js` (new — pure, DB-independent
  `canonicalPair()`/`isMutualLike()` helpers, shared by the Match model and the
  swipe route, and directly unit-tested), `backend/constants/
  discoveryOptions.js` (new — `SWIPE_ACTIONS`, feed/matches pagination
  defaults), `backend/utils/profileSerializers.js` (new — `toOwnProfileJSON`/
  `toPublicProfileJSON` extracted out of `routes/profile.js` so discovery feed
  cards and match listings can reuse the exact same "public profile" shape
  instead of duplicating field lists; `routes/profile.js` behavior is
  unchanged, just its serializers moved), `backend/routes/discovery.js` (new —
  `GET /feed` with page-based pagination + `datingIntention`/`city` filters,
  excluding self/already-swiped/already-matched users, with a `TODO` for
  blocked-user exclusion once the Block model exists in a later task;
  `POST /swipe` records a like/pass, handles repeat-swipe as idempotent-200 vs.
  409-conflict rather than an ugly error, and creates a Match on mutual like
  with race-safety via the canonical-pair unique index), `backend/routes/
  matches.js` (new — `GET /` lists the caller's active matches with the other
  participant's basic profile info attached), `backend/server.js` (mounted
  `/api/discovery` and `/api/matches`).
- **Frontend files touched:** `frontend/src/pages/Discovery.jsx` (new — card
  stack with Like/Pass buttons, prefetches the next page as the queue runs
  low, shows `MatchModal` on a mutual match), `frontend/src/pages/
  Matches.jsx` (new — match list using `Avatar`/`Button`, links to a
  chat-coming-soon placeholder per Task #5 not having run yet),
  `frontend/src/pages/ChatComingSoon.jsx` (new — placeholder landing spot for
  a match's conversation), `frontend/src/components/MatchModal.jsx` (new —
  "It's a Match!" modal, clean/fast per `docs/DESIGN_SYSTEM.md`'s direction,
  "Start a conversation" CTA routes to `/matches` since chat isn't built),
  `frontend/src/pages/Dashboard.jsx` (added Discover/Matches nav links),
  `frontend/src/App.jsx` (new `/discover`, `/matches`, `/chat/:matchId`
  protected routes), `frontend/src/api.js` (added `getDiscoveryFeed`/`swipe`/
  `getMatches`, plus a small `toQueryString` helper).
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`likes` and `matches` sections
  moved from bare drafts to `[IMPLEMENTED]` with divergence notes — field
  renames to match the `Profile.user` ref convention, `action` enum
  simplified to `like`/`pass` (no `SUPER_LIKE` yet), `status` replaced with
  `unmatched`; `preferences` section updated to note it's still not a
  persisted collection — Discovery uses ad-hoc query params instead);
  `docs/API_DOCUMENTATION.md` (Discovery and Matching sections moved to
  `[IMPLEMENTED]` with full request/response/validation detail and explicit
  divergence notes — no separate `/api/likes` base path, `maxDistanceKm` not
  implemented, unmatch/"who liked you" not yet built); `MOCK_FEATURES.md`
  (noted the geo/distance-filtering gap — not a mock, a documented scope
  reduction, since the actual swipe/match logic is real); `TODO.md` (checked
  off Discovery feed API/UI, basic filters, Like/Pass API, mutual-match
  detection, match creation/screen; left unmatch and "who liked you" open).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded every model and route file
    (no syntax/import errors). Started the server (`node server.js`) and
    confirmed it boots cleanly with the same non-fatal "MongoDB connection
    error, continuing without a database connection" pattern as prior phases
    — not a regression. Curled the new endpoints: `GET /api/discovery/feed`,
    `POST /api/discovery/swipe`, `GET /api/matches` all return `401` with no
    Authorization header, and `GET /api/discovery/feed` with a bogus token
    returns the correct `{"message":"Invalid or expired token"}` — confirms
    `requireAuth` is correctly wired onto all three new routes. Verified the
    pure business logic that doesn't need a live DB with a standalone Node
    script (`/tmp/.../verify_matching_logic.js`, run against the real
    `Like`/`Match` model files and `matchUtils.js`, no mongoose connection):
    canonical pair ordering is order-independent; the `Match` model
    canonicalizes `userA`/`userB` identically regardless of construction
    order (verified via the real async `.validate()` path — note:
    `validateSync()` does **not** run `pre('validate')` middleware in this
    mongoose version, confirmed directly, so the script deliberately uses
    `.validate()`, which is also the only path the real app ever exercises via
    `.save()`); the `users`-array-length validator; `Like` schema enum/required
    validation; and a simulated end-to-end swipe flow (mutual like -> exactly
    one match, identical repeat swipe -> idempotent 200 not a new match,
    different repeat swipe -> 409 with the original decision preserved,
    unreciprocated third-party like -> no match, both swipe directions
    resolve to the identical canonical pair key) — 24/24 checks passed.
  - Frontend: `npm run build` succeeded; `npm run lint` (oxlint) passed with
    only the same pre-existing, unrelated `AuthContext.jsx` warning already
    noted in the Task #3 entry below.
- **Known limitation carried forward:** end-to-end DB-backed testing (create
  two accounts+profiles, swipe both directions, confirm exactly one Match
  document is created even under a simulated race, list matches, browse a
  filtered discovery feed against real seeded data) was not possible in this
  sandbox for the same reason prior phases couldn't verify it either — no
  reachable MongoDB. The compound unique indexes on `Like` and `Match` are
  schema-correct and their canonicalization logic is unit-tested, but have
  never been exercised against an actual MongoDB write conflict. This should
  be the first thing verified in an environment that does have DB access.
- **Next task:** Task #5 — Chat (Socket.IO server setup, Conversation +
  Message schemas — `Message` already exists as a placeholder needing the
  same treatment `Match` just got — real-time text chat UI, basic read
  receipts/delivery status). Wire it in place of `ChatComingSoon.jsx`.

---

## 2026-08-17 — Profile system (Task #3) implemented

- **Phase:** Phase 2 — Profile System
- **Task:** Full profile creation/editing: Mongoose `Profile` model, CRUD API, age
  derivation with an 18+ hard safety check, weighted profile-completion score, and a
  multi-step (single-page, section-based) profile builder UI wired into routing after
  login/signup.
- **Backend files touched:** `backend/models/Profile.js` (fully fleshed out —
  displayName, dateOfBirth/derived age, gender, interestedIn, datingIntention,
  city/district/state/location, profession, education, bio, interests, languages,
  lifestyle, personalityPrompts, photos, profileCompletionPercentage),
  `backend/routes/profile.js` (`GET/PUT /api/profile/me`, `GET /api/profile/:userId`,
  `POST /api/profile/me/photos`, all behind `requireAuth`),
  `backend/constants/profileOptions.js` (shared enums: genders, dating intentions,
  suggested CG district list, lifestyle enums, fixed personality-prompt bank),
  `backend/utils/profileUtils.js` (age calculation, 18+ check, completion-score
  calculation, completion hints — all pure functions, unit-testable without a DB),
  `backend/server.js` (mounted `/api/profile`, bumped JSON body limit to 10mb for the
  mock base64 photo path).
- **Frontend files touched:** `frontend/src/pages/ProfileBuilder.jsx` (new — single
  form with sections: basic info, dating intention, location, photos, bio/interests/
  lifestyle, personality prompts; used for both first-time creation and later editing,
  pre-filled via `GET /api/profile/me`), `frontend/src/pages/Dashboard.jsx` (now shows
  completion % + top hint + edit-profile CTA), `frontend/src/pages/Login.jsx` /
  `Signup.jsx` (post-auth routing: no profile yet -> `/profile/edit`, otherwise ->
  `/dashboard`), `frontend/src/components/Button.jsx` / `TextField.jsx` / `Avatar.jsx`
  (new reusable components per `docs/DESIGN_SYSTEM.md`'s component list — first three
  started, more to follow as later features need them), `frontend/src/constants/
  profileOptions.js` (frontend mirror of the backend enums), `frontend/src/api.js`
  (added `getMyProfile`/`saveMyProfile`/`getUserProfile`/`addProfilePhoto`),
  `frontend/src/App.jsx` (new `/profile/edit` protected route), `frontend/src/
  index.css` (design-system color tokens, light + dark via `prefers-color-scheme`,
  wired into Tailwind v4's `@theme`), `frontend/src/components/ProtectedRoute.jsx`
  (switched its loading state to the new tokens for consistency).
- **Doc updates:** `docs/DATABASE_SCHEMA.md` (`profiles` section rewritten to match
  the real implementation, with explicit divergence notes — most notably
  `datingIntention`'s enum values changed from the original draft, `interests`/
  `personalityPrompts` are free strings / a fixed in-code prompt bank rather than
  separate lookup collections, `photos` is embedded rather than a top-level
  collection, and `languages`/`lifestyle` are new fields not in the original draft);
  `docs/API_DOCUMENTATION.md` (Profile section moved from `[PLANNED]` to
  `[IMPLEMENTED]` with full request/response/validation detail); `MOCK_FEATURES.md`
  (documented the photo-upload mock path in detail — base64/URL stored directly on
  the profile document, no Cloudinary, no moderation).
- **Tests performed:**
  - Backend: `node -e "require(...)"` smoke-loaded the model and routes files
    (confirmed no syntax/import errors, and fixed a Mongoose duplicate-index warning
    along the way). Started the server (`node server.js`) and confirmed it boots
    cleanly and logs the same "MongoDB connection error, continuing without a
    database connection" pattern the auth phase already established — not a
    regression. Exercised `GET /api/health` (200), `GET /api/profile/me` without a
    token (401) and with a bogus token (401, correct message) — auth middleware is
    correctly wired onto the new routes. Attempted a real end-to-end signup ->
    profile create/fetch flow; MongoDB is unreachable in this sandbox (no local
    mongod, no Docker daemon running, and `mongodb-memory-server`'s binary download
    was blocked with a 403 through the outbound proxy) — DB-touching calls fail after
    a 10s Mongoose buffering timeout with the same generic 500 the pre-existing auth
    routes already produce in this same sandbox, so this is consistent prior
    behavior, not a new bug. Verified the pure logic that doesn't need a DB directly:
    age calculation (birthday-boundary cases), the 18+ gate, and the weighted
    completion-score calculation (0% empty, 100% fully filled) all via standalone
    Node scripts.
  - Frontend: `npm install` (no new deps needed — no multer, no extra packages
    pulled in), `npm run build` succeeded, `npm run lint` (oxlint) passed with no new
    warnings (one pre-existing warning in `AuthContext.jsx`, unrelated to this
    change).
- **Known limitation carried forward:** end-to-end DB-backed testing (signup -> login
  -> create profile -> fetch own profile -> fetch another user's public view -> add a
  photo) was not possible in this sandbox for the same reason the auth phase couldn't
  verify it either — no reachable MongoDB. This should be the first thing verified in
  an environment that does have DB access, before or alongside starting Task #4.
- **Next task:** Task #4 — Discovery + Matching (discovery feed API with pagination
  and filters, Like/Pass API, mutual-match detection, discovery feed UI, and the
  `preferences` collection deferred out of the Profile phase).

---

## 2026-08-17 — Authentication system (in progress)

- **Phase:** Phase 1 — Authentication + User System
- **Task:** Implement signup/login/JWT-based authentication (backend routes + middleware,
  frontend auth pages/context), being done by a parallel background agent.
- **Files touched (so far):** `backend/routes/auth.js`, `backend/middleware/auth.js`,
  `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/Login.jsx`,
  `frontend/src/pages/Signup.jsx`, `frontend/src/components/ProtectedRoute.jsx`,
  `frontend/src/pages/Dashboard.jsx`, `frontend/src/api.js`, `backend/routes/health.js`
  (commit `3f440ca` and possibly later commits — check `git log` for the latest state).
- **Tests performed:** Not yet confirmed/verified by this session — see the auth agent's
  own commits/notes for what was tested on their side.
- **Next task:** Confirm the signup -> login -> `GET /api/auth/me` flow works end to end,
  then begin the Profile system (Task #3): Profile Mongoose schema, create/edit profile
  API, multi-step profile builder UI.

---

## 2026-08-17 — Documentation set added

- **Phase:** Phase 0 — Foundation (docs track, run in parallel with Phase 1 code work)
- **Task:** Added the full baseline documentation set: `PROJECT_STATE.md`,
  `IMPLEMENTATION_PROGRESS.md` (this file), `TODO.md`, `BUGS.md`, `SETUP.md`,
  `MOCK_FEATURES.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`,
  `docs/API_DOCUMENTATION.md`, `docs/SCREEN_MAP.md`, `docs/DESIGN_SYSTEM.md`,
  `docs/ROADMAP.md`, `docs/BUSINESS_PLAN.md`, `docs/TESTING_STRATEGY.md`.
- **Files touched:** all files listed above (new files only — no application code touched).
- **Tests performed:** N/A (documentation only); confirmed no `backend/` or `frontend/`
  source files were modified.
- **Next task:** Keep this log and `PROJECT_STATE.md` updated as each future phase/task
  completes; revisit docs once the Profile system (Task #3) lands to mark those API/DB
  sections as implemented instead of planned.

---

## 2026-08-?? — Project scaffold (commit `fd72a17`)

- **Phase:** Phase 0 — Foundation
- **Task:** Scaffold the initial repo: Express backend skeleton and Vite + React +
  Tailwind frontend skeleton, with placeholder Mongoose models and a landing page.
- **Files touched:** `backend/server.js`, `backend/routes/`, `backend/models/User.js`,
  `backend/models/Profile.js`, `backend/models/Match.js`, `backend/models/Message.js`,
  `backend/.env.example`, `backend/package.json`, `frontend/` (Vite + React + Tailwind
  app with placeholder "CG Dating" landing page), root `README.md`, root `.gitignore`.
- **Tests performed:** Backend server starts cleanly; frontend builds cleanly.
- **Next task:** Implement authentication (signup/login/JWT).

---

## 2026-08-?? — Repository and GitHub setup

- **Phase:** Phase 0 — Foundation
- **Task:** Create the GitHub repository (`CG-Dating-App`) and initialize it with an
  initial commit (`95aeb5b`), set up the working branch
  `claude/new-dating-app-repo-r8al13`.
- **Files touched:** initial repo setup (no application files yet).
- **Tests performed:** N/A.
- **Next task:** Scaffold backend and frontend (see scaffold entry above).
