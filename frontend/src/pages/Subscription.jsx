import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';

// Subscription / Upgrade screen (Task #12 in the internal TaskList —
// Subscription scaffolding). Lists the admin-configured plans from
// GET /api/plans and lets the caller "Subscribe" via a MOCK checkout
// (POST /api/subscription/subscribe) — there is no real payment form here,
// see backend/routes/subscription.js's route-level comment and
// MOCK_FEATURES.md. The button still reads as a real commit action (not
// visibly fake) since the mock nature is a backend/documentation concern,
// not something the UI needs to undersell.

const FEATURE_LABELS = {
  unlimited_likes: 'Unlimited likes',
  advanced_filters: 'Advanced filters',
  see_who_liked_you: 'See who liked you',
  boost: 'Profile boost',
  incognito: 'Incognito / invisible browsing',
};

function formatRupees(priceInPaise) {
  return (priceInPaise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PlanCard({ plan, isCurrent, subscribing, onSubscribe }) {
  return (
    <div
      className={`rounded-2xl border bg-surface p-5 shadow-sm ${
        isCurrent ? 'border-primary ring-1 ring-primary' : 'border-border'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-lg font-bold text-text-primary">{plan.name}</h3>
        {isCurrent && (
          <span className="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
            Current plan
          </span>
        )}
      </div>
      <p className="mb-4 text-2xl font-bold text-text-primary">
        {formatRupees(plan.priceInPaise)}
        <span className="text-sm font-normal text-text-secondary">
          {' '}
          / {plan.billingPeriod === 'yearly' ? 'year' : 'month'}
        </span>
      </p>
      <ul className="mb-5 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-text-primary">
            <span className="text-success" aria-hidden="true">
              ✓
            </span>
            {FEATURE_LABELS[feature] || feature}
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        variant={isCurrent ? 'secondary' : 'primary'}
        disabled={isCurrent || subscribing}
        loading={subscribing}
        onClick={() => onSubscribe(plan.code)}
      >
        {isCurrent ? 'Active' : 'Subscribe'}
      </Button>
    </div>
  );
}

function Subscription() {
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribingCode, setSubscribingCode] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadAll() {
    setError('');
    try {
      const [plansData, subData] = await Promise.all([api.getPlans(), api.getMySubscription()]);
      setPlans(plansData.plans || []);
      setSubscription(subData.subscription || null);
    } catch (err) {
      setError(err.message || 'Could not load subscription plans');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAll();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe(planCode) {
    setSubscribingCode(planCode);
    setError('');
    setNotice('');
    try {
      const data = await api.subscribeToPlan(planCode);
      setSubscription(data.subscription);
      setNotice(data.message || 'Subscription activated');
    } catch (err) {
      setError(err.message || 'Could not activate that plan — try again');
    } finally {
      setSubscribingCode(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setError('');
    setNotice('');
    try {
      const data = await api.cancelSubscription();
      setSubscription(data.subscription);
      setNotice(data.message || 'Subscription cancelled');
    } catch (err) {
      setError(err.message || 'Could not cancel your subscription — try again');
    } finally {
      setCancelling(false);
    }
  }

  const currentPlanCode = subscription?.status === 'ACTIVE' ? subscription.plan?.code : null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Upgrade your plan</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Home
          </Link>
        </div>

        <p className="mb-6 text-sm text-text-secondary">
          Free stays genuinely usable — profile, discovery, matches, messaging, and a
          daily like allowance are all free. Upgrade for unlimited likes and more.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>
        )}

        {subscription && (
          <div className="mb-6 rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-text-secondary">Your subscription</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {subscription.plan?.name}{' '}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  subscription.status === 'ACTIVE'
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                }`}
              >
                {subscription.status === 'ACTIVE' ? 'Active' : 'Cancelled'}
              </span>
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {subscription.status === 'ACTIVE' ? 'Renews' : 'Access ends'} on{' '}
              {formatDate(subscription.expiresAt)}
            </p>
            {subscription.status === 'ACTIVE' && (
              <Button
                variant="destructive"
                className="mt-4"
                disabled={cancelling}
                loading={cancelling}
                onClick={handleCancel}
              >
                Cancel subscription
              </Button>
            )}
          </div>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading plans…</p>}

        {!loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                isCurrent={plan.code === currentPlanCode}
                subscribing={subscribingCode === plan.code}
                onSubscribe={handleSubscribe}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-text-secondary">
          This is a demo checkout — no real payment is processed. See MOCK_FEATURES.md.
        </p>
      </div>
    </div>
  );
}

export default Subscription;
