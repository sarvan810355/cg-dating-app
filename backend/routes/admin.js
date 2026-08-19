const express = require('express');
const mongoose = require('mongoose');

const User = require('../models/User');
const Profile = require('../models/Profile');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Report = require('../models/Report');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/adminAuth');
const { writeAuditLog } = require('../utils/auditUtils');
const { checkAndAwardBadges } = require('../utils/badgeUtils');
const { REPORT_STATUSES, REPORT_DETAILS_MAX_LENGTH } = require('../constants/safetyOptions');
const { VERIFICATION_STATUSES } = require('../constants/verificationOptions');
const { USER_ROLES, ADMIN_ROLES, SUSPEND_ROLES } = require('../constants/adminOptions');
const {
  getRankingWeights,
  setRankingWeights,
  DEFAULT_RANKING_WEIGHTS,
} = require('../utils/discoveryRankingUtils');

const router = express.Router();

const DEFAULT_ADMIN_LIMIT = 20;
const MAX_ADMIN_LIMIT = 50;

// A report can only be moved to one of these three states by this route —
// `PENDING` is the report's starting state only (see backend/models/
// Report.js), never something an admin sets it back to.
const REPORT_REVIEW_STATUSES = ['REVIEWED', 'ACTION_TAKEN', 'DISMISSED'];
const PHOTO_REVIEW_STATUSES = ['VERIFIED', 'REJECTED'];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePagination(req, defaultLimit = DEFAULT_ADMIN_LIMIT, maxLimit = MAX_ADMIN_LIMIT) {
  let page = parseInt(req.query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  return { page, limit };
}

// Batches a user-id -> { id, email, displayName } lookup for a set of
// reports (reporter + reportedUser), same N+1-avoiding batching pattern
// already used by backend/routes/discovery.js / matches.js for verification
// badges and profile info.
async function buildUserInfoLookup(userIds) {
  const ids = [...new Set(userIds.map(String))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('email'),
    Profile.find({ user: { $in: ids } }).select('user displayName'),
  ]);
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));
  const nameById = new Map(profiles.map((p) => [String(p.user), p.displayName || null]));
  return (userId) => ({
    id: userId,
    email: emailById.get(String(userId)) || null,
    displayName: nameById.get(String(userId)) || null,
  });
}

function toAdminReportJSON(report, userInfo) {
  return {
    id: report._id,
    reporter: userInfo(report.reporter),
    reportedUser: userInfo(report.reportedUser),
    reason: report.reason,
    details: report.details,
    evidence: report.evidence,
    status: report.status,
    reviewNotes: report.reviewNotes ?? null,
    reviewedAt: report.reviewedAt,
    reviewedBy: report.reviewedBy,
    createdAt: report.createdAt,
  };
}

// Every /api/admin/* route requires a valid token first (requireAuth) — the
// specific role required varies per route below and is enforced by
// `requireRole(...)`, which itself only runs once requireAuth has already
// populated req.user.id (see backend/middleware/adminAuth.js's header
// comment for why this doesn't re-verify the JWT itself).
router.use(requireAuth);

// GET /api/admin/dashboard (role: MODERATOR+) — basic aggregate counts for
// the admin dashboard's stat grid. Deliberately simple `countDocuments()`
// calls, not a full analytics engine — see docs/ROADMAP.md's Phase 12 /
// TODO.md's V3 "advanced analytics dashboard" for that future scope.
router.get('/dashboard', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const [
      totalUsers,
      mobileVerifiedUsers,
      photoVerifiedUsers,
      totalMatches,
      totalMessages,
      pendingReports,
      pendingPhotoVerifications,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ 'mobileVerification.status': 'VERIFIED' }),
      User.countDocuments({ 'photoVerification.status': 'VERIFIED' }),
      Match.countDocuments({ unmatched: false }),
      Message.countDocuments({}),
      Report.countDocuments({ status: 'PENDING' }),
      User.countDocuments({ 'photoVerification.status': 'PENDING' }),
    ]);

    return res.json({
      counts: {
        totalUsers,
        mobileVerifiedUsers,
        photoVerifiedUsers,
        totalMatches,
        totalMessages,
        pendingReports,
        pendingPhotoVerifications,
      },
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/admin/reports?status=PENDING&page=&limit= (role: MODERATOR+) —
// the moderation queue's report list. Defaults to PENDING (the actual queue
// view) but accepts any REPORT_STATUSES value so a moderator can also review
// past decisions.
router.get('/reports', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req);

    let status = 'PENDING';
    if (req.query.status !== undefined) {
      status = String(req.query.status).trim();
      if (!REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${REPORT_STATUSES.join(', ')}` });
      }
    }

    const reports = await Report.find({ status })
      .select('+reviewNotes')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = reports.length > limit;
    const pageReports = reports.slice(0, limit);

    const userInfo = await buildUserInfoLookup(
      pageReports.flatMap((r) => [r.reporter, r.reportedUser])
    );

    return res.json({
      reports: pageReports.map((r) => toAdminReportJSON(r, userInfo)),
      page,
      hasMore,
    });
  } catch (err) {
    console.error('Admin list reports error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/admin/reports/:id (role: MODERATOR+) — body
// { status: 'REVIEWED'|'ACTION_TAKEN'|'DISMISSED', reviewNotes? }. Resolves
// a single report, stamping reviewedAt/reviewedBy from the acting admin.
router.patch('/reports/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id must be a valid report id' });
    }

    const { status, reviewNotes } = req.body || {};
    if (!REPORT_REVIEW_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ message: `status must be one of: ${REPORT_REVIEW_STATUSES.join(', ')}` });
    }
    if (reviewNotes !== undefined && reviewNotes !== null) {
      if (String(reviewNotes).length > REPORT_DETAILS_MAX_LENGTH) {
        return res
          .status(400)
          .json({ message: `reviewNotes must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer` });
      }
    }

    const report = await Report.findById(id).select('+reviewNotes');
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status;
    report.reviewedAt = new Date();
    report.reviewedBy = req.user.id;
    if (reviewNotes !== undefined) {
      const trimmed = reviewNotes === null ? null : String(reviewNotes).trim();
      report.reviewNotes = trimmed || null;
    }
    await report.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: 'report.reviewed',
      targetUserId: report.reportedUser,
      details: { reportId: String(report._id), status },
    });

    const userInfo = await buildUserInfoLookup([report.reporter, report.reportedUser]);
    return res.json({ report: toAdminReportJSON(report, userInfo) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Admin update report error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/admin/verifications/photo?status=PENDING&page=&limit=
// (role: MODERATOR+) — the photo-verification review queue. This IS an
// admin-only view of `submittedPhotoUrl` — unlike the public profile view
// (GET /api/profile/:userId), which only ever surfaces the derived
// `photoVerified` boolean, never the raw selfie (see backend/utils/
// verificationUtils.js#toPublicVerificationBadges()).
router.get('/verifications/photo', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req);

    let status = 'PENDING';
    if (req.query.status !== undefined) {
      status = String(req.query.status).trim();
      if (!VERIFICATION_STATUSES.includes(status)) {
        return res
          .status(400)
          .json({ message: `status must be one of: ${VERIFICATION_STATUSES.join(', ')}` });
      }
    }

    const users = await User.find({ 'photoVerification.status': status })
      .select('email photoVerification')
      .sort({ 'photoVerification.submittedAt': -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = users.length > limit;
    const pageUsers = users.slice(0, limit);

    const profiles = await Profile.find({ user: { $in: pageUsers.map((u) => u._id) } }).select(
      'user displayName'
    );
    const nameByUser = new Map(profiles.map((p) => [String(p.user), p.displayName || null]));

    return res.json({
      verifications: pageUsers.map((u) => ({
        userId: u._id,
        email: u.email,
        displayName: nameByUser.get(String(u._id)) || null,
        status: u.photoVerification.status,
        submittedPhotoUrl: u.photoVerification.submittedPhotoUrl,
        submittedAt: u.photoVerification.submittedAt,
      })),
      page,
      hasMore,
    });
  } catch (err) {
    console.error('Admin list photo verifications error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/admin/verifications/photo/:userId (role: MODERATOR+) — body
// { status: 'VERIFIED'|'REJECTED' }. The transition that
// docs/API_DOCUMENTATION.md's Verification section notes nothing ever did
// before this task — approves or rejects a pending selfie submission.
router.patch('/verifications/photo/:userId', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId must be a valid id' });
    }

    const { status } = req.body || {};
    if (!PHOTO_REVIEW_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ message: `status must be one of: ${PHOTO_REVIEW_STATUSES.join(', ')}` });
    }

    const user = await User.findById(userId).select('photoVerification email');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.photoVerification.status = status;
    user.photoVerification.verifiedAt = status === 'VERIFIED' ? new Date() : null;
    user.photoVerification.reviewedAt = new Date();
    user.photoVerification.reviewedBy = req.user.id;
    await user.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: status === 'VERIFIED' ? 'verification.approved' : 'verification.rejected',
      targetUserId: user._id,
      details: {},
    });

    // Task #20 — Achievements/Badges (V2 scope): PHOTO_VERIFIED's natural
    // award point — this is the ONLY place `photoVerification.status`
    // actually becomes 'VERIFIED' anywhere in this codebase (self-service
    // submission only sets it to PENDING; see verification.js's POST
    // /photo/submit). Only checked on an approval, not a rejection.
    // Isolated try/catch, same "never turn a successful admin action into a
    // 500" pattern as every other badge-check call site.
    if (status === 'VERIFIED') {
      try {
        await checkAndAwardBadges(user._id, 'verification', req.app.get('io'));
      } catch (badgeErr) {
        console.error('Badge check error (photo verification approval):', badgeErr);
      }
    }

    return res.json({
      userId: user._id,
      photoVerification: {
        status: user.photoVerification.status,
        verifiedAt: user.photoVerification.verifiedAt,
      },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Admin update photo verification error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/admin/users?email=&page=&limit= (role: ADMIN+) — basic
// search-by-email / list view backing the frontend's user management screen
// (suspend/reinstate actions need a way to find a target user). Not
// explicitly named as a separate bullet in the original task's backend route
// list, but required to make suspend/reinstate usable without already
// knowing a target userId — documented here and in
// docs/API_DOCUMENTATION.md as an addition within this task's scope. Gated
// at the same role tier as suspend/reinstate (ADMIN+), since listing user
// accountStatus/role is part of that same user-management surface.
router.get('/users', requireRole(...SUSPEND_ROLES), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req);

    const filter = {};
    if (req.query.email !== undefined && String(req.query.email).trim()) {
      const email = String(req.query.email).trim();
      filter.email = new RegExp(escapeRegExp(email), 'i');
    }

    const users = await User.find(filter)
      .select('email role accountStatus mobileVerification.status photoVerification.status createdAt lastLoginAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1);

    const hasMore = users.length > limit;
    const pageUsers = users.slice(0, limit);

    const profiles = await Profile.find({ user: { $in: pageUsers.map((u) => u._id) } }).select(
      'user displayName'
    );
    const nameByUser = new Map(profiles.map((p) => [String(p.user), p.displayName || null]));

    return res.json({
      users: pageUsers.map((u) => ({
        id: u._id,
        email: u.email,
        displayName: nameByUser.get(String(u._id)) || null,
        role: u.role,
        accountStatus: u.accountStatus,
        mobileVerified: u.mobileVerification?.status === 'VERIFIED',
        photoVerified: u.photoVerification?.status === 'VERIFIED',
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      page,
      hasMore,
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/admin/users/:userId/suspend (role: ADMIN+) — blocks the target
// user at their next login attempt (backend/routes/auth.js) and hides them
// from discovery (backend/routes/discovery.js). Does not touch existing
// matches/messages/reports — this is an account-access gate, not a data
// deletion.
router.patch('/users/:userId/suspend', requireRole(...SUSPEND_ROLES), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId must be a valid id' });
    }
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot suspend your own account' });
    }

    const user = await User.findById(userId).select('accountStatus');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.accountStatus = 'SUSPENDED';
    await user.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: 'user.suspended',
      targetUserId: user._id,
      details: {},
    });

    return res.json({ userId: user._id, accountStatus: user.accountStatus });
  } catch (err) {
    console.error('Admin suspend user error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/admin/users/:userId/reinstate (role: ADMIN+) — reverses a
// suspension.
router.patch('/users/:userId/reinstate', requireRole(...SUSPEND_ROLES), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId must be a valid id' });
    }

    const user = await User.findById(userId).select('accountStatus');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.accountStatus = 'ACTIVE';
    await user.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: 'user.reinstated',
      targetUserId: user._id,
      details: {},
    });

    return res.json({ userId: user._id, accountStatus: user.accountStatus });
  } catch (err) {
    console.error('Admin reinstate user error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// PATCH /api/admin/users/:userId/role (role: SUPER_ADMIN only) — restricted
// tighter than every other route in this file. ADMIN/MODERATOR callers are
// 403'd by requireRole before this handler ever runs, so there is no
// in-handler "are you trying to escalate yourself" check to bypass — the
// role gate itself is the enforcement. Deliberately no special-case
// preventing a SUPER_ADMIN from changing their own role (e.g. demoting
// themselves) — that is a first-admin's own informed decision to make, not
// something this MVP pass tries to protect them from.
router.patch('/users/:userId/role', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId must be a valid id' });
    }

    const { role } = req.body || {};
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${USER_ROLES.join(', ')}` });
    }

    const user = await User.findById(userId).select('role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: 'user.role_changed',
      targetUserId: user._id,
      details: { oldRole, newRole: role },
    });

    return res.json({ userId: user._id, role: user.role });
  } catch (err) {
    console.error('Admin change role error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/admin/discovery/ranking-weights (role: ADMIN+) — Task #19
// (weighted discovery ranking, V2, user-requested). Fulfils
// docs/BUSINESS_PLAN.md's "must remain configurable" expectation for
// weighted-model tuning: an admin can read the four ranking weights
// currently in effect (backend/utils/discoveryRankingUtils.js) without
// reading source code. Gated at the same ADMIN+ tier as suspend/reinstate
// (SUSPEND_ROLES) — tuning the ranking algorithm is an account/product-wide
// setting change, not a MODERATOR-level moderation action.
router.get('/discovery/ranking-weights', requireRole(...SUSPEND_ROLES), async (req, res) => {
  return res.json({ weights: getRankingWeights(), defaults: DEFAULT_RANKING_WEIGHTS });
});

// PATCH /api/admin/discovery/ranking-weights (role: ADMIN+) — body is a
// partial or full `{ compatibility?, distance?, trust?, activity? }`
// object; only the provided keys change, the rest keep their current value.
// **Honestly scoped, not silently overstated:** this mutates an in-process
// object (backend/utils/discoveryRankingUtils.js's module-level
// `currentRankingWeights`), so it takes effect immediately for every
// request on this server process, but is NOT persisted to the database — a
// server restart resets to DEFAULT_RANKING_WEIGHTS. See that file's own
// top comment for why a full persisted-config collection wasn't built in
// this pass. Validation (non-negative numbers, weights summing to ~1.0) is
// enforced by setRankingWeights() itself; an invalid update is rejected
// with 400 and the stored weights are left completely unchanged.
router.patch('/discovery/ranking-weights', requireRole(...SUSPEND_ROLES), async (req, res) => {
  try {
    const { compatibility, distance, trust, activity } = req.body || {};
    const partial = {};
    if (compatibility !== undefined) partial.compatibility = Number(compatibility);
    if (distance !== undefined) partial.distance = Number(distance);
    if (trust !== undefined) partial.trust = Number(trust);
    if (activity !== undefined) partial.activity = Number(activity);
    if (Object.keys(partial).length === 0) {
      return res
        .status(400)
        .json({ message: 'Provide at least one of: compatibility, distance, trust, activity' });
    }

    const weights = setRankingWeights(partial);

    await writeAuditLog({
      actorId: req.user.id,
      action: 'discovery.ranking_weights_changed',
      targetUserId: null,
      details: { weights },
    });

    return res.json({ weights });
  } catch (err) {
    // setRankingWeights() throws a plain Error with a caller-facing message
    // on invalid input (negative weight, doesn't sum to ~1.0) — surfaced as
    // 400, same "validation error -> 400 with the thrown message" pattern
    // already used elsewhere in this file (e.g. the ValidationError catches
    // above).
    return res.status(400).json({ message: err.message });
  }
});

module.exports = router;
