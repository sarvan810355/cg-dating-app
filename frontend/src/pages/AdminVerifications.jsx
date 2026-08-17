import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import AdminNav from '../components/AdminNav';
import Button from '../components/Button';

// Photo-verification review queue (Task #11 in the internal TaskList; =
// docs/ROADMAP.md's Phase 9) — lists PENDING photoVerification submissions
// (GET /api/admin/verifications/photo) with the submitted selfie itself
// (admin-only view — see backend/routes/admin.js's route comment) and
// approve/reject actions (PATCH /api/admin/verifications/photo/:userId).
// This is the transition Task #9's POST /api/verification/photo/submit
// always left at PENDING — see MOCK_FEATURES.md's manual-review note.
function VerificationRow({ item, onReview, reviewing }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <img
        src={item.submittedPhotoUrl}
        alt="Submitted selfie"
        className="h-32 w-32 shrink-0 rounded-xl border border-border object-cover sm:h-24 sm:w-24"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">
          {item.displayName || item.email || item.userId}
        </p>
        <p className="text-xs text-text-secondary">{item.email}</p>
        <p className="text-xs text-text-secondary">
          Submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'unknown'}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          loading={reviewing === 'VERIFIED'}
          disabled={!!reviewing}
          onClick={() => onReview(item.userId, 'VERIFIED')}
        >
          Approve
        </Button>
        <Button
          variant="destructive"
          loading={reviewing === 'REJECTED'}
          disabled={!!reviewing}
          onClick={() => onReview(item.userId, 'REJECTED')}
        >
          Reject
        </Button>
      </div>
    </li>
  );
}

function AdminVerifications() {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingUserId, setReviewingUserId] = useState(null);
  const [reviewingStatus, setReviewingStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAdminPhotoVerifications({ status: 'PENDING' })
      .then((data) => {
        if (!cancelled) setItems(data.verifications);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the verification queue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReview(userId, status) {
    setReviewingUserId(userId);
    setReviewingStatus(status);
    setError('');
    try {
      await api.reviewAdminPhotoVerification(userId, status);
      setItems((prev) => prev.filter((i) => String(i.userId) !== String(userId)));
    } catch (err) {
      setError(err.message || 'Could not update this verification — try again');
    } finally {
      setReviewingUserId(null);
      setReviewingStatus(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Exit admin
          </Link>
        </div>

        <AdminNav />

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {loading && <p className="py-16 text-center text-text-secondary">Loading…</p>}

        {!loading && items?.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-1 text-lg font-semibold text-text-primary">Queue is clear</p>
            <p className="text-sm text-text-secondary">No pending photo verifications right now.</p>
          </div>
        )}

        {items?.length > 0 && (
          <ul className="space-y-3">
            {items.map((item) => (
              <VerificationRow
                key={item.userId}
                item={item}
                reviewing={reviewingUserId === item.userId ? reviewingStatus : null}
                onReview={handleReview}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminVerifications;
