const express = require('express');
const crypto = require('crypto');

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { requireAuth } = require('../middleware/auth');
const { getEffectiveSubscription, grantPlanCredits } = require('../utils/entitlementUtils');
const { toPlanJSON, toSubscriptionJSON } = require('../utils/subscriptionSerializers');
const {
  PLAN_CODES,
  BILLING_PERIOD_DAYS,
  MS_PER_DAY,
} = require('../constants/subscriptionOptions');

const router = express.Router();

// Generates a fake gateway reference for the MOCK checkout below, shaped
// like a plausible Razorpay payment id (`pay_...`) so it's visually
// obvious in logs/UI which integration produced it without being
// mistaken for a real one — see the MOCK/TEMPORARY comment on POST
// /subscribe.
function generateMockPaymentReference() {
  return `mock_pay_${crypto.randomBytes(10).toString('hex')}`;
}

// GET /api/plans (public, no auth) — what a paywall screen shows before the
// user commits to anything. Only active plans, cheapest first.
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ priceInPaise: 1 });
    return res.json({ plans: plans.map(toPlanJSON) });
  } catch (err) {
    console.error('List plans error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// GET /api/subscription/me (protected) — the caller's current effective
// subscription (ACTIVE, or CANCELLED-but-still-valid), or
// { subscription: null } for a free-tier user. Always re-derived from the
// database on every call — never cached on the JWT.
router.get('/subscription/me', requireAuth, async (req, res) => {
  try {
    const subscription = await getEffectiveSubscription(req.user.id);
    return res.json({ subscription: subscription ? toSubscriptionJSON(subscription) : null });
  } catch (err) {
    console.error('Get my subscription error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/subscription/subscribe (protected) — body { planCode }.
//
// ================================ MOCK / TEMPORARY =========================
// There is NO real Razorpay integration here — no credentials are
// configured for this project (see MOCK_FEATURES.md). This endpoint
// immediately creates an ACTIVE Subscription and returns success, standing
// in for what would otherwise be: (1) create a Razorpay order for the
// plan's price, (2) return the order to the client to open Razorpay
// Checkout, (3) the client completes payment, (4) Razorpay calls a
// signature-verified webhook (POST /api/payments/webhook, not built in
// this pass — see docs/DATABASE_SCHEMA.md's `payments` collection and its
// `webhookVerifiedAt` field), and ONLY THEN would a subscription be marked
// ACTIVE. Skipping straight to "ACTIVE" here means anyone who can call this
// authenticated endpoint gets the plan for free — this must never ship to
// production as-is. `paymentProvider`/`paymentReference` are deliberately
// still recorded on the Subscription document (as 'mock_razorpay' / a fake
// generated reference) so it's traceable in the DB which subscriptions were
// created via this mock path vs. a real future integration.
// =============================================================================
router.post('/subscription/subscribe', requireAuth, async (req, res) => {
  try {
    const { planCode } = req.body || {};
    if (!planCode || !PLAN_CODES.includes(planCode)) {
      return res.status(400).json({ message: `planCode must be one of: ${PLAN_CODES.join(', ')}` });
    }

    const plan = await Plan.findOne({ code: planCode, isActive: true });
    if (!plan) {
      return res.status(404).json({ message: 'That plan is not currently available' });
    }

    const now = new Date();
    const days = BILLING_PERIOD_DAYS[plan.billingPeriod] || 30;
    const expiresAt = new Date(now.getTime() + days * MS_PER_DAY);

    const subscription = await Subscription.create({
      user: req.user.id,
      plan: plan._id,
      status: 'ACTIVE',
      startedAt: now,
      expiresAt,
      paymentProvider: 'mock_razorpay',
      paymentReference: generateMockPaymentReference(),
    });
    await subscription.populate('plan');

    // Task #16 — Profile Boost + Priority Like (V2 scope): a ONE-TIME
    // credit top-up on subscribe, additive to whatever balance the caller
    // already had (see backend/utils/entitlementUtils.js#grantPlanCredits()'s
    // own comment for the full "why one-time, not recurring" writeup —
    // there is no job scheduler in this codebase to re-grant on renewal).
    // Isolated in its own try/catch, same "a side-effect failure never
    // turns a successful subscribe into an error response" pattern already
    // used for notification creation in backend/routes/discovery.js's POST
    // /swipe — the Subscription itself is already committed above by the
    // time this runs.
    let creditsGranted = { boostGrant: 0, priorityGrant: 0 };
    try {
      creditsGranted = await grantPlanCredits(req.user.id, plan, now);
    } catch (grantErr) {
      console.error('Plan credit grant error (subscribe):', grantErr);
    }

    return res.status(201).json({
      message: 'Subscription activated (mock checkout — no real payment was processed)',
      subscription: toSubscriptionJSON(subscription),
      // Surfaced so the frontend can show "+3 Boost credits, +8 Priority
      // Likes added" on a successful upgrade rather than the caller having
      // to separately call GET /api/boosts/status / GET /api/auth/me to
      // notice their balance changed.
      creditsGranted: {
        boostCredits: creditsGranted.boostGrant,
        priorityLikes: creditsGranted.priorityGrant,
      },
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

// POST /api/subscription/cancel (protected) — sets the caller's current
// ACTIVE subscription to CANCELLED. Standard SaaS behavior: this stops
// future renewal, it does NOT immediately revoke access — the subscription
// (and hasFeature()) both stay valid until its already-paid-for
// `expiresAt`. Idempotent: cancelling an already-cancelled-but-still-valid
// subscription just returns its current state rather than erroring.
router.post('/subscription/cancel', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const active = await Subscription.findOne({
      user: req.user.id,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    })
      .sort({ expiresAt: -1 })
      .populate('plan');

    if (active) {
      active.status = 'CANCELLED';
      active.cancelledAt = now;
      await active.save();
      return res.json({
        message: 'Subscription cancelled — you keep access until it expires',
        subscription: toSubscriptionJSON(active),
      });
    }

    // Nothing currently ACTIVE — maybe already cancelled-but-still-valid,
    // maybe genuinely free-tier. Distinguish the two for a clearer message.
    const alreadyCancelled = await Subscription.findOne({
      user: req.user.id,
      status: 'CANCELLED',
      expiresAt: { $gt: now },
    })
      .sort({ expiresAt: -1 })
      .populate('plan');

    if (alreadyCancelled) {
      return res.json({
        message: 'Subscription is already cancelled',
        subscription: toSubscriptionJSON(alreadyCancelled),
      });
    }

    return res.status(404).json({ message: 'No active subscription to cancel' });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
