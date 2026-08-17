# Design System — CG-Dating-App

## Direction

Premium, clean, modern, warm, and trustworthy — explicitly **not** a cheap
gradient-heavy template and **not** a Tinder clone. The brand should read as local
(Chhattisgarh-first), safe, and serious about real connections, while still feeling
contemporary and inviting rather than corporate or clinical. Full light and dark mode
support is required on every screen — dark mode is designed intentionally, not produced
by simply inverting light-mode colors.

Tagline direction: *"Real People. Real Profiles. Real Compatibility. Real Connections."*
Differentiators to reflect visually: Local + Verified + Compatible + Safe + Meaningful.

## Color Tokens

### Light mode

| Token | Hex | Usage |
|---|---|---|
| `color-primary` | `#E11D48` (deep modern rose/coral) | Primary actions, brand accents, active states |
| `color-primary-hover` | `#BE123C` | Hover/pressed state of primary |
| `color-primary-subtle` | `#FFE4E9` | Primary-tinted backgrounds (chips, highlights) |
| `color-secondary` | `#D9A47A` (warm neutral / terracotta-sand) | Secondary accents, illustrations |
| `color-background` | `#FFFBF9` (soft white, warm-tinted) | App background |
| `color-surface` | `#FFFFFF` | Cards, sheets, modals |
| `color-border` | `#EDE3DE` | Dividers, card borders |
| `color-text-primary` | `#1F1315` | Primary text |
| `color-text-secondary` | `#6B5A57` | Secondary/muted text |
| `color-success` | `#15803D` (trust-oriented green) | Verification badges, success states |
| `color-warning` | `#D97706` (amber) | Warnings, pending states |
| `color-error` | `#DC2626` (red) | Errors, destructive actions |

### Dark mode (intentional, not inverted)

| Token | Hex | Usage |
|---|---|---|
| `color-primary` | `#FB7185` | Primary actions (lightened rose for dark contrast) |
| `color-primary-hover` | `#F43F5E` | Hover/pressed |
| `color-primary-subtle` | `#3B1420` | Primary-tinted backgrounds |
| `color-secondary` | `#E3B993` | Secondary accents |
| `color-background` | `#161012` (premium near-black, warm-tinted, not pure black) | App background |
| `color-surface` | `#201A1C` | Cards, sheets, modals |
| `color-border` | `#332A2C` | Dividers, card borders |
| `color-text-primary` | `#F5EEEC` | Primary text |
| `color-text-secondary` | `#B7A6A2` | Secondary/muted text |
| `color-success` | `#4ADE80` | Verification badges, success states |
| `color-warning` | `#FBBF24` | Warnings, pending states |
| `color-error` | `#F87171` | Errors, destructive actions |

**Dark mode principle:** don't just drop opacity/invert light values — dark surfaces get
a warm near-black rather than pure black or pure gray, semantic colors (success/warning/
error/primary) are individually re-tuned for sufficient contrast and to avoid looking
neon, and elevation is communicated via subtly lighter surface tokens rather than shadows
(which read poorly on dark backgrounds).

## Typography

- **Direction:** a clean, humanist sans-serif for warmth and readability (e.g. Inter,
  General Sans, or similar) for UI text; consider a distinctive but still readable
  display face for the wordmark/hero moments only, not body text.
  - Use Devanagari-compatible font fallbacks (e.g. Noto Sans) so Hindi/Chhattisgarhi
    names, prompts, and any transliterated content render correctly.
- **Scale (suggested, rem-based, mobile-first):**
  - `text-xs` 0.75rem — captions, meta text
  - `text-sm` 0.875rem — secondary body, form helper text
  - `text-base` 1rem — body text
  - `text-lg` 1.125rem — emphasized body, card titles
  - `text-xl` 1.25rem — section headings
  - `text-2xl` 1.5rem — screen titles
  - `text-3xl` 1.875rem — hero/onboarding headlines
- Weight usage: 400 body, 500 emphasized/labels, 600–700 headings, avoid overusing bold
  (keeps the "premium, not shouty" tone).

## Spacing Scale

4px base unit, consistent with Tailwind defaults:
`0, 2px, 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px`
(`space-0` through roughly `space-16` in Tailwind's numeric scale). Card padding
defaults to 16–24px; screen horizontal padding defaults to 16–20px on mobile.

## Reusable Component Library

- **Button** — primary/secondary/ghost/destructive variants, loading state, icon slot.
- **TextField** — label, helper text, error state, leading/trailing icon slot.
- **ProfileCard** — photo, name/age, city/district, dating-intention chip, verification badge.
- **MatchCard** — compact variant for match lists/animation.
- **Avatar** — circular photo with fallback initials, verification badge overlay slot.
- **Badge** — generic pill for tags/status (e.g. plan tier, "New").
- **BottomSheet** — mobile-first modal-from-bottom for actions/filters/detail peeks.
- **Modal** — centered overlay dialog for larger content (used sparingly, mobile-first).
- **Dialog** — confirmation/alert pattern (e.g. "Unmatch this person?").
- **Toast** — transient success/error/info feedback.
- **Loading** — spinner/skeleton states for async content.
- **EmptyState** — illustration + message + optional CTA for empty lists (no matches yet, etc).
- **ErrorState** — illustration + message + retry CTA for failed loads.
- **VerificationBadge** — small trust indicator shown on verified profiles/photos.
- **CompatibilityBadge** — shows match/compatibility signal (esp. once AI "Why You
  Match" ships in V2).
- **ChatBubble** — sent/received variants, timestamp, read-receipt indicator.

All components must support both color modes via the token set above (no
component-local hardcoded hex values) and be built mobile-first, matching the PWA's
primary usage context.

## Bottom Navigation

`Home | Discover | Likes | Matches | Profile` — five-tab bottom nav, active tab uses
`color-primary`, inactive tabs use `color-text-secondary`. Admin (`/admin`) is a
separate, role-gated area outside this nav, reached via account/settings for admin users.
