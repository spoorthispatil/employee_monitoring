import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, tokens } from '../lib/api';

interface User { id: string; name: string; email: string; role: string; dept_id?: string; }
interface AuthCtx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isHR: boolean; isManager: boolean; isContractor: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('so_user');
    if (stored && tokens.access) { try { setUser(JSON.parse(stored)); } catch { tokens.clear(); } }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authAPI.login(email, password);
    const { access_token, refresh_token, user: u } = data.data;
    tokens.set(access_token, refresh_token);
    localStorage.setItem('so_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    authAPI.logout().catch(() => {});
    tokens.clear();
    localStorage.removeItem('so_user');
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{
      user, loading, login, logout,
      isHR: user?.role === 'hr_admin',
      isManager: ['hr_admin','dept_manager'].includes(user?.role || ''),
      isContractor: user?.role === 'contractor',
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
