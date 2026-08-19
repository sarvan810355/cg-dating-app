const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimiters');
const {
  generateUniqueReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
  grantMutualReferralReward,
} = require('../utils/referralUtils');
const { checkAndAwardBadges, updateLoginStreak } = require('../utils/badgeUtils');

const router = express.Router();

// Task #17 — Referral program: retry budget for the rare case where
// User.create() itself throws a duplicate-key error on `referralCode`
// (a genuine concurrent-signup race that generateUniqueReferralCode()'s own
// pre-check didn't catch — see backend/utils/referralUtils.js's comment).
const SIGNUP_REFERRAL_CODE_RETRY_ATTEMPTS = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function toPublicUser(user) {
  return {
    id: user._id,
    email: user.email,
    // Task #11 — Admin panel: exposing the caller's own role here (not just
    // via a separate admin-only endpoint) is what lets the frontend's
    // role-gated /admin section (frontend/src/components/AdminRoute.jsx)
    // decide whether to show/allow it at all, reusing the same GET
    // /api/auth/me call frontend/src/context/AuthContext.jsx already makes
    // on every page load — no second "am I an admin" request needed.
    role: user.role,
    // Task #16 — Profile Boost + Priority Like (V2 scope): exposing both
    // credit balances here (not just via GET /api/boosts/status) means the
    // frontend's already-existing AuthContext user object (refreshed on
    // every login/signup and on-demand via refreshUser()) carries them
    // everywhere the app already has `user` in scope — the Priority Like
    // button on Discovery.jsx in particular needs this balance without an
    // extra network round trip on every card render. Never a client-trusted
    // claim for entitlement purposes — every credit-consuming route
    // (POST /api/boosts/activate, POST /api/discovery/swipe) still
    // re-reads and re-decrements the real database value itself; this is
    // purely a read-only display convenience, same as `role` above.
    boostCreditsRemaining: user.boostCreditsRemaining,
    priorityLikesRemaining: user.priorityLikesRemaining,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/signup
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, password, referralCode } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Task #17 — Referral program (V2 scope, see docs/BUSINESS_PLAN.md's
    // Growth Strategy). `referralCode` is optional. Documented UX choice:
    // an invalid/typo'd/unknown code does NOT reject the signup — it's
    // silently (from the caller's perspective) dropped, only logged as a
    // warning server-side, and the account is created as normal without a
    // referral relationship. This matches how real referral programs
    // behave (a mistyped code shouldn't block someone from creating an
    // account) and is the explicitly preferred option per this task's
    // spec ("pick the more user-friendly option and document your
    // choice"). The referrer must already have an account for their code
    // to exist at all, so "can't refer yourself" is structurally
    // impossible at signup time (the new user's own code doesn't exist
    // yet) — no separate self-referral check is needed.
    let referrer = null;
    if (referralCode !== undefined && referralCode !== null && referralCode !== '') {
      const normalizedCode = normalizeReferralCode(referralCode);
      if (!isValidReferralCodeFormat(normalizedCode)) {
        console.warn(
          `Signup referral code ignored (bad format) for ${normalizedEmail}: ${JSON.stringify(referralCode)}`
        );
      } else {
        // eslint-disable-next-line no-await-in-loop -- single lookup, not a loop
        referrer = await User.findOne({ referralCode: normalizedCode });
        if (!referrer) {
          console.warn(
            `Signup referral code ignored (no matching user) for ${normalizedEmail}: ${normalizedCode}`
          );
        }
      }
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Retry loop covers the (extremely unlikely) case of a genuine
    // concurrent-signup race on the generated referralCode's uniqueness —
    // see backend/utils/referralUtils.js's comment and
    // SIGNUP_REFERRAL_CODE_RETRY_ATTEMPTS above.
    let user;
    for (let attempt = 0; attempt < SIGNUP_REFERRAL_CODE_RETRY_ATTEMPTS; attempt += 1) {
      const newReferralCode = await generateUniqueReferralCode();
      try {
        // eslint-disable-next-line no-await-in-loop -- retrying the same
        // logical create() on collision, not an independent batch of work
        user = await User.create({
          email: normalizedEmail,
          password: hashedPassword,
          referralCode: newReferralCode,
          // Set once, at creation — Mongoose's `immutable: true` on this
          // path (backend/models/User.js) then blocks any later change.
          referredBy: referrer ? referrer._id : null,
        });
        break;
      } catch (createErr) {
        const isReferralCodeCollision =
          createErr.code === 11000 && createErr.keyPattern && createErr.keyPattern.referralCode;
        if (isReferralCodeCollision && attempt < SIGNUP_REFERRAL_CODE_RETRY_ATTEMPTS - 1) {
          continue; // regenerate and retry
        }
        throw createErr;
      }
    }

    // Reward both sides of a completed referral (Task #12's Subscription
    // system, see backend/utils/referralUtils.js for the exact mechanism).
    // Awaited (not fire-and-forget) so the reward is reliably granted
    // before the response is sent, but still isolated from the signup
    // response's success path via its own internal try/catch per side
    // (see grantMutualReferralReward's own comment) — a reward-grant
    // failure never turns a successful signup into an error response.
    if (referrer) {
      await grantMutualReferralReward(referrer._id, user._id);
      // Task #20 — Achievements/Badges (V2 scope): FIRST_REFERRAL/
      // REFERRALS_5's natural award point — checked on the REFERRER (the
      // person whose code was just used), not the new referee. Isolated
      // try/catch, same "never turn a successful signup into a 500" pattern
      // as the reward grant above.
      try {
        await checkAndAwardBadges(referrer._id, 'referral', req.app.get('io'));
      } catch (badgeErr) {
        console.error('Badge check error (referral signup):', badgeErr);
      }
    }

    const token = signToken(user._id);
    return res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    // password has `select: false` on the schema (security audit, Task #6) —
    // explicitly opt back in here since this is the one route that needs to
    // compare it.
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Task #11 — Admin panel: a suspended account is blocked at login.
    // Checked AFTER the password match (not before) so a wrong-password
    // attempt against a suspended account still gets the generic "Invalid
    // email or password" message — same anti-enumeration reasoning already
    // used for the email/password check above, extended to not leak
    // suspension status to someone who doesn't actually know the password.
    if (user.accountStatus === 'SUSPENDED') {
      return res.status(403).json({
        message: 'Your account has been suspended. Contact support if you believe this is a mistake.',
      });
    }

    const loginTime = new Date();
    user.lastLoginAt = loginTime;
    // Task #20 — Achievements/Badges (V2 scope): login-streak tracking, the
    // feed for ACTIVE_STREAK_7. Updated in-memory here and saved together
    // with `lastLoginAt` in the one `user.save()` call below — see
    // backend/utils/badgeUtils.js#updateLoginStreak() for the exact
    // same-day-no-op / next-day-increment / gap-resets-to-1 rules.
    updateLoginStreak(user, loginTime);
    await user.save();

    // Checked AFTER the save above (needs the just-persisted
    // currentStreakDays) — isolated try/catch, same "never turn a
    // successful login into a 500" pattern as every other badge-check call
    // site.
    try {
      await checkAndAwardBadges(user._id, 'streak', req.app.get('io'));
    } catch (badgeErr) {
      console.error('Badge check error (login streak):', badgeErr);
    }

    const token = signToken(user._id);
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/auth/me (protected)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
