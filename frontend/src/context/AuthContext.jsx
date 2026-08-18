import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../api';
import { disconnectSocket } from '../socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!api.getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch {
      // Token is invalid/expired - clear it.
      api.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  async function signup(email, password, referralCode) {
    const data = await api.signup(email, password, referralCode);
    api.setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function login(email, password) {
    const data = await api.login(email, password);
    api.setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    api.clearToken();
    setUser(null);
    // Task #6: the shared Socket.IO connection now stays open for the whole
    // authenticated session (NotificationContext connects it, not just
    // Chat.jsx) so live notification delivery works from any screen — tear
    // it down here instead, so a logged-out session doesn't keep an
    // authenticated-looking socket alive.
    disconnectSocket();
  }

  // Task #16 — Profile Boost + Priority Like (V2 scope): exposed so a screen
  // that just spent a boost/priority-like credit (Discovery.jsx) can pull a
  // fresh `user.boostCreditsRemaining`/`priorityLikesRemaining` into
  // AuthContext without a full page reload — same underlying GET
  // /api/auth/me call this context already makes on mount, just callable
  // again on demand.
  const value = { user, loading, signup, login, logout, refreshUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
