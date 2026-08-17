const express = require('express');
const mongoose = require('mongoose');

const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { isAtLeastMinAge, getCompletionHints } = require('../utils/profileUtils');
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
} = require('../constants/profileOptions');

const router = express.Router();

const URL_RE = /^https?:\/\/\S+$/i;
const DATA_URI_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
// ~7MB of base64 text decodes to roughly 5MB of binary — a generous cap for a
// mock/local photo path, not a real production upload limit.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

// --- Serialization -----------------------------------------------------

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
// completion score, or anything not meant for other daters to see.
function toPublicProfileJSON(profile) {
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
  };
}

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
      if (key === 'lifestyle') {
        const current = profile.lifestyle && profile.lifestyle.toObject
          ? profile.lifestyle.toObject()
          : profile.lifestyle || {};
        profile.lifestyle = { ...current, ...value };
      } else {
        profile[key] = value;
      }
    });

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

    const profile = await Profile.findOne({ user: userId });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    return res.json({ profile: toPublicProfileJSON(profile) });
  } catch (err) {
    console.error('Get public profile error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
