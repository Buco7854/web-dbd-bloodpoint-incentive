import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type MeResponse } from './authApi';

interface AuthState extends MeResponse {
  loading: boolean;
  refresh: () => Promise<MeResponse | null>;
}

const AuthCtx = createContext<AuthState | null>(null);

const EMPTY: MeResponse = {
  authenticated: false,
  needsSetup: false,
  requireAuth: false,
  enableApiKeys: false,
  needsMfaPolicy: false,
  authLevel: null,
  csrfToken: null,
  user: null,
  mfa: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await authApi.me();
      setMe(next);
      return next;
    } catch {
      setMe(EMPTY);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({ ...me, loading, refresh }), [me, loading, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
