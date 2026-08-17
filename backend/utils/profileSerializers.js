const { getCompletionHints } = require('./profileUtils');
const { toPublicVerificationBadges } = require('./verificationUtils');

// Shared profile -> API JSON shapes, used by backend/routes/profile.js and
// backend/routes/discovery.js (discovery cards and match listings reuse the
// same "public profile" shape rather than re-deriving their own field list).

// Full profile, only ever returned to its owner.
function toOwnProfileJSON(profile) {
  const obj = profile.toObject({ virtuals: true });
  return {
    id: obj._id,
    userId: obj.user,
    displayName: obj.displayName || null,
    dateOfBirth: obj.dateOfBirth || null,
    age: obj.age,
    gender: obj.gender || null,
    interestedIn: obj.interestedIn,
    datingIntention: obj.datingIntention || null,
    city: obj.city || null,
    district: obj.district || null,
    state: obj.state,
    profession: obj.profession || null,
    education: obj.education || null,
    bio: obj.bio || null,
    interests: obj.interests,
    languages: obj.languages,
    lifestyle: obj.lifestyle,
    personalityPrompts: obj.personalityPrompts,
    photos: obj.photos.map((p) => ({ id: p._id, url: p.url, isPrimary: p.isPrimary })),
    profileCompletionPercentage: obj.profileCompletionPercentage,
    completionHints: getCompletionHints(obj),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// Public view of another user's profile — deliberately a smaller field set.
// Never includes exact geo coordinates (only city/district), the owner's
// completion score, or anything not meant for other daters to see. Used both
// for GET /api/profile/:userId and for discovery feed / match cards.
//
// `verificationUser` (optional, Task #9 — Verification, see
// docs/ROADMAP.md's Phase 7): the profile owner's `User` document (or just
// its mobileVerification/photoVerification sub-fields), used to derive
// `mobileVerified`/`photoVerified` booleans only — never the raw submitted
// selfie or phone number, see
// backend/utils/verificationUtils.js#toPublicVerificationBadges(). Omitting
// it (existing call sites that haven't been updated yet) defaults both
// badges to `false` rather than throwing.
function toPublicProfileJSON(profile, verificationUser = null) {
  const obj = profile.toObject({ virtuals: true });
  return {
    userId: obj.user,
    displayName: obj.displayName || null,
    age: obj.age,
    gender: obj.gender || null,
    datingIntention: obj.datingIntention || null,
    city: obj.city || null,
    district: obj.district || null,
    state: obj.state,
    profession: obj.profession || null,
    education: obj.education || null,
    bio: obj.bio || null,
    interests: obj.interests,
    languages: obj.languages,
    lifestyle: obj.lifestyle,
    personalityPrompts: obj.personalityPrompts,
    photos: obj.photos.map((p) => ({ url: p.url, isPrimary: p.isPrimary })),
    ...toPublicVerificationBadges(verificationUser),
  };
}

module.exports = { toOwnProfileJSON, toPublicProfileJSON };
