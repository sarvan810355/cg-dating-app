import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../api';
import { getSocket } from '../socket';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const MAX_CACHED_NOTIFICATIONS = 50;

// App-wide notification state (Task #6, see docs/ROADMAP.md Phase 6):
// unread count + a recent-notifications cache, kept fresh via a poll-on-
// mount fetch plus the live 'notification:new' Socket.IO event. This
// provider also owns connecting the shared Socket.IO client
// (frontend/src/socket.js) for the whole authenticated session — unlike the
// old Chat.jsx-only connect/disconnect lifecycle, the connection now needs
// to persist across navigation so the notification bell stays live outside
// of any specific chat screen. See AuthContext.logout() for where it's torn
// back down.
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Task #20 — Achievements/Badges (V2 scope): the "celebratory unlock
  // moment" the task asks for, built by reusing this already-existing live
  // notification flow (the 'notification:new' socket event below) rather
  // than a separate real-time mechanism — see NotificationBell.jsx, which
  // renders this as a small, auto-dismissing toast. Holds at most the ONE
  // most recent unseen badge notification; a second badge unlocked in quick
  // succession simply replaces it rather than queuing (kept deliberately
  // simple — "don't over-animate", per the task spec).
  const [celebration, setCelebration] = useState(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await api.getUnreadNotificationCount();
      setUnreadCount(data.unreadCount);
    } catch {
      // Non-critical — the badge just stays at its last known value; the
      // next poll/socket event will reconcile it.
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications({ limit: MAX_CACHED_NOTIFICATIONS });
      setNotifications(data.notifications);
      setLoaded(true);
    } catch {
      // Non-critical — the dropdown/list just shows whatever it had before.
    }
  }, []);

  // Fetch the unread badge count once per authenticated session (on
  // login/app-load). The notification list itself is fetched lazily, only
  // when the bell/dropdown is actually opened (see NotificationBell.jsx),
  // to avoid paginated work on every page load.
  useEffect(() => {
    if (user) {
      refreshUnreadCount();
    } else {
      setUnreadCount(0);
      setNotifications([]);
      setLoaded(false);
    }
  }, [user, refreshUnreadCount]);

  // Live badge updates: connect the shared socket for the session and
  // listen for 'notification:new' (backend/socket.js emits this to the
  // recipient's personal `user:<id>` room — see
  // backend/utils/notificationUtils.js). Connecting here (rather than only
  // in Chat.jsx) is what lets the badge update live while browsing
  // Discover/Matches/Dashboard, not just while a chat happens to be open.
  useEffect(() => {
    if (!user) return undefined;

    const socket = getSocket();

    function handleNotificationNew(notification) {
      setUnreadCount((count) => count + 1);
      setNotifications((prev) => [notification, ...prev].slice(0, MAX_CACHED_NOTIFICATIONS));
      // Task #20 — a badge notification also drives the small celebration
      // toast (see the `celebration` state above) — every other type keeps
      // behaving exactly as before (bell badge + dropdown list only).
      if (notification.type === 'badge') {
        setCelebration(notification);
      }
    }

    socket.on('notification:new', handleNotificationNew);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('notification:new', handleNotificationNew);
      // Deliberately not disconnecting here — this provider wraps the whole
      // authenticated app and should keep the connection open across
      // navigation; AuthContext.logout() disconnects it on sign-out.
    };
  }, [user]);

  const markRead = useCallback(async (id) => {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.read) wasUnread = true;
        return n.id === id ? { ...n, read: true } : n;
      })
    );
    if (wasUnread) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    try {
      await api.markNotificationRead(id);
    } catch {
      // Best-effort — a future refresh reconciles any drift.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      // Best-effort — a future refresh reconciles any drift.
    }
  }, []);

  const dismissCelebration = useCallback(() => setCelebration(null), []);

  const value = {
    unreadCount,
    notifications,
    loaded,
    refreshNotifications,
    refreshUnreadCount,
    markRead,
    markAllRead,
    celebration,
    dismissCelebration,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
