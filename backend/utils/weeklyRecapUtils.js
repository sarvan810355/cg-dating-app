// Weekly Recap — Task #20 (Engagement, V2 scope). See
// backend/constants/badgeOptions.js's top comment for the shared product
// context (built as the non-manipulative alternative to an original
// "make it addictive" request).
//
// **Computed at READ time, not a scheduled job or a sent email/push — same
// honest, already-established pattern as SafeDate's read-time reminder
// computation (backend/utils/safeDateUtils.js) and Task #16's Boost
// expiry.** There is no job scheduler anywhere in this codebase (no
// node-cron, no task queue) to run a real "every Monday at 9am, compute and
// push everyone's recap" job, and no real push/email provider configured to
// deliver one even if there were (see MOCK_FEATURES.md). Instead: whenever
// the frontend asks (GET /api/recap/weekly), the last 7 days of real
// activity are counted fresh from the Like/Match/Message collections —
// nothing is pre-aggregated or cached — and whether it's "new" is judged
// purely from `users.lastRecapShownAt`, so a user checking twice in one
// session sees the same numbers, and a user who hasn't opened the app in
// weeks still gets an honest "last 7 days from today" window, not a
// backlog of stale unseen recaps.

const Like = require('../models/Like');
const Match = require('../models/Match');
const Message = require('../models/Message');

const RECAP_WINDOW_DAYS = 7;
// How long after the last time a recap was actually shown before the next
// one is considered "due" again. Deliberately the SAME 7 days as the recap
// window itself — "your week" is a weekly cadence, not a nag shown on every
// app open. This is a threshold on a real, honestly-tracked "last shown"
// timestamp, not a countdown/urgency mechanic — see this file's top comment.
const RECAP_DUE_AFTER_DAYS = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Pure count of real activity in the trailing `RECAP_WINDOW_DAYS` days
// ending at `now`. Three independent, already-indexed queries (Like has an
// index on `{ toUser, action }`, Match on `{ users }`, Message on
// `{ match, createdAt }`/sender is covered by the same collection scan
// pattern already used elsewhere in this codebase for a single user's own
// activity) — cheap enough to run on every GET, no aggregation pipeline
// needed for numbers this simple.
async function computeWeeklyRecap(userId, now = new Date()) {
  const windowStart = new Date(now.getTime() - RECAP_WINDOW_DAYS * ONE_DAY_MS);

  const [likesReceived, matchesMade, messagesSent] = await Promise.all([
    // "People who liked me" — action: 'like' only (a 'pass' is not a like);
    // deliberately a raw count, never revealing WHO, same "see who liked
    // you" premium-gate spirit already established in
    // backend/routes/discovery.js's notification-creation comment (this is
    // a count, not an identity reveal, so it's not gated the same way — but
    // it still never names anyone).
    Like.countDocuments({ toUser: userId, action: 'like', createdAt: { $gte: windowStart, $lte: now } }),
    // Matches created in the window — `matchedAt`, not `createdAt`, is the
    // meaningful timestamp here (they're set to the same value at creation
    // time in practice, but `matchedAt` is the field this codebase already
    // treats as authoritative for match ordering — see
    // backend/routes/matches.js's GET /).
    Match.countDocuments({
      users: userId,
      unmatched: false,
      matchedAt: { $gte: windowStart, $lte: now },
    }),
    // Messages the caller SENT (not received) in the window — a measure of
    // the caller's own engagement/output, matching the task's example
    // framing ("8 messages sent").
    Message.countDocuments({ sender: userId, createdAt: { $gte: windowStart, $lte: now } }),
  ]);

  return { likesReceived, matchesMade, messagesSent, windowStart, windowEnd: now };
}

// Whether a recap is "due" to be shown again — true if never shown before,
// or if it's been at least RECAP_DUE_AFTER_DAYS since it last was. Pure/
// DB-independent so it's directly unit-testable.
function isRecapDue(lastRecapShownAt, now = new Date()) {
  if (!lastRecapShownAt) return true;
  const msSince = now.getTime() - new Date(lastRecapShownAt).getTime();
  return msSince >= RECAP_DUE_AFTER_DAYS * ONE_DAY_MS;
}

module.exports = {
  computeWeeklyRecap,
  isRecapDue,
  RECAP_WINDOW_DAYS,
  RECAP_DUE_AFTER_DAYS,
};
