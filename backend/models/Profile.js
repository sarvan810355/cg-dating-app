const mongoose = require('mongoose');
const {
  GENDERS,
  INTERESTED_IN_OPTIONS,
  DATING_INTENTIONS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  DIET_OPTIONS,
  PERSONALITY_PROMPTS,
} = require('../constants/profileOptions');
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
    // Optional GeoJSON point for future "near me" discovery (Task #4). Not
    // required for profile completion in this phase.
    location: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
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
