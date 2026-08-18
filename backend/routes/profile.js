const express = require('express');
const mongoose = require('mongoose');

const Profile = require('../models/Profile');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { isAtLeastMinAge } = require('../utils/profileUtils');
const { toOwnProfileJSON, toPublicProfileJSON } = require('../utils/profileSerializers');
const {
  MIN_AGE,
  GENDERS,
  INTERESTED_IN_OPTIONS,
  DATING_INTENTIONS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  DIET_OPTIONS,
  PERSONALITY_PROMPTS,
  MAX_PHOTOS,
  MAX_INTERESTS,
  MAX_PROMPTS,
  BIO_MAX_LENGTH,
  INSTAGRAM_HANDLE_REGEX,
} = require('../constants/profileOptions');
const {
  MAX_DISTANCE_KM_CAP,
  MAX_AGE_PREF_CAP,
} = require('../constants/discoveryOptions');
const { resolveApproxCoordinates } = require('../utils/geoUtils');

const router = express.Router();

const URL_RE = /^https?:\/\/\S+$/i;
const DATA_URI_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
// ~7MB of base64 text decodes to roughly 5MB of binary — a generous cap for a
// mock/local photo path, not a real production upload limit.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

// --- Serialization -----------------------------------------------------
// toOwnProfileJSON / toPublicProfileJSON now live in
// backend/utils/profileSerializers.js so backend/routes/discovery.js can
// reuse the same "public profile" shape for feed cards and match listings.

// --- Validation ----------------------------------------------------------

// Whitelists and validates the editable fields from PUT /api/profile/me.
// Returns { errors: string[], updates: object }.
function validateProfileInput(body, { isCreate }) {
  const errors = [];
  const updates = {};

  if (body.displayName !== undefined) {
    const name = String(body.displayName).trim();
    if (!name) errors.push('displayName cannot be empty');
    else if (name.length > 60) errors.push('displayName must be 60 characters or fewer');
    else updates.displayName = name;
  }

  if (body.dateOfBirth !== undefined) {
    const dob = new Date(body.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      errors.push('dateOfBirth must be a valid date');
    } else {
      updates.dateOfBirth = dob;
    }
  }

  if (body.gender !== undefined) {
    const gender = String(body.gender).trim().toLowerCase();
    if (!GENDERS.includes(gender)) {
      errors.push(`gender must be one of: ${GENDERS.join(', ')}`);
    } else {
      updates.gender = gender;
    }
  }

  if (body.interestedIn !== undefined) {
    if (!Array.isArray(body.interestedIn)) {
      errors.push('interestedIn must be an array');
    } else {
      const values = body.interestedIn.map((v) => String(v).trim().toLowerCase());
      const invalid = values.filter((v) => !INTERESTED_IN_OPTIONS.includes(v));
      if (invalid.length) {
        errors.push(`interestedIn contains invalid values: ${invalid.join(', ')}`);
      } else {
        updates.interestedIn = [...new Set(values)];
      }
    }
  }

  if (body.datingIntention !== undefined) {
    const intention = String(body.datingIntention).trim();
    if (!DATING_INTENTIONS.includes(intention)) {
      errors.push(`datingIntention must be one of: ${DATING_INTENTIONS.join(', ')}`);
    } else {
      updates.datingIntention = intention;
    }
  }

  if (body.city !== undefined) {
    const city = String(body.city).trim();
    if (city.length > 80) errors.push('city must be 80 characters or fewer');
    else updates.city = city;
  }

  if (body.district !== undefined) {
    // Free text on purpose — must support any Chhattisgarh district/town,
    // not just a hardcoded list of major cities.
    const district = String(body.district).trim();
    if (!district) errors.push('district cannot be empty');
    else if (district.length > 80) errors.push('district must be 80 characters or fewer');
    else updates.district = district;
  }

  if (body.state !== undefined) {
    updates.state = String(body.state).trim() || 'Chhattisgarh';
  }

  if (body.profession !== undefined) {
    const profession = String(body.profession).trim();
    if (profession.length > 100) errors.push('profession must be 100 characters or fewer');
    else updates.profession = profession;
  }

  if (body.education !== undefined) {
    const education = String(body.education).trim();
    if (education.length > 100) errors.push('education must be 100 characters or fewer');
    else updates.education = education;
  }

  if (body.bio !== undefined) {
    const bio = String(body.bio).trim();
    if (bio.length > BIO_MAX_LENGTH) {
      errors.push(`bio must be ${BIO_MAX_LENGTH} characters or fewer`);
    } else {
      updates.bio = bio;
    }
  }

  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests)) {
      errors.push('interests must be an array');
    } else {
      const values = [...new Set(body.interests.map((v) => String(v).trim()).filter(Boolean))];
      if (values.length > MAX_INTERESTS) {
        errors.push(`interests can have at most ${MAX_INTERESTS} entries`);
      } else {
        updates.interests = values;
      }
    }
  }

  if (body.languages !== undefined) {
    if (!Array.isArray(body.languages)) {
      errors.push('languages must be an array');
    } else {
      updates.languages = [
        ...new Set(body.languages.map((v) => String(v).trim()).filter(Boolean)),
      ];
    }
  }

  if (body.lifestyle !== undefined) {
    if (typeof body.lifestyle !== 'object' || body.lifestyle === null || Array.isArray(body.lifestyle)) {
      errors.push('lifestyle must be an object');
    } else {
      const { smoking, drinking, diet } = body.lifestyle;
      const lifestyle = {};
      if (smoking !== undefined && smoking !== null) {
        if (!SMOKING_OPTIONS.includes(smoking)) {
          errors.push(`lifestyle.smoking must be one of: ${SMOKING_OPTIONS.join(', ')}`);
        } else {
          lifestyle.smoking = smoking;
        }
      }
      if (drinking !== undefined && drinking !== null) {
        if (!DRINKING_OPTIONS.includes(drinking)) {
          errors.push(`lifestyle.drinking must be one of: ${DRINKING_OPTIONS.join(', ')}`);
        } else {
          lifestyle.drinking = drinking;
        }
      }
      if (diet !== undefined && diet !== null) {
        if (!DIET_OPTIONS.includes(diet)) {
          errors.push(`lifestyle.diet must be one of: ${DIET_OPTIONS.join(', ')}`);
        } else {
          lifestyle.diet = diet;
        }
      }
      updates.lifestyle = lifestyle;
    }
  }

  if (body.personalityPrompts !== undefined) {
    if (!Array.isArray(body.personalityPrompts)) {
      errors.push('personalityPrompts must be an array');
    } else if (body.personalityPrompts.length > MAX_PROMPTS) {
      errors.push(`personalityPrompts can have at most ${MAX_PROMPTS} entries`);
    } else {
      const prompts = [];
      const seen = new Set();
      for (const entry of body.personalityPrompts) {
        const prompt = entry && String(entry.prompt || '').trim();
        const answer = entry && String(entry.answer || '').trim();
        if (!PERSONALITY_PROMPTS.includes(prompt)) {
          errors.push(`personalityPrompts.prompt must be one of the fixed prompts`);
          break;
        }
        if (!answer) {
          errors.push('personalityPrompts.answer cannot be empty');
          break;
        }
        if (answer.length > 300) {
          errors.push('personalityPrompts.answer must be 300 characters or fewer');
          break;
        }
        if (seen.has(prompt)) {
          errors.push('personalityPrompts cannot repeat the same prompt twice');
          break;
        }
        seen.add(prompt);
        prompts.push({ prompt, answer });
      }
      if (!errors.some((e) => e.startsWith('personalityPrompts'))) {
        updates.personalityPrompts = prompts;
      }
    }
  }

  // Instagram handle (post-MVP, self-reported only — see MOCK_FEATURES.md).
  // Accepts either "handle" or "@handle"; a leading '@' is stripped before
  // validation/storage. Sending an empty string clears a previously-set
  // handle (same "empty clears it" convention as bio/city below).
  if (body.instagramHandle !== undefined) {
    const raw = body.instagramHandle === null ? '' : String(body.instagramHandle).trim();
    if (!raw) {
      updates.instagramHandle = null;
    } else {
      const stripped = raw.startsWith('@') ? raw.slice(1) : raw;
      if (!INSTAGRAM_HANDLE_REGEX.test(stripped)) {
        errors.push(
          'instagramHandle must be 1-30 characters using only letters, numbers, periods, and underscores'
        );
      } else {
        updates.instagramHandle = stripped;
      }
    }
  }

  // --- Real coordinate capture (Task #14, V2, user-requested) ---
  // Optional `latitude`/`longitude` — set from the browser's geolocation API
  // after explicit user consent (frontend/src/pages/ProfileBuilder.jsx's
  // "Use my current location" button), NEVER captured silently. Takes
  // precedence over the city/district approximation fallback applied below
  // in the route handler (marks `locationSource: 'device'`).
  if (body.latitude !== undefined || body.longitude !== undefined) {
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      errors.push('latitude must be between -90 and 90, and longitude between -180 and 180');
    } else {
      updates.location = { type: 'Point', coordinates: [lng, lat] };
      updates.locationSource = 'device';
    }
  }

  // --- Match preferences (Task #14, V2, user-requested — "location
  // preference ... jaise other dating apps kaam karte hain"). Partial-merge
  // sub-object, same pattern as `lifestyle` above: only the keys present in
  // the request body are validated/updated, existing stored values for
  // omitted keys are preserved (see the merge logic in PUT /me below). ---
  if (body.preferences !== undefined) {
    if (
      typeof body.preferences !== 'object' ||
      body.preferences === null ||
      Array.isArray(body.preferences)
    ) {
      errors.push('preferences must be an object');
    } else {
      const { maxDistanceKm, minAge, maxAge, datingIntentions, verifiedOnly } = body.preferences;
      const prefs = {};

      if (maxDistanceKm !== undefined) {
        const v = Number(maxDistanceKm);
        if (!Number.isFinite(v) || v < 1 || v > MAX_DISTANCE_KM_CAP) {
          errors.push(`preferences.maxDistanceKm must be between 1 and ${MAX_DISTANCE_KM_CAP}`);
        } else {
          prefs.maxDistanceKm = Math.round(v);
        }
      }

      if (minAge !== undefined) {
        const v = Number(minAge);
        // Hard safety rule: never below MIN_AGE (18), same floor already
        // enforced on the user's OWN age (dateOfBirth) elsewhere in this
        // route — applied here to the age the user is willing to see
        // OTHERS at.
        if (!Number.isInteger(v) || v < MIN_AGE || v > MAX_AGE_PREF_CAP) {
          errors.push(`preferences.minAge must be a whole number between ${MIN_AGE} and ${MAX_AGE_PREF_CAP}`);
        } else {
          prefs.minAge = v;
        }
      }

      if (maxAge !== undefined) {
        const v = Number(maxAge);
        if (!Number.isInteger(v) || v < MIN_AGE || v > MAX_AGE_PREF_CAP) {
          errors.push(`preferences.maxAge must be a whole number between ${MIN_AGE} and ${MAX_AGE_PREF_CAP}`);
        } else {
          prefs.maxAge = v;
        }
      }

      if (datingIntentions !== undefined) {
        if (!Array.isArray(datingIntentions)) {
          errors.push('preferences.datingIntentions must be an array');
        } else {
          const values = datingIntentions.map((v) => String(v).trim());
          const invalid = values.filter((v) => !DATING_INTENTIONS.includes(v));
          if (invalid.length) {
            errors.push(`preferences.datingIntentions contains invalid values: ${invalid.join(', ')}`);
          } else {
            prefs.datingIntentions = [...new Set(values)];
          }
        }
      }

      if (verifiedOnly !== undefined) {
        prefs.verifiedOnly = !!verifiedOnly;
      }

      if (!errors.some((e) => e.startsWith('preferences'))) {
        updates.preferences = prefs;
      }
    }
  }

  // --- Privacy settings (Task #14 also covers Private/Incognito browsing) ---
  if (body.privacySettings !== undefined) {
    if (
      typeof body.privacySettings !== 'object' ||
      body.privacySettings === null ||
      Array.isArray(body.privacySettings)
    ) {
      errors.push('privacySettings must be an object');
    } else {
      const { incognito } = body.privacySettings;
      const settings = {};
      if (incognito !== undefined) {
        settings.incognito = !!incognito;
      }
      updates.privacySettings = settings;
    }
  }

  if (isCreate) {
    const missing = [];
    if (!updates.displayName) missing.push('displayName');
    if (!updates.dateOfBirth) missing.push('dateOfBirth');
    if (!updates.gender) missing.push('gender');
    if (missing.length) {
      errors.push(`Missing required fields to create a profile: ${missing.join(', ')}`);
    }
  }

  return { errors, updates };
}

// --- Routes ----------------------------------------------------------------

// GET /api/profile/me (protected)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found. Create your profile first.' });
    }
    return res.json({ profile: toOwnProfileJSON(profile) });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PUT /api/profile/me (protected) — create or update the caller's profile.
// Supports partial updates so the multi-step builder can save one section at
// a time; displayName/dateOfBirth/gender are only required together the very
// first time a profile is created.
router.put('/me', requireAuth, async (req, res) => {
  try {
    const existing = await Profile.findOne({ user: req.user.id });
    const { errors, updates } = validateProfileInput(req.body || {}, { isCreate: !existing });

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const effectiveDob = updates.dateOfBirth || existing?.dateOfBirth;
    if (effectiveDob && !isAtLeastMinAge(effectiveDob)) {
      return res.status(400).json({ message: `You must be at least ${MIN_AGE} years old to use CG Dating` });
    }

    let profile = existing;
    let statusCode = 200;
    if (!profile) {
      profile = new Profile({ user: req.user.id });
      statusCode = 201;
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'lifestyle' || key === 'preferences' || key === 'privacySettings') {
        // Partial-merge sub-object: only the keys present in this request
        // are overwritten, everything else already stored is preserved —
        // same pattern already used for `lifestyle`.
        const current =
          profile[key] && profile[key].toObject ? profile[key].toObject() : profile[key] || {};
        profile[key] = { ...current, ...value };
      } else {
        profile[key] = value;
      }
    });

    // Cross-field check (mirrors the schema-level pre('validate') guard in
    // backend/models/Profile.js — checked here too so the route can return
    // a clear 400 with a field-specific message rather than a generic
    // ValidationError string).
    if (
      profile.preferences?.minAge != null &&
      profile.preferences?.maxAge != null &&
      profile.preferences.maxAge < profile.preferences.minAge
    ) {
      return res
        .status(400)
        .json({ message: 'preferences.maxAge must be greater than or equal to preferences.minAge' });
    }

    // --- City/district -> approximate coordinates fallback (Task #14) ---
    // Only applies when this request didn't already set a precise device
    // location (`updates.location` above) AND the profile doesn't already
    // have one captured via real device geolocation — a city-name guess
    // must never silently downgrade/overwrite a real GPS point the user
    // explicitly granted. Runs whenever city/district changed (or on first
    // creation, when they're being set for the first time) so a profile
    // gets *some* usable coordinate for distance filtering even though this
    // project has no geocoding API key configured (see MOCK_FEATURES.md).
    if (
      updates.location === undefined &&
      profile.locationSource !== 'device' &&
      (updates.city !== undefined || updates.district !== undefined)
    ) {
      const approx = resolveApproxCoordinates(profile.city, profile.district);
      if (approx) {
        profile.location = { type: 'Point', coordinates: approx };
        profile.locationSource = 'approximate_city';
      }
    }

    await profile.save();

    return res.status(statusCode).json({ profile: toOwnProfileJSON(profile) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A profile already exists for this account' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Update profile error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/profile/me/photos (protected) — add a photo.
// MOCK/TEMPORARY: no Cloudinary configured yet. Accepts either a real
// external `url`, or `imageBase64` (+ optional `mimeType`) which is stored as
// a base64 data: URI directly on the profile document. See MOCK_FEATURES.md.
router.post('/me/photos', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(404).json({ message: 'Create your profile before adding photos' });
    }

    if (profile.photos.length >= MAX_PHOTOS) {
      return res.status(400).json({ message: `You can add at most ${MAX_PHOTOS} photos` });
    }

    const { url, imageBase64, mimeType } = req.body || {};
    let resolvedUrl;

    if (url) {
      const trimmed = String(url).trim();
      if (!URL_RE.test(trimmed) && !DATA_URI_RE.test(trimmed)) {
        return res.status(400).json({ message: 'url must be a valid http(s) URL or image data URI' });
      }
      resolvedUrl = trimmed;
    } else if (imageBase64) {
      const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
      const type = allowedMime.includes(mimeType) ? mimeType : 'image/jpeg';
      if (String(imageBase64).length > MAX_BASE64_LENGTH) {
        return res.status(400).json({ message: 'Image is too large' });
      }
      resolvedUrl = `data:${type};base64,${imageBase64}`;
    } else {
      return res.status(400).json({ message: 'Provide either url or imageBase64' });
    }

    const isPrimary = profile.photos.length === 0;
    profile.photos.push({ url: resolvedUrl, isPrimary });
    await profile.save();

    const newPhoto = profile.photos[profile.photos.length - 1];
    return res.status(201).json({
      photo: { id: newPhoto._id, url: newPhoto.url, isPrimary: newPhoto.isPrimary },
      profile: toOwnProfileJSON(profile),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Add photo error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/profile/:userId (protected) — public view of another user's profile.
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const [profile, ownerUser] = await Promise.all([
      Profile.findOne({ user: userId }),
      // Task #9 — Verification: fetched alongside the profile so the public
      // view can surface mobileVerified/photoVerified badges (booleans
      // only, never the raw phone/selfie — see
      // backend/utils/verificationUtils.js#toPublicVerificationBadges()).
      User.findById(userId).select('mobileVerification.status photoVerification.status'),
    ]);
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    return res.json({ profile: toPublicProfileJSON(profile, ownerUser) });
  } catch (err) {
    console.error('Get public profile error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
