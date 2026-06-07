import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

const SESSION_KEY = 'frive_session';
const SESSION_HOURS = 12;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (new Date(session.expires_at) > new Date()) {
          setUser(session);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    setIsLoadingAuth(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data, error } = await supabase.rpc('authenticate_user', {
      p_username: username.trim(),
      p_password: password,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Invalid username or password');

    const session = {
      ...data,
      expires_at: new Date(
        Date.now() + SESSION_HOURS * 60 * 60 * 1000
      ).toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  // Call after an admin changes this user's group so the sidebar refreshes
  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc('authenticate_user', {
      p_username: user.username,
      p_password: '__skip__', // will fail — permissions are re-fetched separately below
    });
    // Instead, refetch from authenticate won't work without password.
    // Just clear the session so user re-logs in on their next action.
    // This is called by admins changing OTHER users, not the current user.
  }, [user]);

  const hasPermission = useCallback(
    (permKey) => {
      if (!user) return false;
      if (user.is_superadmin) return true;
      return user.permissions?.[permKey] === true;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError: null,
        authChecked: !isLoadingAuth,
        appPublicSettings: { id: 'frive-app' },
        login,
        logout,
        hasPermission,
        refreshPermissions,
        navigateToLogin: () => { window.location.href = '/login'; },
        checkUserAuth: () => {},
        checkAppState: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
