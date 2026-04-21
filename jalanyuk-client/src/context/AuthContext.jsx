// context/AuthContext.jsx

import { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from '../api/gateway';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('jalanyuk_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username, password) => {
    const data = await authApi.login({ username, password });
    const userInfo = {
      user_id: data.user_id,
      session_token: data.session_token,
      role: data.role,
      username: data.username,
    };
    setUser(userInfo);
    sessionStorage.setItem('jalanyuk_user', JSON.stringify(userInfo));
    return userInfo;
  }, []);

  const register = useCallback(async (username, password, role) => {
    return authApi.register({ username, password, role });
  }, []);

  const logout = useCallback(async () => {
    if (user?.session_token) {
      try { await authApi.logout(user.session_token); } catch {}
    }
    setUser(null);
    sessionStorage.removeItem('jalanyuk_user');
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
