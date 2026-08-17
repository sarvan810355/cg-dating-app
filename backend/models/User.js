const mongoose = require('mongoose');

// Core account/auth record. Profile details (bio, photos, preferences, etc.)
// live in the separate Profile model.
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },

    // --- Notification preferences (Task #6, see docs/ROADMAP.md Phase 6) ---
    // Basic per-type opt-out toggles, all default `true` (opt-out, not
    // opt-in). Deliberately no fields here for 'verification'/'safety'/
    // 'subscription' notifications — those aren't user-disable-able (see
    // backend/constants/notificationOptions.js's PREFERENCE_FIELD_BY_TYPE);
    // there are no code paths creating them yet, so this is future-proofing.
    notificationPreferences: {
      matchNotifications: { type: Boolean, default: true },
      likeNotifications: { type: Boolean, default: true },
      messageNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
