# Screen Map — CG-Dating-App

Condensed list of all planned screens, grouped by flow. One line each on purpose.
Status of implementation is tracked separately in `PROJECT_STATE.md` / `TODO.md` — this
document is about scope/structure, not build status.

## Onboarding

| Screen | Purpose |
|---|---|
| Splash / Welcome | First launch branding + entry point to signup/login. |
| Signup | Create an account (email/phone + password, or OTP-first flow). |
| OTP Verification | Verify mobile number via one-time code. |
| Age Confirmation | Confirm the user is 18+ before proceeding (hard gate). |
| Gender | Select the user's own gender. |
| Dating Preference | Who the user wants to see (gender preference for matches). |
| Dating Intention | Dating / Serious Relationship / Marriage / Friendship — first-class field driving matching. |
| Name | Enter display name. |
| Date of Birth | Enter DOB (used to compute age, never shown raw beyond what's needed). |
| Location | City/district selection (any CG district/town, not just major cities). |
| Profession | Optional profession/job title. |
| Education | Optional education field. |
| Interests | Multi-select from the interests reference list. |
| Personality Prompts | Answer a few personality prompts to add depth beyond photos. |
| Photo Upload | Upload profile photos (Cloudinary-backed). |
| Verification | Kick off selfie/photo verification for a trust badge. |
| Profile Completion | Summary screen showing profile strength score before entering the app. |

## Core

| Screen | Purpose |
|---|---|
| Home | Landing surface after login; quick access to Discover/Matches/Chat. |
| Discovery | Card/list feed of candidate profiles with like/pass actions and filters. |
| Profile Detail | Full view of another user's profile (photos, bio, prompts, compatibility). |
| Likes | See who liked the caller (premium-gated) and who the caller has liked. |
| Match Animation | Celebratory screen shown on a new mutual match. |
| Chat | Real-time 1:1 conversation with a match. |
| Voice Call | In-chat voice calling (V2+). |
| Video Call | In-chat video calling (V2+). |

## Local / Extra

| Screen | Purpose |
|---|---|
| Date Planner | Suggest/plan a date with a match (V2). |
| Safe Date | Safety timer, check-in, and trusted-contact flow for in-person meetups (V2). |
| Events | CG Connect — local events discovery and RSVP (V3). |
| Notifications | Centralized feed of match/like/message/system notifications. |
| Subscription | Plan comparison and upgrade flow (CG_PLUS / CG_PRO / CG_ELITE). |
| Boost | Temporarily increase profile visibility in discovery (V2). |

## Account

| Screen | Purpose |
|---|---|
| Settings | Account-level settings (notifications, preferences, theme, etc). |
| Privacy | Privacy controls (e.g. incognito/invisible browsing in V2). |
| Safety Center | Central hub for safety resources, report/block shortcuts, safe-dating tips. |
| Report | Report a user with a reason and details. |
| Block | Block a user, hiding them from discovery/messaging both ways. |
| Help Center | FAQs and support contact. |
| Account Deletion | Self-service account deletion flow with confirmation. |

## Admin

| Screen | Purpose |
|---|---|
| Admin Dashboard | Landing page for role-gated `/admin` area; high-level metrics. |
| Reports Queue | Review and resolve/dismiss user reports. |
| Verification Review | Approve/reject pending photo/selfie verification submissions. |
| User Management | Suspend/ban/unban users; view user detail as an admin. |
| Moderation Log / Audit Log | Read-only history of admin actions for accountability. |
| Analytics | Growth/engagement/retention/conversion metrics (role: `ANALYST`+). |
| Plan & Pricing Management | Admin-editable subscription plan pricing/features. |
| Events Management | Create/manage local events (V3, CG Connect). |
