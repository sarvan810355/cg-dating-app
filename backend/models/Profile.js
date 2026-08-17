const mongoose = require('mongoose');

// Public-facing dating profile, one per User.
const ProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      trim: true,
    },
    interestedIn: {
      type: [String],
      default: [],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    photos: {
      type: [String], // URLs
      default: [],
    },
    location: {
      city: { type: String, trim: true },
      country: { type: String, trim: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    interests: {
      type: [String],
      default: [],
    },
    preferences: {
      minAge: { type: Number },
      maxAge: { type: Number },
      maxDistanceKm: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', ProfileSchema);
