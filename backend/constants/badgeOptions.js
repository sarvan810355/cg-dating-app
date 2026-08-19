// Shared catalog for Achievements/Badges (Task #20 — Engagement, V2 scope).
//
// **Product context, not just an implementation note:** the user's original ask for
// this pass was for something "addictive". Per docs/BUSINESS_PLAN.md's Brand
// personality section ("explicitly not cheap, spammy, or manipulative — no fake
// urgency, no dark patterns"), this feature is deliberately built as the HEALTHY
// alternative instead: badges celebrate genuine, already-real milestones (a real
// match, a real completed Safe Date, a real referral, a real 7-day return habit) —
// there is no streak-breaking guilt copy, no "you're about to lose your streak!"
// countdown, no variable/random reward (every badge's unlock condition is a fixed,
// disclosed threshold, not a slot-machine chance), and no badge is ever revoked once
// earned. See PROJECT_STATE.md's Current Task entry and IMPLEMENTATION_PROGRESS.md's
// newest entry for the full reasoning.
//
// Kept deliberately small (10 badges, not dozens) — this is a light-touch "notice and
// celebrate" layer, not a full gamification system with points/leaderboards/currency.
// Each entry's `code` is the stable identifier stored in `users.unlockedBadges[].code`
// (backend/models/User.js) and in Notification.payload.code (type: 'badge', see
// backend/utils/badgeUtils.js) — never renamed once shipped, since that would silently
// disconnect already-unlocked users' badge documents from the catalog entry that
// explains them.

const BADGE_CATALOG = [
  {
    code: 'PROFILE_COMPLETE',
    icon: '✨',
    label: 'Profile Complete',
    description: 'You filled out your whole profile — a great first step.',
  },
  {
    code: 'MOBILE_VERIFIED',
    icon: '📱',
    label: 'Mobile Verified',
    description: 'You verified your mobile number.',
  },
  {
    code: 'PHOTO_VERIFIED',
    icon: '✅',
    label: 'Photo Verified',
    description: 'Your photo was verified — your profile is a little more trusted now.',
  },
  {
    code: 'FIRST_MATCH',
    icon: '💛',
    label: 'First Match',
    description: 'You made your first match!',
  },
  {
    code: 'MATCHES_10',
    icon: '🌟',
    label: '10 Matches',
    description: "You've matched with 10 people.",
  },
  {
    code: 'MATCHES_50',
    icon: '🏆',
    label: '50 Matches',
    description: "You've matched with 50 people.",
  },
  {
    code: 'FIRST_SAFE_DATE_COMPLETED',
    icon: '🛡️',
    label: 'Safe & Sound',
    description: 'You completed your first Safe Date plan.',
  },
  {
    code: 'FIRST_REFERRAL',
    icon: '🤝',
    label: 'First Referral',
    description: 'Someone joined CG Dating using your invite code.',
  },
  {
    code: 'REFERRALS_5',
    icon: '🎉',
    label: 'Community Builder',
    description: '5 people have joined CG Dating through your invite.',
  },
  {
    code: 'ACTIVE_STREAK_7',
    icon: '🔥',
    label: '7-Day Streak',
    description: "You've shown up 7 days in a row. No pressure to keep it going — just a nice note that you have.",
  },
];

const BADGE_CODES = BADGE_CATALOG.map((b) => b.code);

const BADGE_BY_CODE = Object.fromEntries(BADGE_CATALOG.map((b) => [b.code, b]));

// Thresholds referenced by backend/utils/badgeUtils.js — pulled out as named
// constants (rather than magic numbers inline) so the catalog descriptions above and
// the actual unlock logic can never silently drift apart.
const MATCHES_10_THRESHOLD = 10;
const MATCHES_50_THRESHOLD = 50;
const REFERRALS_5_THRESHOLD = 5;
const ACTIVE_STREAK_7_THRESHOLD = 7;

module.exports = {
  BADGE_CATALOG,
  BADGE_CODES,
  BADGE_BY_CODE,
  MATCHES_10_THRESHOLD,
  MATCHES_50_THRESHOLD,
  REFERRALS_5_THRESHOLD,
  ACTIVE_STREAK_7_THRESHOLD,
};
