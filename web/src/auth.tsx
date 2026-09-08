import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

interface AuthState {
  user: any | null;
  profile: any | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!api.accessToken) { setUser(null); setProfile(null); setLoading(false); return; }
    try {
      const me = await api.get('/auth/me');
      setUser(me.user);
      setProfile(me.profile);
    } catch {
      setUser(null); setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { api.onUser = (u) => setUser(u); refresh(); }, []);

  const logout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    api.setTokens(null, null);
    setUser(null); setProfile(null);
  };

  return (
    <AuthCtx.Provider value={{ user, profile, loading, refresh, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
