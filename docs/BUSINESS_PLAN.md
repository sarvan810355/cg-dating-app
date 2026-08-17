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
- **Premium tiers** — `CG_PLUS`, `CG_PRO`, `CG_ELITE` (names and pricing admin-editable,
  never hardcoded) — add: unlimited likes, advanced filters, "see who liked you", profile
  boost, incognito/invisible browsing, advanced compatibility features.
- Payments processed via Razorpay (India-first, UPI support); entitlement is always
  validated server-side via webhooks, never trusted from the client.

## Growth Strategy

- **Launch sequencing:** Raipur + Bhilai-Durg + Bilaspur first, then expand district by
  district across Chhattisgarh, then statewide, then national (later phase).
- **Local marketing channels:** Instagram, YouTube, local influencers, college
  ambassador programs, and a referral program ("Invite & Earn", V2 scope).
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
