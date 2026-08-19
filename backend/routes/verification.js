const express = require('express');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const {
  generateOtp,
  maskPhone,
  pruneOtpTimestamps,
  isOtpRateLimited,
  otpExpiryDate,
  isOtpExpired,
  toOwnVerificationStatusJSON,
} = require('../utils/verificationUtils');
const { resolveMockImageUrl } = require('../utils/mockImageUpload');
const { checkAndAwardBadges } = require('../utils/badgeUtils');
const { PHONE_RE, OTP_EXPIRY_MINUTES } = require('../constants/verificationOptions');

const router = express.Router();

// Same bcrypt cost factor already used for password hashing
// (backend/routes/auth.js) — OTPs are hashed at rest for the same reason
// passwords are, even though they're short-lived.
const OTP_HASH_SALT_ROUNDS = 10;

// Fields needed to run the OTP request/verify flow that are `select: false`
// on the schema (see backend/models/User.js) and so must be explicitly
// opted back in here.
const OTP_INTERNAL_FIELDS =
  '+mobileVerification.otpHash +mobileVerification.otpExpiresAt +mobileVerification.otpRequestTimestamps';

function normalizePhone(raw) {
  return String(raw).trim().replace(/[\s\-()]/g, '');
}

// POST /api/verification/mobile/request-otp (protected)
// Body (optional): { "phone": "+91XXXXXXXXXX" } — required only if the
// caller doesn't already have a phone on file, or wants to (re-)verify a
// different number.
//
// MOCK/DEV-ONLY SMS delivery: no real SMS provider (Twilio/MSG91/etc) is
// configured for this project — see MOCK_FEATURES.md. The generated OTP is
// ALWAYS logged server-side (standing in for the SMS send) and is ALSO
// included in the JSON response, but ONLY when NODE_ENV !== 'production' —
// this is the one and only place a plaintext OTP is ever returned to a
// client, and it can never happen in production. Wiring a real provider
// would replace the console.log below with an actual API call and drop the
// `devOtp` response field entirely.
router.post('/mobile/request-otp', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(OTP_INTERNAL_FIELDS);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let targetPhone = user.phone || null;
    if (req.body?.phone !== undefined) {
      const normalized = normalizePhone(req.body.phone);
      if (!PHONE_RE.test(normalized)) {
        return res.status(400).json({ message: 'Please provide a valid phone number' });
      }
      targetPhone = normalized;
    }
    if (!targetPhone) {
      return res.status(400).json({ message: 'A phone number is required' });
    }

    const changingNumber = targetPhone !== user.phone;
    if (user.mobileVerification.status === 'VERIFIED' && !changingNumber) {
      return res.status(400).json({ message: 'Your mobile number is already verified' });
    }

    const now = new Date();
    if (isOtpRateLimited(user.mobileVerification.otpRequestTimestamps, now)) {
      return res.status(429).json({
        message: 'Too many OTP requests. Please wait a few minutes and try again.',
      });
    }
    const recentRequests = pruneOtpTimestamps(user.mobileVerification.otpRequestTimestamps, now);

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, OTP_HASH_SALT_ROUNDS);

    user.phone = targetPhone;
    user.mobileVerification.status = 'PENDING';
    user.mobileVerification.otpHash = otpHash;
    user.mobileVerification.otpExpiresAt = otpExpiryDate(now);
    user.mobileVerification.otpRequestTimestamps = [...recentRequests, now];
    if (changingNumber) {
      // A previously-verified number no longer applies once the caller is
      // trying to verify a *different* number.
      user.mobileVerification.verifiedAt = null;
    }
    await user.save();

    // MOCK SMS provider: stands in for an actual Twilio/MSG91/etc send.
    console.log(`[MOCK SMS] OTP for user ${user._id} (${maskPhone(targetPhone)}): ${otp}`);

    const response = {
      message: 'OTP sent',
      phone: maskPhone(targetPhone),
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    };
    if (process.env.NODE_ENV !== 'production') {
      // MOCK/DEV-ONLY — see the route comment above. Never present when
      // NODE_ENV === 'production'.
      response.devOtp = otp;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('Request OTP error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/verification/mobile/verify-otp (protected) — body { "otp": "123456" }.
router.post('/mobile/verify-otp', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(OTP_INTERNAL_FIELDS);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = req.body?.otp;
    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({ message: 'OTP is required' });
    }

    const mv = user.mobileVerification;
    if (!mv.otpHash || !mv.otpExpiresAt) {
      return res
        .status(400)
        .json({ message: 'No OTP request found. Please request a new OTP first.' });
    }

    if (isOtpExpired(mv.otpExpiresAt)) {
      mv.status = 'EXPIRED';
      mv.otpHash = null;
      mv.otpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: 'That OTP has expired. Please request a new one.' });
    }

    const matches = await bcrypt.compare(String(otp).trim(), mv.otpHash);
    if (!matches) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    mv.status = 'VERIFIED';
    mv.verifiedAt = new Date();
    // Invalidate the OTP so it can never be replayed.
    mv.otpHash = null;
    mv.otpExpiresAt = null;
    await user.save();

    // Task #20 — Achievements/Badges (V2 scope): MOBILE_VERIFIED's natural
    // award point. Isolated try/catch — a badge-check hiccup must never
    // turn a successful OTP verification into a 500.
    try {
      await checkAndAwardBadges(user._id, 'verification', req.app.get('io'));
    } catch (badgeErr) {
      console.error('Badge check error (mobile verify):', badgeErr);
    }

    return res.json(toOwnVerificationStatusJSON(user));
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/verification/photo/submit (protected)
// Body: either { "url": "https://..." } or
// { "imageBase64": "<base64>", "mimeType": "image/jpeg" } — same
// MOCK/TEMPORARY storage pattern as profile photos, see
// backend/utils/mockImageUpload.js. Sets photoVerification to PENDING for a
// human reviewer (the future Admin panel's review queue — no automated
// face-match against profile photos in this MVP pass).
router.post('/photo/submit', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.photoVerification.status === 'PENDING') {
      return res
        .status(409)
        .json({ message: 'Your photo verification is already pending review' });
    }

    const resolved = resolveMockImageUrl(req.body || {});
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error });
    }

    user.photoVerification.status = 'PENDING';
    user.photoVerification.submittedPhotoUrl = resolved.url;
    user.photoVerification.submittedAt = new Date();
    // Resubmitting clears any prior outcome/decision — this is a fresh
    // review request.
    user.photoVerification.verifiedAt = null;
    user.photoVerification.reviewNotes = null;
    user.photoVerification.reviewedBy = null;
    user.photoVerification.reviewedAt = null;
    await user.save();

    return res.status(201).json(toOwnVerificationStatusJSON(user));
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Submit photo verification error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/verification/status (protected) — the caller's current state for
// both verification levels.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(toOwnVerificationStatusJSON(user));
  } catch (err) {
    console.error('Get verification status error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
