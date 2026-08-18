# Business Plan — CG-Dating-App

## Positioning

CG-Dating-App ("CG Dating") is a Chhattisgarh-first dating and relationship platform.
Tagline direction: *"Real People. Real Profiles. Real Compatibility. Real Connections."*
Core differentiators: **Local + Verified + Compatible + Safe + Meaningful.**

Target audience: 18+ users across Chhattisgarh, starting with Raipur, Bhilai, Durg,
Bilaspur, Korba, Raigarh, Rajnandgaon, Jagdalpur, Ambikapur, Dhamtari, and all other
districts/towns — the product and architecture must not hardcode support to only the
major cities. The product supports dating, serious relationships, marriage/life-partner
search, and friendship, with dating intention as a first-class field.

## Revenue Model — Freemium

- **Free tier** must remain genuinely usable, not a crippled trial: profile creation,
  discovery, a limited number of daily likes, matches, messaging with matches, basic
  filters, and basic (OTP + selfie) verification are all available for free.
  **Implemented limit (Task #12 — Subscription scaffolding):** **20 likes per UTC
  calendar day** (passes/"not interested" swipes are unlimited — only a "like" counts
  against the quota). Enforced server-side in `POST /api/discovery/swipe`
  (`backend/routes/discovery.js`) via `backend/utils/entitlementUtils.js#tryConsumeDailyLike()`,
  tracked on `users.dailyLikeCount`/`lastLikeCountReset` (see
  `docs/DATABASE_SCHEMA.md`). A caller with the `unlimited_likes` plan feature (every
  paid tier below has it) bypasses the limit entirely. Hitting the limit returns a
  `429` with `upgradeRequired: true` rather than a generic error — see
  `docs/API_DOCUMENTATION.md`'s §9 for the exact response shape and
  `frontend/src/pages/Discovery.jsx` for the upgrade prompt this drives.
- **Premium tiers** — `CG_PLUS`, `CG_PRO`, `CG_ELITE` (names and pricing admin-editable,
  never hardcoded — see the `plans` collection in `docs/DATABASE_SCHEMA.md`) — add:
  unlimited likes, advanced filters, "see who liked you", profile boost,
  incognito/invisible browsing, advanced compatibility features. **Implemented seed
  pricing** (MVP placeholder, admin-editable — see `docs/DATABASE_SCHEMA.md`'s `plans`
  section for how): CG Plus ₹299/month (unlimited likes, advanced filters), CG Pro
  ₹599/month (adds see-who-liked-you, boost), CG Elite ₹999/month (adds incognito). Of
  these five feature flags, only `unlimited_likes` is actually enforced anywhere in the
  codebase so far (see above) — the rest are stored/served by `GET /api/plans` but have
  no gated code path yet, same "documented scope boundary" pattern as other
  not-yet-wired features elsewhere in this project (see `MOCK_FEATURES.md`).
- Payments processed via Razorpay (India-first, UPI support); entitlement is always
  validated server-side via webhooks, never trusted from the client. **Not yet true in
  this pass:** Task #12 shipped a MOCK checkout (`POST /api/subscription/subscribe`
  activates immediately, no real payment/webhook involved) — entitlement *checks* are
  already fully server-side and DB-backed (`hasFeature()`, never a client claim), but
  the *checkout* itself is not yet real Razorpay. See `MOCK_FEATURES.md`'s Razorpay
  entry before this ships to real users.

## Growth Strategy

- **Launch sequencing:** Raipur + Bhilai-Durg + Bilaspur first, then expand district by
  district across Chhattisgarh, then statewide, then national (later phase).
- **Local marketing channels:** Instagram, YouTube, local influencers, college
  ambassador programs, and a referral program ("Invite & Earn", V2 scope).
  **Implemented (Task #17):** every user gets a unique, human-shareable
  referral code at signup. When someone signs up using another user's code,
  **both the referrer and the new referee are granted 7 days of `CG_PLUS`**
  (currently priced at ₹299/month, see the seed pricing above), via the same
  `Subscription`/`Plan`/`hasFeature()` entitlement system that powers real
  paid plans — not a separate points/credits currency. Chosen over an
  invented currency (e.g. "boost credits") specifically because no such
  currency existed elsewhere in the codebase at implementation time, and
  reusing Task #12's already-server-side-validated entitlement system avoids
  a second, parallel "what can this user do" mechanism the rest of the
  product would need to learn about. 7 days is deliberately modest — enough
  to be a genuinely felt, shareable incentive (unlimited likes + advanced
  filters for a week) without materially cannibalizing paid conversions for
  either the referrer or the referee, and short enough that a determined
  self-referral-loop abuser (creating throwaway accounts to farm rewards)
  gains very little per cycle relative to the effort, on top of the
  anti-abuse protections below. A referral relationship is permanent and
  one-time per referee (schema-enforced, not just app logic — see
  `docs/DATABASE_SCHEMA.md`'s `referrals` section), and an invalid/mistyped
  referral code at signup never blocks account creation, only silently skips
  the reward (see `docs/API_DOCUMENTATION.md`'s Section 13 for the full
  route contract). See `MOCK_FEATURES.md` for what's still a scope
  reduction here (no real dynamic-link/deferred-deep-link infrastructure —
  the "shareable link" is a plain copyable code + message, not a trackable
  URL).
- **Brand personality:** modern, local, trustworthy, premium, respectful, safe —
  explicitly **not** cheap, spammy, or manipulative (e.g. no fake urgency, no dark
  patterns around payments or "who liked you" reveals).

## Success Metrics

The product intentionally does **not** optimize for or headline raw swipe volume.
Metrics that matter more:

- Match-to-conversation rate (matches that turn into an actual first message)
- Conversation response rate (replies received, not just sent)
- Verified-user rate (share of active users with a verification badge — core to trust)
- D30 retention
- Premium conversion rate

These metrics should be exposed on the admin analytics dashboard (`docs/API_DOCUMENTATION.md`
§12, `docs/SCREEN_MAP.md` Admin > Analytics) once analytics is built (V3 scope, though
basic event tracking can start earlier).

## Trust & Safety as a Business Lever

Given the differentiators are "Verified + Safe" as much as "Local + Compatible", safety
features (verification, report/block, Safety Center, Safe Date mode, admin moderation)
are not just compliance checkboxes — they are core to the brand promise and should be
resourced accordingly rather than treated as an afterthought relative to growth features.
