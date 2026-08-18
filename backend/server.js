require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const discoveryRouter = require('./routes/discovery');
const matchesRouter = require('./routes/matches');
const notificationsRouter = require('./routes/notifications');
const verificationRouter = require('./routes/verification');
const reportsRouter = require('./routes/reports');
const blocksRouter = require('./routes/blocks');
const subscriptionRouter = require('./routes/subscription');
const referralsRouter = require('./routes/referrals');
const adminRouter = require('./routes/admin');
const safeDatesRouter = require('./routes/safeDates');
const dateIdeasRouter = require('./routes/dateIdeas');
const boostsRouter = require('./routes/boosts');
const { initSocket } = require('./socket');
const { seedDefaultPlans } = require('./utils/entitlementUtils');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cg-dating-app';

app.use(cors());
// 10mb limit (not just the default ~100kb) to allow the MOCK/TEMPORARY
// base64 photo upload path in POST /api/profile/me/photos until real
// Cloudinary upload is wired up — see MOCK_FEATURES.md.
app.use(express.json({ limit: '10mb' }));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/blocks', blocksRouter);
// Task #12 — Subscription scaffolding. Mounted at the bare /api root
// (rather than /api/subscription) because this single router serves two
// different base paths per the task spec: the public GET /api/plans
// listing, and the auth-protected /api/subscription/* actions — see
// backend/routes/subscription.js's own route declarations for the full
// paths. Divergence from docs/DATABASE_SCHEMA.md's originally-`[PLANNED]`
// /api/subscriptions (plural) + /api/payments base paths — see
// docs/API_DOCUMENTATION.md's Subscription section for the divergence note.
app.use('/api', subscriptionRouter);
// Task #17 — Referral program ("Invite & Earn", V2 scope). Mounted at the
// bare /api root (same pattern as subscriptionRouter just above) since the
// router declares its own full path (GET /api/referrals/me) rather than a
// base-path prefix.
app.use('/api', referralsRouter);
// Task #11 — Admin panel (see docs/ROADMAP.md's Phase 9). Every route in
// backend/routes/admin.js is auth + role-gated internally (requireAuth +
// requireRole(...) per route) — nothing here needs to change based on who's
// calling.
app.use('/api/admin', adminRouter);
// Task #18 — Safe Date mode + Date Planner (V2 scope, see docs/ROADMAP.md's Phase
// 12). Two separate routers: backend/routes/safeDates.js (owner-only Safe Date
// plans) and backend/routes/dateIdeas.js (the stateless date-idea suggestion
// generator) — see docs/API_DOCUMENTATION.md for the full route list.
app.use('/api/safe-dates', safeDatesRouter);
app.use('/api/date-ideas', dateIdeasRouter);
// Task #16 — Profile Boost + Priority Like (V2 scope, the last currently-
// queued item from the user's post-MVP feature batch — see PROJECT_STATE.md).
// Priority Like itself has no dedicated router — it's an extension of the
// existing POST /api/discovery/swipe (backend/routes/discovery.js), not a
// new base path.
app.use('/api/boosts', boostsRouter);

app.get('/', (req, res) => {
  res.json({ message: 'CG Dating API' });
});

// Attempt to connect to MongoDB, but don't crash the process if it's not
// reachable yet (e.g. during local scaffolding before Mongo is running).
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    // Task #12 — Subscription scaffolding: idempotently seed the three
    // default plans (CG_PLUS/CG_PRO/CG_ELITE) on startup if they don't
    // already exist — see backend/utils/entitlementUtils.js#seedDefaultPlans()
    // for why this never overwrites an admin's later edits.
    try {
      const seeded = await seedDefaultPlans();
      const createdCodes = seeded.filter((s) => s.created).map((s) => s.code);
      if (createdCodes.length > 0) {
        console.log(`Seeded default plans: ${createdCodes.join(', ')}`);
      }
    } catch (err) {
      console.error('Plan seeding error:', err.message);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    console.warn('Continuing without a database connection.');
  });

// Socket.IO (Task #5 — Chat) shares the same underlying HTTP server as
// Express rather than listening on a separate port — see backend/socket.js
// for JWT handshake auth + event handlers. The io instance is attached to
// the Express app so route handlers can reach it via req.app.get('io')
// (see backend/routes/matches.js's message routes, which persist via REST
// then broadcast via this same io instance).
const server = http.createServer(app);
const io = initSocket(server);
app.set('io', io);

server.listen(PORT, () => {
  console.log(`CG Dating backend listening on port ${PORT}`);
});

module.exports = app;
