// Achievements/Badges — Task #20 (Engagement, V2 scope). See
// backend/constants/badgeOptions.js's top comment for the product-context
// writeup (this feature is the deliberately non-manipulative alternative to
// an original "make it addictive" request — every badge celebrates a
// genuine, already-real milestone; nothing here creates urgency, guilt, or a
// variable/random reward).
//
// **No scheduler, same established pattern as SafeDate's read-time
// reminder/Task #16's Boost — this codebase has no job queue anywhere.**
// Badge checks are cheap, targeted, inline calls hooked into the exact
// routes where the underlying event already happens (a match created, a
// verification approved, a Safe Date completed, a referral granted, a
// login), NOT a periodic batch job scanning every user. See each call site
// (backend/routes/discovery.js, verification.js, admin.js, safeDates.js,
// auth.js, profile.js) for exactly where.

const User = require('../models/User');
const Profile = require('../models/Profile');
const Match = require('../models/Match');
const SafeDate = require('../models/SafeDate');
const { createNotification } = require('./notificationUtils');
const { isSameUtcDay } = require('./entitlementUtils');
const {
  BADGE_BY_CODE,
  MATCHES_10_THRESHOLD,
  MATCHES_50_THRESHOLD,
  REFERRALS_5_THRESHOLD,
  ACTIVE_STREAK_7_THRESHOLD,
} = require('../constants/badgeOptions');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Pure-ish (only mutates the passed-in `user` document, does not save it —
// the caller, backend/routes/auth.js's POST /login, saves it together with
// `lastLoginAt` in one write) login-streak update. Deliberately UTC-calendar-
// day based, same simple/deterministic reset boundary already established by
// backend/utils/entitlementUtils.js#isSameUtcDay() for the daily-like-quota
// reset — not the user's local timezone, which the backend doesn't know.
//
// Rules (per the task spec):
//   - Same UTC day as the last recorded streak day -> no-op (already counted
//     today; logging in twice in one day doesn't inflate the streak).
//   - Exactly the next UTC day after the last recorded streak day ->
//     currentStreakDays += 1.
//   - Any bigger gap (or no prior streak at all) -> currentStreakDays = 1
//     (a fresh start, not a punishment — there is deliberately no "you lost
//     your streak!" notification or copy anywhere in this codebase; a reset
//     is silent, matching this feature's own non-guilt-based design intent).
// Returns `true` if the user document was modified (so the caller knows
// whether a streak-triggered badge check is even worth running), `false` on
// a same-day no-op.
function updateLoginStreak(user, now = new Date()) {
  const last = user.lastStreakDate ? new Date(user.lastStreakDate) : null;

  if (last && isSameUtcDay(last, now)) {
    return false;
  }

  if (last) {
    const yesterday = new Date(now.getTime() - ONE_DAY_MS);
    user.currentStreakDays = isSameUtcDay(last, yesterday) ? (user.currentStreakDays || 0) + 1 : 1;
  } else {
    user.currentStreakDays = 1;
  }

  user.lastStreakDate = now;
  user.longestStreakDays = Math.max(user.longestStreakDays || 0, user.currentStreakDays);
  return true;
}

// Awards one badge to `user` (an already-loaded Mongoose User document) if
// not already unlocked. Idempotent by construction — checked against
// `user.unlockedBadges` (in-memory, always fresh since the caller just
// loaded it) before ever pushing, so calling this twice for an
// already-unlocked code is a safe no-op, never a duplicate array entry and
// never a duplicate notification. Returns the awarded `code`, or `null` if
// this badge was already unlocked (or the code is unknown).
async function awardBadge(user, code, io) {
  const def = BADGE_BY_CODE[code];
  if (!def) return null;
  if (user.unlockedBadges.some((b) => b.code === code)) return null;

  user.unlockedBadges.push({ code, unlockedAt: new Date() });
  await user.save();

  // Notification creation isolated in its own try/catch — same "a
  // notification hiccup must never undo/fail the actual state change it's
  // describing" pattern already used by every other notification-creation
  // call site in this codebase (backend/routes/discovery.js,
  // backend/routes/matches.js). The badge is already durably unlocked above
  // by the time this runs.
  try {
    await createNotification({
      recipientId: user._id,
      type: 'badge',
      // Celebratory, never guilt/urgency-framed — see this file's top
      // comment. `code` lets the frontend look up the full catalog entry
      // (icon/description) via GET /api/badges if it wants to, without
      // duplicating the catalog text into every notification payload
      // forever; label/description/icon are also included directly so the
      // notification bell/toast can render immediately without a second
      // fetch.
      payload: { code, label: def.label, description: def.description, icon: def.icon },
      io,
    });
  } catch (err) {
    console.error('Badge notification error:', err);
  }

  return code;
}

// The shared entry point every hook call site uses. `trigger` scopes which
// badge condition(s) actually get (cheaply) re-checked — deliberately NOT
// "re-check all 10 badges on every call", so a match-creation hook only ever
// runs one indexed Match.countDocuments(), a referral-grant hook only ever
// runs one indexed User.countDocuments(), etc. Always wrapped in its own
// try/catch (badge-checking must never turn an otherwise-successful request
// — a swipe, a login, a verification approval — into a 500). Returns the
// array of newly-awarded badge codes (usually empty; UI code doesn't need to
// use this — the notification is already the source of truth for "show a
// celebration" — but it's useful for the verification script and any future
// caller that wants to know synchronously).
async function checkAndAwardBadges(userId, trigger, io) {
  try {
    const user = await User.findById(userId).select(
      'unlockedBadges mobileVerification.status photoVerification.status'
    );
    if (!user) return [];

    const newlyAwarded = [];
    const tryAward = async (code) => {
      const awarded = await awardBadge(user, code, io);
      if (awarded) newlyAwarded.push(awarded);
    };

    if (trigger === 'profile') {
      const profile = await Profile.findOne({ user: userId }).select('profileCompletionPercentage');
      if (profile && profile.profileCompletionPercentage >= 100) {
        await tryAward('PROFILE_COMPLETE');
      }
    } else if (trigger === 'verification') {
      if (user.mobileVerification?.status === 'VERIFIED') {
        await tryAward('MOBILE_VERIFIED');
      }
      if (user.photoVerification?.status === 'VERIFIED') {
        await tryAward('PHOTO_VERIFIED');
      }
    } else if (trigger === 'match') {
      const matchCount = await Match.countDocuments({ users: userId, unmatched: false });
      if (matchCount >= 1) await tryAward('FIRST_MATCH');
      if (matchCount >= MATCHES_10_THRESHOLD) await tryAward('MATCHES_10');
      if (matchCount >= MATCHES_50_THRESHOLD) await tryAward('MATCHES_50');
    } else if (trigger === 'safeDate') {
      const completedCount = await SafeDate.countDocuments({ user: userId, status: 'COMPLETED' });
      if (completedCount >= 1) await tryAward('FIRST_SAFE_DATE_COMPLETED');
    } else if (trigger === 'referral') {
      const referralCount = await User.countDocuments({ referredBy: userId });
      if (referralCount >= 1) await tryAward('FIRST_REFERRAL');
      if (referralCount >= REFERRALS_5_THRESHOLD) await tryAward('REFERRALS_5');
    } else if (trigger === 'streak') {
      // Re-read fresh — the caller (auth.js's login route) already saved
      // the just-updated currentStreakDays before calling this, so `user`
      // here (loaded independently, above) reflects that write.
      const fresh = await User.findById(userId).select('currentStreakDays');
      if (fresh && (fresh.currentStreakDays || 0) >= ACTIVE_STREAK_7_THRESHOLD) {
        await tryAward('ACTIVE_STREAK_7');
      }
    }

    return newlyAwarded;
  } catch (err) {
    console.error(`Badge check error (trigger=${trigger}):`, err);
    return [];
  }
}

module.exports = { updateLoginStreak, awardBadge, checkAndAwardBadges };
