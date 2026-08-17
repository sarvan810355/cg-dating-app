# Testing Strategy — CG-Dating-App

No automated test suite exists yet in either `backend/` or `frontend/` (see
`SETUP.md` — `npm test` is planned for Phase 13). This document defines the strategy to
implement once that phase begins, and should guide test-writing incrementally as each
feature lands rather than being deferred entirely to the end.

## 1. Unit Tests

Focus on business logic that is easy to get subtly wrong and expensive to get wrong in
production:

- Matching/compatibility score calculation
- Entitlement checks (does this user's current plan allow this action?)
- Profile strength score computation
- Discovery filter logic (age range, distance, dating intention matching)
- Input validators (email/password rules, OTP format, file upload type/size checks)

## 2. Integration Tests

Exercise real API/DB/auth interactions (against a test database, never production):

- Auth endpoints: signup, login, `/me`, token expiry/invalid-token handling
- Profile CRUD against MongoDB (via Mongoose)
- Discovery feed pagination and filtering against seeded data
- Like/Pass -> Match creation flow end-to-end at the API layer
- Messaging: send message -> persisted -> retrievable via history endpoint
- Report/Block: creating a report/block and confirming its effect on discovery/matching
- Admin routes: role enforcement (a `MODERATOR` cannot access `SUPER_ADMIN`-only routes)
- Payment webhook handling: signature verification, entitlement update idempotency

## 3. UI Tests (critical flows)

End-to-end coverage of the flows that most directly affect user trust and revenue:

- Signup
- Login
- Profile creation (full onboarding multi-step flow)
- Discovery (viewing and filtering the feed)
- Like (and resulting match when mutual)
- Chat (sending/receiving a message in real time)
- Report (reporting a user)
- Block (blocking a user, confirming they disappear from discovery)
- Verification (submitting OTP/selfie verification)
- Subscription (viewing plans, initiating a purchase/upgrade)
- Account deletion (confirming the flow and its irreversibility warning)

## 4. Security Tests

- Auth bypass attempts (calling protected routes without/with malformed/expired tokens)
- Authorization checks (a normal user attempting admin-only or other-user-only actions,
  e.g. reading someone else's private profile fields, deleting someone else's photo)
- Rate limit checks on auth, OTP, messaging, and AI endpoints
- Input validation / injection attempts on all endpoints accepting user input
- File upload validation (rejecting disallowed types/oversized files, no direct
  execution of uploaded content)
- Sensitive field exposure checks (password hash, exact address, government ID,
  internal trust score, private admin notes must never appear in API responses —
  cross-reference `docs/DATABASE_SCHEMA.md`)
- Payment/entitlement trust checks (client cannot self-grant a premium plan without a
  verified webhook)

## 5. Regression Tests

Every bug logged in `BUGS.md` that gets fixed should get a corresponding regression
test (unit, integration, or UI, whichever level actually would have caught it) linked
from the bug's `Regression test` field, so the same bug cannot silently reappear.

## 6. Tooling (to be finalized in Phase 13)

Suggested starting point, to confirm/adjust when Phase 13 begins:

- **Backend:** Jest or Vitest + Supertest for API/integration tests, `mongodb-memory-server`
  (or a dedicated test DB) for isolated DB tests.
- **Frontend:** Vitest + React Testing Library for component/unit tests; Playwright (or
  Cypress) for critical-flow end-to-end UI tests.
- **CI:** run the full suite on every PR before merge once the suite exists; block merges
  on failing tests for `main`/release branches.
