import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse, PublicConfig, SignedInMe } from '../../shared/api-types.ts';
import { api } from './api.ts';
import { setDisplayConfig } from './format.ts';

interface SessionState {
  me: SignedInMe | null;
  config: PublicConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/** Loads the public config once, and the signed-in buyer (if any). Visitors can browse without signing in. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SignedInMe | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await api<MeResponse>('/me');
      setMe(response.profile ? response : null);
    } catch {
      // A dropped connection keeps the current state. Only the server's answer changes who is signed in.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await api<PublicConfig>('/config');
        if (cancelled) return;
        setDisplayConfig({ currency: loaded.currency, locale: loaded.locale, timeZone: loaded.timeZone });
        setConfig(loaded);
      } catch {
        // The page still renders without config. Money and times fall back to the India defaults.
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api('/auth/signout', { method: 'POST', body: {} });
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, config, loading, refresh, signOut }), [me, config, loading, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
