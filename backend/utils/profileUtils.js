const { MIN_AGE } = require('../constants/profileOptions');

// Computes age in whole years from a date of birth, as of "now" (or an
// injectable reference date for testability). Never stored — age is always
// derived server-side from dateOfBirth so it can't drift/be edited directly.
function calculateAge(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function isAtLeastMinAge(dateOfBirth, now = new Date()) {
  const age = calculateAge(dateOfBirth, now);
  return age !== null && age >= MIN_AGE;
}

// Weighted section-based profile completion score (0-100). Kept intentionally
// simple: each section is either "filled" or not, weighted by how much it
// matters to a usable profile. Recomputed on every save (see Profile model
// pre-save hook) rather than trusted from client input.
// NOTE: the required-for-a-usable-profile sections above already sum to 100,
// so `instagram` below is a genuine bonus, never a requirement — it can only
// push an already-100% profile over the cap, which `Math.min(100, ...)`
// below absorbs. A profile with everything else filled still reaches 100%
// without ever linking Instagram (post-MVP, self-reported field — see
// MOCK_FEATURES.md's Instagram-linking entry).
const COMPLETION_WEIGHTS = {
  basicInfo: 20, // displayName + dateOfBirth + gender
  datingIntention: 10,
  location: 10, // city + district
  photos: 20, // at least one photo
  bio: 15,
  interests: 10, // at least 3 interests
  prompts: 10, // at least 1 answered prompt
  lifestyleAndLanguages: 5,
  instagram: 5, // bonus only, see note above
};

function computeProfileCompletion(profile) {
  if (!profile) return 0;

  let score = 0;

  if (profile.displayName && profile.dateOfBirth && profile.gender) {
    score += COMPLETION_WEIGHTS.basicInfo;
  }
  if (profile.datingIntention) {
    score += COMPLETION_WEIGHTS.datingIntention;
  }
  if (profile.city && profile.district) {
    score += COMPLETION_WEIGHTS.location;
  }
  if (Array.isArray(profile.photos) && profile.photos.length > 0) {
    score += COMPLETION_WEIGHTS.photos;
  }
  if (profile.bio && profile.bio.trim().length > 0) {
    score += COMPLETION_WEIGHTS.bio;
  }
  if (Array.isArray(profile.interests) && profile.interests.length >= 3) {
    score += COMPLETION_WEIGHTS.interests;
  }
  if (Array.isArray(profile.personalityPrompts) && profile.personalityPrompts.length > 0) {
    score += COMPLETION_WEIGHTS.prompts;
  }
  const hasLifestyle =
    profile.lifestyle &&
    (profile.lifestyle.smoking || profile.lifestyle.drinking || profile.lifestyle.diet);
  const hasLanguages = Array.isArray(profile.languages) && profile.languages.length > 0;
  if (hasLifestyle || hasLanguages) {
    score += COMPLETION_WEIGHTS.lifestyleAndLanguages;
  }
  if (profile.instagramHandle && String(profile.instagramHandle).trim().length > 0) {
    score += COMPLETION_WEIGHTS.instagram;
  }

  return Math.min(100, Math.round(score));
}

// Simple hints matching whichever weighted sections aren't filled yet, most
// impactful first. Mirrors the "Add a bio to improve your profile" idea from
// the product spec / design system doc.
function getCompletionHints(profile) {
  const hints = [];
  if (!(profile.displayName && profile.dateOfBirth && profile.gender)) {
    hints.push('Complete your basic info (name, date of birth, gender)');
  }
  if (!Array.isArray(profile.photos) || profile.photos.length === 0) {
    hints.push('Add at least one photo');
  }
  if (!profile.bio || profile.bio.trim().length === 0) {
    hints.push('Add a bio to improve your profile');
  }
  if (!profile.datingIntention) {
    hints.push('Share what you are looking for (dating intention)');
  }
  if (!(profile.city && profile.district)) {
    hints.push('Add your city and district');
  }
  if (!Array.isArray(profile.interests) || profile.interests.length < 3) {
    hints.push('Add at least 3 interests');
  }
  if (!Array.isArray(profile.personalityPrompts) || profile.personalityPrompts.length === 0) {
    hints.push('Answer a personality prompt');
  }
  return hints;
}

module.exports = {
  calculateAge,
  isAtLeastMinAge,
  computeProfileCompletion,
  getCompletionHints,
  COMPLETION_WEIGHTS,
};
