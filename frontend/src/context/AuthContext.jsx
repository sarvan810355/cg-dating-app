import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../api';

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

  async function signup(email, password) {
    const data = await api.signup(email, password);
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
  }

  const value = { user, loading, signup, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
