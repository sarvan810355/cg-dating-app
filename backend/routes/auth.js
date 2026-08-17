const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
    createdAt: user.createdAt,
  };
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};

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

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email: normalizedEmail, password: hashedPassword });

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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
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

    user.lastLoginAt = new Date();
    await user.save();

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
