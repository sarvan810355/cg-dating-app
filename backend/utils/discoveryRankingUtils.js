// Discovery feed RANKING layer — Task #19 (V2, user-requested: "hamare
// dating app ke matching function aur profile suggestion ko algorithm
// samjha kar optimize karo, jaise other dating apps kaam karte hain").
//
// IMPORTANT — this is a distinct layer from Task #14's ELIGIBILITY filtering
// (backend/utils/matchPreferenceUtils.js, backend/routes/discovery.js's
// MongoDB `filter`). Eligibility is a hard yes/no gate (bidirectional
// gender/age compatibility, distance cap, dating-intention, verified-only,
// incognito, blocks, already-swiped, already-matched) — a candidate that
// fails eligibility is never fetched from the DB at all. RANKING only
// re-orders candidates that already passed eligibility; it can never cause
// an ineligible candidate to appear, and it can never exclude an eligible
// one either — every eligible candidate in the scored pool is still
// returned, just in a different order (see backend/routes/discovery.js's
// `GET /feed` for exactly where each layer runs).
//
// Deliberately a heuristic weighted scorer, NOT a real ML model — same
// honest pattern already used for Task #15's Why-You-Match/Icebreakers and
// Task #18's Date Planner (see MOCK_FEATURES.md): this project has no
// training data, no ML infra, and no ANTHROPIC_API_KEY configured anywhere,
// so "ranking" here means a documented, inspectable weighted sum of
// pre-normalized 0-100 signals, not a learned model. See
// docs/ROADMAP.md's V3 "ML recommendations" line for the long-term
// direction this is explicitly not attempting yet.
//
// Deliberately pure / DB-independent (same "standalone-Node-script
// testable, no live MongoDB needed" pattern as backend/utils/
// compatibilityUtils.js / matchPreferenceUtils.js) — every function here
// takes plain, already-resolved values (a compatibility score, a distance
// in km, a completion percentage, booleans, a timestamp), never a Mongoose
// document or a DB query. backend/routes/discovery.js is the only caller
// that touches the database, and it does so once per candidate in a
// bounded pool (see RANKING_POOL_SIZE below), not once per signal.

// --- The four ranking signals, each normalized to 0-100 before weighting
// so no signal can dominate the final score purely by scale (e.g. a raw
// distance in km vs. a 0-100 compatibility score would otherwise be
// meaningless to add together). ---

// A signal that genuinely can't be evaluated (no distance data, no login
// history) contributes this exact midpoint rather than 0 or 100 — matching
// Task #14's `geoUtils.js#isWithinDistance()` fail-open philosophy: missing
// data must never penalize OR boost a candidate, it just can't move the
// needle either way.
const NEUTRAL_SIGNAL_SCORE = 50;

// How many days of inactivity fully drain the activity signal to 0 (linear
// decay from 100 at "just logged in" down to 0 at this many days ago, then
// flat 0 beyond it). 30 days is a reasonable "still an active dater" window
// for an MVP heuristic — long enough not to bury someone who logs in a
// couple times a week, short enough that a dormant/abandoned account
// doesn't keep outranking someone who opened the app yesterday.
const ACTIVITY_DECAY_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Weighted-signal config, per the task spec's "must remain configurable"
// requirement (docs/BUSINESS_PLAN.md's premium-tier feature list already
// establishes plans/pricing as admin-editable, never hardcoded — same
// philosophy applied here). Kept as a single, easy-to-find, named-constant
// object rather than scattering magic numbers through discovery.js.
//
// Compatibility is weighted heaviest — it's Task #15's own per-pair
// Why-You-Match score (shared dating intention/city/interests/languages/
// lifestyle/prompts), the single most PERSONALIZED signal available; the
// other three are useful but comparatively generic (any two candidates at
// the same distance/completion/recency look identical on those signals
// alone). Weights sum to 1.0 so a fully-neutral candidate (score 50 on
// every signal) still lands at rankScore 50, not some arbitrary number.
//
// **Admin configurability, honestly scoped for this MVP pass:** this object
// is mutable in-process (see getRankingWeights()/setRankingWeights() below)
// and is read/written by `GET`/`PATCH /api/admin/discovery/ranking-weights`
// (backend/routes/admin.js, ADMIN+ only) — a real admin can genuinely tune
// these without a code deploy. **What this is NOT:** persisted to the
// database. A server restart resets the weights back to
// DEFAULT_RANKING_WEIGHTS below. A real production version would persist
// this to a small `config`/`settings` collection (one document, same shape)
// the way `plans` already does for pricing — not attempted here since nothing
// else in this codebase has a generic app-config collection yet, and adding
// one just for four numbers would be more scope than this pass's "configurable
// in code" bar requires. Documented here rather than silently claiming full
// persistence.
const DEFAULT_RANKING_WEIGHTS = Object.freeze({
  compatibility: 0.45,
  distance: 0.2,
  trust: 0.2,
  activity: 0.15,
});

let currentRankingWeights = { ...DEFAULT_RANKING_WEIGHTS };

function getRankingWeights() {
  return { ...currentRankingWeights };
}

// Validates and applies a partial or full weights update. Every key must be
// a finite, non-negative number; the four keys must sum to within a small
// tolerance of 1.0 (not exactly, to allow e.g. `{0.4, 0.2, 0.25, 0.15}`
// without floating-point rejection) so the resulting rankScore stays on a
// familiar ~0-100 scale rather than silently compressing or blowing it up.
// Throws a plain Error with a caller-facing message on invalid input —
// backend/routes/admin.js turns that into a 400.
function setRankingWeights(partialWeights) {
  const next = { ...currentRankingWeights, ...partialWeights };
  const keys = Object.keys(DEFAULT_RANKING_WEIGHTS);
  for (const key of keys) {
    if (!Number.isFinite(next[key]) || next[key] < 0) {
      throw new Error(`ranking weight '${key}' must be a non-negative number`);
    }
  }
  const sum = keys.reduce((acc, key) => acc + next[key], 0);
  if (sum < 0.9 || sum > 1.1) {
    throw new Error(
      `ranking weights (${keys.map((k) => `${k}=${next[k]}`).join(', ')}) must sum to ~1.0, got ${sum.toFixed(3)}`
    );
  }
  currentRankingWeights = next;
  return getRankingWeights();
}

function resetRankingWeights() {
  currentRankingWeights = { ...DEFAULT_RANKING_WEIGHTS };
  return getRankingWeights();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Compatibility signal: reuses Task #15's computeCompatibility() score
// (already 0-100) directly — deliberately NOT re-derived here. This
// function is a thin, defensive pass-through (clamped + defaulted) so
// computeRankScore() always has a well-formed number to weight, even if a
// caller passes `undefined`/`NaN` by mistake.
function normalizeCompatibilityScore(score) {
  return Number.isFinite(score) ? clamp(score, 0, 100) : 0;
}

// Distance signal: closer is better. `distanceKm: null` (Task #14's
// fail-open convention — either side has no resolvable coordinate) yields
// the neutral score, never a penalty or a boost — a candidate should never
// rank worse just because geocoding is unavailable for their city. When a
// real distance is known, it's scored relative to the caller's OWN
// `maxDistanceKm` preference (already the eligibility cutoff — Task #14's
// distance filter has already excluded anyone further than this), so
// "closeness" is always relative to what the user themselves considers
// nearby, not an arbitrary fixed radius.
function computeDistanceScore(distanceKm, maxDistanceKm) {
  if (distanceKm === null || distanceKm === undefined) return NEUTRAL_SIGNAL_SCORE;
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) return NEUTRAL_SIGNAL_SCORE;
  const ratio = clamp(distanceKm / maxDistanceKm, 0, 1);
  return 100 * (1 - ratio);
}

// Trust/completeness signal: rewards a fuller, more-verified profile —
// reuses the existing `profileCompletionPercentage` field (already 0-100,
// recomputed by backend/utils/profileUtils.js on every Profile save) plus
// Task #9's `mobileVerified`/`photoVerified` booleans. Weighted so
// completion alone can reach 60/100 and both verifications together add the
// remaining 40 — a genuine incentive to verify (this feature's own product
// benefit, per the task spec) without making an unverified-but-fully-filled
// profile disappear from view entirely.
function computeTrustScore(profileCompletionPercentage, mobileVerified, photoVerified) {
  const completion = Number.isFinite(profileCompletionPercentage)
    ? clamp(profileCompletionPercentage, 0, 100)
    : 0;
  const verificationBonus = (mobileVerified ? 20 : 0) + (photoVerified ? 20 : 0);
  return clamp(completion * 0.6 + verificationBonus, 0, 100);
}

// Activity signal: reuses `users.lastLoginAt` (backend/models/User.js,
// stamped on every successful `POST /api/auth/login` — see
// backend/routes/auth.js) as the ONLY genuine "last active" timestamp that
// exists anywhere in this codebase. Deliberately NOT fabricated from
// something else: `profiles.updatedAt` was considered (it exists and is
// always populated) but rejected as a proxy for "active" — it only reflects
// when the profile was last EDITED, which conflates "recently active" with
// "recently changed their bio", and a user who logs in daily but never
// touches their profile again would look permanently stale by that measure.
// `lastLoginAt` is a real, already-persisted field — no new column is
// invented and no schema migration was needed for this task; every caller
// gets it stamped starting from their very next login regardless of when
// their account was created. A missing `lastLoginAt` (a user who somehow
// has no recorded login yet, or account data from before this field was
// added) yields the neutral score, never a penalty for a genuine data gap —
// same fail-open convention as the distance signal above.
function computeActivityScore(lastLoginAt, now = new Date()) {
  if (!lastLoginAt) return NEUTRAL_SIGNAL_SCORE;
  const lastLoginDate = lastLoginAt instanceof Date ? lastLoginAt : new Date(lastLoginAt);
  if (Number.isNaN(lastLoginDate.getTime())) return NEUTRAL_SIGNAL_SCORE;
  const daysSince = Math.max(0, (now.getTime() - lastLoginDate.getTime()) / MS_PER_DAY);
  const decayed = 100 * (1 - daysSince / ACTIVITY_DECAY_WINDOW_DAYS);
  return clamp(decayed, 0, 100);
}

// The main entry point backend/routes/discovery.js calls once per candidate
// in the (already eligibility-filtered, bounded) pool. Every input is a
// plain, already-resolved value — no Mongoose documents, no DB access —
// so this whole module stays trivially unit-testable with fixture objects,
// same convention as compatibilityUtils.js/matchPreferenceUtils.js.
//
// Returns `{ rankScore, signals: { compatibility, distance, trust, activity } }`
// — `signals` (each already 0-100) is returned alongside the final blended
// score purely so a verification script (or a future debug/admin view) can
// see exactly which signal drove a given ranking, without recomputing
// anything.
function computeRankScore(
  {
    compatibilityScore,
    distanceKm,
    maxDistanceKm,
    profileCompletionPercentage,
    mobileVerified,
    photoVerified,
    lastLoginAt,
    now = new Date(),
  },
  weights = getRankingWeights()
) {
  const signals = {
    compatibility: normalizeCompatibilityScore(compatibilityScore),
    distance: computeDistanceScore(distanceKm, maxDistanceKm),
    trust: computeTrustScore(profileCompletionPercentage, mobileVerified, photoVerified),
    activity: computeActivityScore(lastLoginAt, now),
  };

  const rankScore =
    signals.compatibility * weights.compatibility +
    signals.distance * weights.distance +
    signals.trust * weights.trust +
    signals.activity * weights.activity;

  return { rankScore, signals };
}

module.exports = {
  DEFAULT_RANKING_WEIGHTS,
  NEUTRAL_SIGNAL_SCORE,
  ACTIVITY_DECAY_WINDOW_DAYS,
  getRankingWeights,
  setRankingWeights,
  resetRankingWeights,
  computeDistanceScore,
  computeTrustScore,
  computeActivityScore,
  computeRankScore,
};
