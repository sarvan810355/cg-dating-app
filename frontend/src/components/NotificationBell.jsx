import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';

// Renders the display text for one notification, per type — see
// docs/API_DOCUMENTATION.md's Notifications section for the payload shapes
// backend/utils/notificationUtils.js actually produces. 'like' deliberately
// never has an identity in its payload (premium-gated reveal, see
// backend/routes/discovery.js's notification-creation comment) — the
// generic text below is the ENTIRE point of that design choice, not a
// missing-data fallback.
function notificationText(n) {
  switch (n.type) {
    case 'match':
      return `You have a new match with ${n.payload?.fromUserName || 'someone new'}!`;
    case 'like':
      return 'Someone liked your profile';
    case 'message':
      return `New message from ${n.payload?.fromUserName || 'a match'}${
        n.payload?.preview ? `: "${n.payload.preview}"` : ''
      }`;
    case 'verification':
      return 'An update on your verification status';
    case 'safety':
      return 'A safety update on your account';
    case 'subscription':
      return 'An update on your subscription';
    default:
      return 'You have a new notification';
  }
}

// Where tapping a notification should navigate — see the Task #6 spec: match
// -> its chat, message -> its chat, like -> Discover (no dedicated "who
// liked you" screen exists yet, and it's premium-gated anyway). Other types
// have no destination yet (Verification/Safety/Subscription screens don't
// exist), so they just mark read in place.
function notificationTarget(n) {
  if (n.type === 'match' || n.type === 'message') {
    return n.payload?.matchId ? `/chat/${n.payload.matchId}` : null;
  }
  if (n.type === 'like') {
    return '/discover';
  }
  return null;
}

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// Bell icon + unread badge + dropdown notification list — see
// docs/DESIGN_SYSTEM.md's component list (Badge, EmptyState). Dropped into
// the main nav of Dashboard/Discovery/Matches (see those pages).
function NotificationBell() {
  const { unreadCount, notifications, loaded, refreshNotifications, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && !loaded) {
      refreshNotifications();
    }
  }, [open, loaded, refreshNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleSelect(n) {
    if (!n.read) markRead(n.id);
    const target = notificationTarget(n);
    setOpen(false);
    if (target) navigate(target);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg text-text-secondary transition hover:bg-primary-subtle hover:text-primary"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!loaded && (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">Loading…</p>
            )}

            {loaded && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">
                No notifications yet
              </p>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelect(n)}
                className={`flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left text-sm transition last:border-b-0 hover:bg-primary-subtle ${
                  n.read ? 'bg-surface' : 'bg-primary-subtle/40'
                }`}
              >
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                )}
                <span className={`flex-1 ${n.read ? '' : 'font-medium'} text-text-primary`}>
                  {notificationText(n)}
                  <span className="mt-0.5 block text-xs font-normal text-text-secondary">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
