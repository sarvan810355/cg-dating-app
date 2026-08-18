// Pure, DB-independent match-preference logic for Task #14 (location/age
// match preferences, V2, user-requested: "location preference ... jaise
// other dating apps kaam karte hain"). Kept separate from
// backend/routes/discovery.js so the CRITICAL bidirectional gender/age rules
// can be unit-tested with plain Node scripts, no live MongoDB connection
// needed — same convention already established by backend/utils/matchUtils.js.
//
// IMPORTANT — these functions are the DOCUMENTED SOURCE OF TRUTH for the
// discovery feed's matching rules. backend/routes/discovery.js implements
// the *same* rules directly as a MongoDB query (for efficiency, so the DB
// does the filtering rather than the app fetching everyone and rejecting
// most of them) rather than calling these functions per-candidate — the
// query's structure is commented inline with exactly which rule from this
// file it corresponds to. This file's functions are what the standalone
// verification script exercises directly, and what Task #19's ranking layer
// should reuse/reference for "is this pair even eligible" logic rather than
// re-deriving the rules a third time.

const { calculateAge } = require('./profileUtils');
const {
  DEFAULT_MIN_AGE_PREF,
  DEFAULT_MAX_AGE_PREF,
  DEFAULT_MAX_DISTANCE_KM,
} = require('../constants/discoveryOptions');

// Merges a profile's persisted `preferences` sub-document with optional
// one-off query-param overrides (GET /api/discovery/feed's ?maxDistanceKm=/
// ?minAge=/?maxAge= — see docs/API_DOCUMENTATION.md's Discovery section).
// Overrides never persist — see backend/routes/discovery.js. The MIN_AGE
// hard safety floor (18) is re-enforced here regardless of source, on top
// of the schema-level `min: 18` validator and the route-level check on
// PUT /api/profile/me — defense in depth, same pattern this codebase
// already uses for password/JWT handling.
function getEffectivePreferences(profile, overrides = {}, minAgeFloor = DEFAULT_MIN_AGE_PREF) {
  const stored = (profile && profile.preferences) || {};

  const rawMinAge = overrides.minAge !== undefined ? overrides.minAge : stored.minAge;
  const rawMaxAge = overrides.maxAge !== undefined ? overrides.maxAge : stored.maxAge;
  const rawMaxDistanceKm =
    overrides.maxDistanceKm !== undefined ? overrides.maxDistanceKm : stored.maxDistanceKm;
  const rawDatingIntentions =
    overrides.datingIntentions !== undefined ? overrides.datingIntentions : stored.datingIntentions;
  const rawVerifiedOnly =
    overrides.verifiedOnly !== undefined ? overrides.verifiedOnly : stored.verifiedOnly;

  const minAge = Math.max(
    minAgeFloor,
    Number.isFinite(rawMinAge) ? rawMinAge : DEFAULT_MIN_AGE_PREF
  );
  const maxAgeCandidate = Number.isFinite(rawMaxAge) ? rawMaxAge : DEFAULT_MAX_AGE_PREF;
  const maxAge = Math.max(minAge, maxAgeCandidate);
  const maxDistanceKm = Number.isFinite(rawMaxDistanceKm)
    ? rawMaxDistanceKm
    : DEFAULT_MAX_DISTANCE_KM;

  return {
    minAge,
    maxAge,
    maxDistanceKm,
    datingIntentions: Array.isArray(rawDatingIntentions) ? rawDatingIntentions : [],
    verifiedOnly: !!rawVerifiedOnly,
  };
}

// THE bidirectional gender-compatibility rule (see PROJECT_STATE.md's Task
// #14 finding — the discovery feed previously had NO gender filtering at
// all, in either direction). A candidate is compatible only if BOTH hold:
//   (a) the candidate's gender is something the current user wants to see
//       (current user's interestedIn includes candidate.gender, or is empty/
//       includes 'everyone' — an unset interestedIn is treated as
//       permissive, matching this codebase's existing "unset optional
//       preference = no filter" convention elsewhere), AND
//   (b) the current user's gender is something the candidate wants to see
//       (candidate's interestedIn includes myProfile.gender, or is empty/
//       includes 'everyone', same permissive-default rule)
// This is symmetric in spirit but NOT reflexive on identical input — it's
// evaluated once per (me, candidate) pair, exactly matching how a real
// dating app avoids showing you someone who isn't interested in your
// gender, and vice versa.
function isGenderMutuallyCompatible(myProfile, candidateProfile) {
  if (!myProfile || !candidateProfile) return false;

  const iWant = (a) => wantsGender(myProfile.interestedIn, a);
  const theyWant = (a) => wantsGender(candidateProfile.interestedIn, a);

  return iWant(candidateProfile.gender) && theyWant(myProfile.gender);
}

function wantsGender(interestedIn, gender) {
  if (!Array.isArray(interestedIn) || interestedIn.length === 0) return true; // permissive default
  if (interestedIn.includes('everyone')) return true;
  return interestedIn.includes(gender);
}

// THE bidirectional age-compatibility rule: a candidate is compatible only
// if BOTH hold:
//   (a) the candidate's own age falls inside the current user's preferred
//       [minAge, maxAge] range (myEffectivePrefs), AND
//   (b) the current user's own age falls inside the candidate's preferred
//       [minAge, maxAge] range (candidateEffectivePrefs)
// This is the "exactly how real dating apps avoid showing you to people
// who've said they don't want your age range" rule from the task spec.
// `now` is injectable for deterministic testing.
function isAgeMutuallyCompatible(myProfile, myEffectivePrefs, candidateProfile, candidateEffectivePrefs, now = new Date()) {
  const myAge = calculateAge(myProfile?.dateOfBirth, now);
  const candidateAge = calculateAge(candidateProfile?.dateOfBirth, now);
  if (myAge === null || candidateAge === null) return false;

  const candidateAgeOkForMe =
    candidateAge >= myEffectivePrefs.minAge && candidateAge <= myEffectivePrefs.maxAge;
  const myAgeOkForCandidate =
    myAge >= candidateEffectivePrefs.minAge && myAge <= candidateEffectivePrefs.maxAge;

  return candidateAgeOkForMe && myAgeOkForCandidate;
}

// Dating-intention preference filter (one-directional — only the viewer's
// stated preference narrows the feed, matching the task spec's #5; a
// candidate's own dating-intention preference about the VIEWER isn't a
// documented product rule the way gender/age reciprocity is). Empty/absent
// `intentions` means "any" (no filter).
function isDatingIntentionAcceptable(candidateProfile, intentions) {
  if (!Array.isArray(intentions) || intentions.length === 0) return true;
  return intentions.includes(candidateProfile?.datingIntention);
}

// Given [minAge, maxAge] (inclusive), the dateOfBirth range that guarantees
// calculateAge(dob, now) falls in that range — used to translate an age-range
// preference into an efficient, index-friendly MongoDB dateOfBirth query
// instead of scanning every candidate in application code. Exported so the
// verification script can assert the Mongo query's bounds agree exactly with
// calculateAge()'s own definition of "age in whole years".
//
// Someone turns `minAge` on their `minAge`-th birthday, so the OLDEST
// (earliest) dateOfBirth that is still under maxAge+1 is exclusive; the
// YOUNGEST (latest) dateOfBirth that has already reached minAge is `now`
// minus `minAge` years, inclusive.
function dobRangeForAgeRange(minAge, maxAge, now = new Date()) {
  const maxDob = new Date(now); // someone born on this date turns minAge today
  maxDob.setFullYear(now.getFullYear() - minAge);
  const minDob = new Date(now); // someone born the day before this turns maxAge+1 today (too old)
  minDob.setFullYear(now.getFullYear() - maxAge - 1);
  minDob.setDate(minDob.getDate() + 1);
  return { minDob, maxDob };
}

module.exports = {
  getEffectivePreferences,
  isGenderMutuallyCompatible,
  isAgeMutuallyCompatible,
  isDatingIntentionAcceptable,
  dobRangeForAgeRange,
};
