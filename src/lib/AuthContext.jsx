import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError] = useState(null);
  const [appPublicSettings] = useState({ id: 'frive-app' });

  useEffect(() => {
    const stored = localStorage.getItem('frive_user');
    if (stored) {
      setUser(JSON.parse(stored));
    } else {
      const defaultUser = { id: 'admin-1', email: 'admin@frive.co.uk', full_name: 'Frive Admin', role: 'admin' };
      localStorage.setItem('frive_user', JSON.stringify(defaultUser));
      setUser(defaultUser);
    }
    setIsLoadingAuth(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('frive_user');
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings, authChecked: true, logout, navigateToLogin: () => {}, checkUserAuth: () => {}, checkAppState: () => {} }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
