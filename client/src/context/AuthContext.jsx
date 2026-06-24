// client/src/context/AuthContext.jsx
//
// JWT lives in an HttpOnly cookie — JS cannot read it.
// All fetch calls that need auth must use:
//   credentials: 'include'        ← sends the cookie automatically
// NOT:
//   Authorization: Bearer token   ← token is undefined in this architecture
//
// PaywallModal and useStudyPlanner have been updated accordingly.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const POLL_INTERVAL_MS = 15_000;

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: verify session via /api/auth/me (cookie sent automatically)
  useEffect(() => {
    const savedUser = localStorage.getItem('sf_user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch { /* ignore corrupt cache */ }
    }

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem('sf_user', JSON.stringify(data.user));
        } else {
          setUser(null);
          localStorage.removeItem('sf_user');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Background Pro-status poll
  // FIX (Bug 4): When the server returns a non-ok response (401 expired token),
  // the old handler just returned early, leaving the user visually logged in
  // indefinitely with no state cleanup or redirect to /login.
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          // Session expired or token invalid - clear state so App shows login.
          // FIX: This app has no router, so window.location.href='/login'
          // caused a blank page. Setting user=null is enough:
          // App.jsx renders the login screen whenever user === null.
          setUser(null);
          localStorage.removeItem('sf_user');
          return;
        }
        const { user: fresh } = await res.json();
        setUser(prev => {
          if (prev?.isPro === fresh.isPro && prev?.name === fresh.name) return prev;
          localStorage.setItem('sf_user', JSON.stringify(fresh));
          return fresh;
        });
      } catch {}
    };
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user?._id]);

  // Re-check Pro status when tab regains focus
  useEffect(() => {
    const onFocus = async () => {
      if (!user) return;
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;
        const { user: fresh } = await res.json();
        if (fresh?.isPro !== user?.isPro) {
          setUser(fresh);
          localStorage.setItem('sf_user', JSON.stringify(fresh));
        }
      } catch {}
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user?._id, user?.isPro]);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('sf_user', JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setUser(null);
    localStorage.removeItem('sf_user');
  };

  const refreshUser = useCallback(async (updatedUser) => {
    if (updatedUser) {
      setUser(updatedUser);
      localStorage.setItem('sf_user', JSON.stringify(updatedUser));
      return;
    }
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('sf_user', JSON.stringify(data.user));
      }
    } catch {}
  }, []);

  return (
    // NOTE: no `token` value — JWT is in HttpOnly cookie, not JS-accessible.
    // Use credentials: 'include' on every fetch instead.
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);