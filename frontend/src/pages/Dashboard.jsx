import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyProfile, getVerificationStatus } from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import NotificationBell from '../components/NotificationBell';
import VerificationBadge from '../components/VerificationBadge';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [verification, setVerification] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((data) => {
        if (!cancelled) setProfile(data.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    // Task #9 — Verification: own-account badges. Failure here is
    // non-fatal — the dashboard still renders fine without badges (e.g. a
    // brand-new account that's never touched verification).
    getVerificationStatus()
      .then((data) => {
        if (!cancelled) setVerification(data);
      })
      .catch(() => {
        if (!cancelled) setVerification(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mobileVerified = verification?.mobileVerification?.status === 'VERIFIED';
  const photoVerified = verification?.photoVerification?.status === 'VERIFIED';

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-primary">CG Dating</h1>
          <NotificationBell />
        </div>
        <p className="mb-4 text-text-secondary">You're logged in as</p>
        <p className="mb-6 text-lg font-medium text-text-primary">{user?.email}</p>

        {!loadingProfile && (
          <div className="mb-6 rounded-xl border border-border bg-background p-4 text-left">
            <div className="mb-3 flex items-center gap-3">
              <Avatar
                src={profile?.photos?.find((p) => p.isPrimary)?.url}
                name={profile?.displayName}
                size="md"
                verified={photoVerified}
              />
              <div>
                <p className="font-medium text-text-primary">
                  {profile?.displayName || 'Your profile'}
                </p>
                <p className="text-xs text-text-secondary">
                  {profile ? `${profile.profileCompletionPercentage}% complete` : 'Not set up yet'}
                </p>
                {(mobileVerified || photoVerified) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {mobileVerified && <VerificationBadge type="mobile" />}
                    {photoVerified && <VerificationBadge type="photo" />}
                  </div>
                )}
              </div>
            </div>

            {profile && (
              <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-primary-subtle">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${profile.profileCompletionPercentage}%` }}
                />
              </div>
            )}

            {profile?.completionHints?.length > 0 && (
              <p className="mb-3 text-xs text-text-secondary">
                💡 {profile.completionHints[0]}
              </p>
            )}

            <Link to="/profile/edit">
              <Button variant="secondary" className="w-full">
                {profile ? 'Edit profile' : 'Set up your profile'}
              </Button>
            </Link>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Link to="/discover">
            <Button variant="secondary" className="w-full">
              Discover
            </Button>
          </Link>
          <Link to="/matches">
            <Button variant="secondary" className="w-full">
              Matches
            </Button>
          </Link>
        </div>

        <Link to="/verification">
          <Button variant="ghost" className="w-full">
            {mobileVerified && photoVerified ? 'Verification' : 'Get Verified'}
          </Button>
        </Link>

        <Link to="/settings">
          <Button variant="ghost" className="w-full">
            Settings
          </Button>
        </Link>

        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </div>
  );
}

export default Dashboard;
