// Shared Plan/Subscription -> API JSON shapes (Task #12 — Subscription
// scaffolding), used by backend/routes/subscription.js. Explicit
// whitelists (never a raw toObject() dump) — same convention as
// backend/utils/profileSerializers.js / verificationUtils.js.

function toPlanJSON(plan) {
  const obj = plan.toObject ? plan.toObject() : plan;
  return {
    id: obj._id,
    code: obj.code,
    name: obj.name,
    priceInPaise: obj.priceInPaise,
    billingPeriod: obj.billingPeriod,
    features: obj.features,
    isActive: obj.isActive,
  };
}

// `subscription.plan` must already be populated by the caller (see
// backend/routes/subscription.js) — this never re-fetches it itself.
function toSubscriptionJSON(subscription) {
  const obj = subscription.toObject ? subscription.toObject() : subscription;
  return {
    id: obj._id,
    status: obj.status,
    startedAt: obj.startedAt,
    expiresAt: obj.expiresAt,
    cancelledAt: obj.cancelledAt || null,
    paymentProvider: obj.paymentProvider,
    paymentReference: obj.paymentReference,
    plan:
      obj.plan && typeof obj.plan === 'object' && obj.plan.code
        ? toPlanJSON(obj.plan)
        : null,
  };
}

module.exports = { toPlanJSON, toSubscriptionJSON };
