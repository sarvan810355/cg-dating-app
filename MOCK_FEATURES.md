# Mock / Temporary Features

This file tracks anything in the codebase that is mocked, stubbed, disabled, or
otherwise not a real production implementation yet, so nobody mistakes a placeholder
for a finished feature. Update this checklist as real implementations replace mocks —
move items to "Resolved" rather than deleting them, so there's a record of what changed.

## Currently Mocked / Not Yet Configured

- [ ] **MongoDB connection is optional/non-fatal in dev.** The backend does not yet hard-fail
      startup if `MONGODB_URI` is missing or unreachable in this sandbox; no real database
      (local or Atlas) has been provisioned/verified yet. Any route that touches the DB will
      not work correctly until a real connection is configured and verified.
- [ ] **Cloudinary (media storage) — no credentials configured.** Photo upload UI/API is not
      implemented yet; when it is, it must use Cloudinary rather than storing files in
      MongoDB or on local disk. No account/keys exist yet.
- [ ] **Firebase Cloud Messaging (push notifications) — no credentials configured.** Not
      implemented yet.
- [ ] **Razorpay (payments/subscriptions) — no credentials configured.** Subscription plans
      and paywall UI are planned as part of MVP, but real payment processing may ship as
      MOCK/TEMPORARY first (e.g. a fake "success" entitlement toggle) if Razorpay isn't
      wired up in time — any such mock MUST be labeled clearly in code comments and in this
      file, and entitlement checks must still happen server-side even in mock mode.
- [ ] **Anthropic Claude API (AI features) — no credentials configured.** AI Icebreakers,
      Why-You-Match, Profile Coach, Date Ideas are all V2 scope and not started.

## Resolved (mocks replaced with real implementations)

None yet.
