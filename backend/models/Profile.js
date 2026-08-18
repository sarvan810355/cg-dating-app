const mongoose = require('mongoose');
const {
  GENDERS,
  INTERESTED_IN_OPTIONS,
  DATING_INTENTIONS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  DIET_OPTIONS,
  PERSONALITY_PROMPTS,
  INSTAGRAM_HANDLE_REGEX,
  MIN_AGE,
} = require('../constants/profileOptions');
const {
  DEFAULT_MAX_DISTANCE_KM,
  MAX_DISTANCE_KM_CAP,
  DEFAULT_MAX_AGE_PREF,
  MAX_AGE_PREF_CAP,
} = require('../constants/discoveryOptions');
const { computeProfileCompletion } = require('../utils/profileUtils');

// Public-facing dating profile, one per User. Deliberately built to be filled
// in gradually by the multi-step profile builder — most fields are optional at
// the schema level; the routes layer enforces which fields are required on
// first creation vs. later partial updates (see backend/routes/profile.js).
const PhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PromptAnswerSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true, enum: PERSONALITY_PROMPTS },
    answer: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false }
);

const ProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // --- Basic info ---
    displayName: { type: String, trim: true, maxlength: 60 },
    dateOfBirth: { type: Date }, // age is always derived server-side, never stored raw
    gender: { type: String, trim: true, lowercase: true, enum: GENDERS },
    interestedIn: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((v) => INTERESTED_IN_OPTIONS.includes(v)),
        message: 'interestedIn contains an invalid value',
      },
    },

    // --- Dating intention (first-class matching field) ---
    datingIntention: { type: String, trim: true, enum: DATING_INTENTIONS },

    // --- Location: city/district only, never exact address ---
    city: { type: String, trim: true, maxlength: 80 },
    // Free text (open field), not a closed dropdown of major cities only —
    // must support any current or future Chhattisgarh district/town.
    district: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, default: 'Chhattisgarh' },
    // Optional GeoJSON point, now actually populated/queried by Task #14
    // (location/age match preferences, V2, user-requested) — previously
    // reserved-but-unused since Task #4. Set either from real device
    // geolocation (backend/routes/profile.js's `latitude`/`longitude`
    // handling, explicit user consent via the frontend's "Use my current
    // location" button) or approximated from city/district via the static
    // backend/constants/cgLocationOptions.js lookup table (no geocoding API
    // key configured for this project — see MOCK_FEATURES.md). Never more
    // precise than city/district-center, matching this codebase's existing
    // "city/district only, never exact address" privacy rule.
    location: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    // Provenance of `location` above — lets the frontend/API be honest about
    // precision rather than presenting an approximated city-center point as
    // if it were the user's real position. `null` means no location set yet
    // at all (neither device nor approximation resolved).
    locationSource: {
      type: String,
      enum: ['device', 'approximate_city', null],
      default: null,
    },

    // --- Professional / education ---
    profession: { type: String, trim: true, maxlength: 100 },
    education: { type: String, trim: true, maxlength: 100 },

    // --- Bio / interests ---
    bio: { type: String, trim: true, maxlength: 500 },
    interests: { type: [String], default: [] },

    // --- Languages ---
    languages: { type: [String], default: [] },

    // --- Lifestyle (small fixed set of optional signals) ---
    lifestyle: {
      smoking: { type: String, trim: true, enum: [...SMOKING_OPTIONS, null], default: null },
      drinking: { type: String, trim: true, enum: [...DRINKING_OPTIONS, null], default: null },
      diet: { type: String, trim: true, enum: [...DIET_OPTIONS, null], default: null },
    },

    // --- Personality prompts (fixed prompt bank, see constants/profileOptions.js) ---
    personalityPrompts: { type: [PromptAnswerSchema], default: [] },

    // --- Instagram handle (post-MVP, user-requested; see MOCK_FEATURES.md) ---
    // Self-reported only, NOT verified via Instagram OAuth (no Meta Developer
    // app registered for this project) — same trust level as bio/interests.
    // Stored as-entered after stripping a leading '@' and trimming whitespace
    // (backend/routes/profile.js does the normalization); NOT force-lowercased
    // since Instagram usernames are case-insensitive for lookup but often
    // displayed in the case the user set. Format re-validated here too
    // (defense-in-depth, not just the route layer) against Instagram's real
    // username rules: letters, numbers, periods, underscores, 1-30 chars.
    instagramHandle: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) => v === null || v === '' || INSTAGRAM_HANDLE_REGEX.test(v),
        message:
          'instagramHandle must be 1-30 characters using only letters, numbers, periods, and underscores',
      },
    },

    // --- Match preferences (Task #14, V2, user-requested: "location
    // preference ... jaise other dating apps kaam karte hain"). Persistent,
    // 1:1-with-profile settings that shape the caller's OWN discovery feed —
    // not a filter on how others see this profile. Read/written via the
    // existing PUT /api/profile/me partial-merge pattern (no new endpoint —
    // same "extend, don't duplicate" choice already made for
    // instagramHandle above). See docs/DATABASE_SCHEMA.md's `preferences`
    // section for the full contract and backend/utils/matchPreferenceUtils.js
    // for the bidirectional matching rules this feeds. ---
    preferences: {
      maxDistanceKm: {
        type: Number,
        default: DEFAULT_MAX_DISTANCE_KM,
        min: 1,
        max: MAX_DISTANCE_KM_CAP,
      },
      // Hard safety floor: 18, always — same MIN_AGE constant this codebase
      // already enforces on the user's OWN age (profiles.dateOfBirth, see
      // backend/routes/profile.js's isAtLeastMinAge() check). This is the
      // floor for the age the user is willing to see OTHERS at, not their
      // own age, but the same "never below 18" rule applies for the same
      // safety reason.
      minAge: { type: Number, default: MIN_AGE, min: MIN_AGE, max: MAX_AGE_PREF_CAP },
      maxAge: {
        type: Number,
        default: DEFAULT_MAX_AGE_PREF,
        min: MIN_AGE,
        max: MAX_AGE_PREF_CAP,
      },
      // Empty/absent = "any" (no dating-intention filter) — see
      // backend/utils/matchPreferenceUtils.js#isDatingIntentionAcceptable().
      datingIntentions: {
        type: [String],
        default: [],
        validate: {
          validator: (arr) => arr.every((v) => DATING_INTENTIONS.includes(v)),
          message: 'preferences.datingIntentions contains an invalid value',
        },
      },
      // Only show profiles with a VERIFIED photoVerification status (Task
      // #9's `photoVerified` boolean) — a visibility filter on what the
      // caller wants to SEE, distinct from `privacySettings.incognito`
      // below (which controls whether the caller is shown to others).
      verifiedOnly: { type: Boolean, default: false },
    },

    // --- Privacy settings (Task #14 also covers Private/Incognito browsing,
    // a separate long-standing V2 TODO item — see TODO.md). ---
    privacySettings: {
      // When true, this profile is excluded from every OTHER user's
      // discovery feed entirely — the owner can still browse others
      // normally (this is a one-way "don't show me" toggle, not a mutual
      // block). See backend/routes/discovery.js's `'privacySettings.incognito'`
      // filter.
      incognito: { type: Boolean, default: false },
    },

    // --- Photos ---
    // MOCK/TEMPORARY: Cloudinary is not wired up yet (no credentials configured).
    // Photos are stored as plain URL strings — either a real external URL the
    // client provides, or a base64 data: URI accepted directly by
    // POST /api/profile/me/photos. See MOCK_FEATURES.md.
    photos: { type: [PhotoSchema], default: [] },

    // --- Computed ---
    profileCompletionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

// Defense in depth (route-level validation in backend/routes/profile.js is
// the primary guard, same "belt and suspenders" pattern already used for the
// MIN_AGE check on dateOfBirth): never allow preferences.maxAge to end up
// below preferences.minAge, and never allow preferences.minAge below the
// MIN_AGE safety floor, no matter what write path reaches .save().
ProfileSchema.pre('validate', function enforcePreferenceAgeOrder(next) {
  if (this.preferences) {
    if (this.preferences.minAge != null && this.preferences.minAge < MIN_AGE) {
      this.preferences.minAge = MIN_AGE;
    }
    if (
      this.preferences.minAge != null &&
      this.preferences.maxAge != null &&
      this.preferences.maxAge < this.preferences.minAge
    ) {
      return next(
        new Error('preferences.maxAge must be greater than or equal to preferences.minAge')
      );
    }
  }
  next();
});

// `user` already gets a unique index from `unique: true` above.
ProfileSchema.index({ location: '2dsphere' });
ProfileSchema.index({ datingIntention: 1, district: 1 });

// Age is always derived from dateOfBirth, never stored as an editable field.
ProfileSchema.virtual('age').get(function computeAge() {
  if (!this.dateOfBirth) return null;
  const now = new Date();
  const dob = new Date(this.dateOfBirth);
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
});

ProfileSchema.set('toJSON', { virtuals: true });
ProfileSchema.set('toObject', { virtuals: true });

// Recompute the completion score on every save so it can never drift from
// the actual field values (it is never trusted from client input).
ProfileSchema.pre('save', function recomputeCompletion(next) {
  this.profileCompletionPercentage = computeProfileCompletion(this);
  next();
});

module.exports = mongoose.model('Profile', ProfileSchema);
