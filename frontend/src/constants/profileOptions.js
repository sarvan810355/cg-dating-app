// Mirrors backend/constants/profileOptions.js. Kept as a separate copy since
// frontend and backend are independent npm packages — update both together
// if these lists change.

export const GENDERS = [
  { value: 'male', label: 'Man' },
  { value: 'female', label: 'Woman' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

export const INTERESTED_IN_OPTIONS = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'non_binary', label: 'Non-binary people' },
  { value: 'other', label: 'Other' },
  { value: 'everyone', label: 'Everyone' },
];

export const DATING_INTENTIONS = [
  { value: 'long_term', label: 'Long-term relationship' },
  { value: 'serious_dating', label: 'Serious dating' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'casual', label: 'Casual dating' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'new_people', label: 'Meeting new people' },
];

// Suggested list only — district is free text, so any current or future
// Chhattisgarh district/town can be entered even if it's not in this list.
export const CG_DISTRICTS = [
  'Raipur', 'Durg', 'Bhilai', 'Bilaspur', 'Bastar', 'Dhamtari', 'Rajnandgaon',
  'Raigarh', 'Korba', 'Janjgir-Champa', 'Jashpur', 'Kanker', 'Kabirdham',
  'Koriya', 'Surguja', 'Mahasamund', 'Dantewada', 'Bijapur', 'Narayanpur',
  'Balod', 'Baloda Bazar', 'Balrampur', 'Bemetara', 'Gariaband',
  'Gaurela-Pendra-Marwahi', 'Kondagaon', 'Mungeli', 'Sukma', 'Surajpur',
  'Sakti', 'Manendragarh-Chirmiri-Bharatpur', 'Mohla-Manpur-Ambagarh Chowki',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
];

export const SMOKING_OPTIONS = [
  { value: 'no', label: "Don't smoke" },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'yes', label: 'Smoker' },
];

export const DRINKING_OPTIONS = [
  { value: 'no', label: "Don't drink" },
  { value: 'socially', label: 'Socially' },
  { value: 'yes', label: 'Drinker' },
];

export const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'non_vegetarian', label: 'Non-vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'eggetarian', label: 'Eggetarian' },
];

export const PERSONALITY_PROMPTS = [
  'My ideal weekend is...',
  'My biggest green flag is...',
  'The way to my heart is...',
  'A fact about me that surprises people...',
  "I'm looking for someone who...",
  'My love language is...',
  'A perfect first date would be...',
  "Let's talk about...",
];

export const MAX_PHOTOS = 6;
export const MAX_INTERESTS = 15;
export const MAX_PROMPTS = 5;
export const BIO_MAX_LENGTH = 500;

// Instagram handle linking (post-MVP, user-requested — see MOCK_FEATURES.md).
// Self-reported only, NOT real Instagram OAuth. Mirrors
// backend/constants/profileOptions.js#INSTAGRAM_HANDLE_REGEX exactly —
// letters, numbers, periods, underscores, 1-30 characters.
export const INSTAGRAM_HANDLE_REGEX = /^[A-Za-z0-9._]{1,30}$/;

// Strips a leading '@' (either "handle" or "@handle" is accepted as input)
// and trims whitespace — matches the normalization backend/routes/profile.js
// applies before validating/storing.
export function normalizeInstagramHandle(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
