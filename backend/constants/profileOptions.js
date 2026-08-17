// Shared enums / option lists for the Profile system. Kept in one place so the
// Mongoose schema, route validation, and (indirectly, via the API) the frontend
// builder all agree on the same values.

const MIN_AGE = 18;

const GENDERS = ['male', 'female', 'non_binary', 'other'];

// "Who they want to meet" reuses the same domain as GENDERS, plus 'everyone'.
const INTERESTED_IN_OPTIONS = [...GENDERS, 'everyone'];

// First-class matching field. Chosen deliberately over the earlier
// DATABASE_SCHEMA.md draft enum (DATING/SERIOUS_RELATIONSHIP/MARRIAGE/FRIENDSHIP) —
// see docs/DATABASE_SCHEMA.md changelog note for why this list replaced it.
const DATING_INTENTIONS = [
  'long_term',
  'serious_dating',
  'marriage',
  'casual',
  'friendship',
  'new_people',
];

// Suggested list only — the district field itself is free text so any current or
// future Chhattisgarh district/town can be stored, not just these. Not exhaustive.
const CG_DISTRICTS = [
  'Raipur', 'Durg', 'Bhilai', 'Bilaspur', 'Bastar', 'Dhamtari', 'Rajnandgaon',
  'Raigarh', 'Korba', 'Janjgir-Champa', 'Jashpur', 'Kanker', 'Kabirdham',
  'Koriya', 'Surguja', 'Mahasamund', 'Dantewada', 'Bijapur', 'Narayanpur',
  'Balod', 'Baloda Bazar', 'Balrampur', 'Bemetara', 'Gariaband',
  'Gaurela-Pendra-Marwahi', 'Kondagaon', 'Mungeli', 'Sukma', 'Surajpur',
  'Sakti', 'Manendragarh-Chirmiri-Bharatpur', 'Mohla-Manpur-Ambagarh Chowki',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
];

const SMOKING_OPTIONS = ['no', 'occasionally', 'yes'];
const DRINKING_OPTIONS = ['no', 'socially', 'yes'];
const DIET_OPTIONS = ['vegetarian', 'non_vegetarian', 'vegan', 'eggetarian'];

// Fixed small prompt bank (personality prompts). Kept as plain strings rather
// than a separate `prompts` collection for MVP simplicity — see
// docs/DATABASE_SCHEMA.md divergence note.
const PERSONALITY_PROMPTS = [
  'My ideal weekend is...',
  'My biggest green flag is...',
  'The way to my heart is...',
  'A fact about me that surprises people...',
  "I'm looking for someone who...",
  'My love language is...',
  'A perfect first date would be...',
  "Let's talk about...",
];

const MAX_PHOTOS = 6;
const MAX_INTERESTS = 15;
const MAX_PROMPTS = 5;
const BIO_MAX_LENGTH = 500;

module.exports = {
  MIN_AGE,
  GENDERS,
  INTERESTED_IN_OPTIONS,
  DATING_INTENTIONS,
  CG_DISTRICTS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  DIET_OPTIONS,
  PERSONALITY_PROMPTS,
  MAX_PHOTOS,
  MAX_INTERESTS,
  MAX_PROMPTS,
  BIO_MAX_LENGTH,
};
