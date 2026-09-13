import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { NudgeCategory, Persona } from '../types';
import { PERSONAS, getPersona } from '../data/personas';
import {
  DEFAULT_PREMIUM,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  normalizeStats,
  store,
  type Premium,
  type Settings,
  type Stats,
} from '../lib/storage';
import {
  checkPermission,
  isNative,
  needsTopUp,
  reconcileDelivered,
  registerListeners,
  requestPermission,
  rescheduleAll,
  type NudgePayload,
  type PermissionState,
} from '../lib/notifications';
import { registerDeepLinks } from '../lib/deeplink';
import {
  activeProvider as authProvider,
  guestSession,
  sessionStore,
  type AuthSession,
  type PhoneChallenge,
} from '../lib/auth';
import {
  checkSubscriptionStatus,
  isPremiumActive,
  restorePurchases,
  unlockPremium,
} from '../lib/billing';

interface AppState {
  ready: boolean;
  session: AuthSession | null;
  settings: Settings;
  stats: Stats;
  premium: Premium;
  premiumActive: boolean;
  permission: PermissionState;
  persona: Persona;
  nextFireAt: number | null;
  activeNudge: NudgePayload | null;

  sendPhoneCode: (phoneE164: string) => Promise<PhoneChallenge>;
  signInWithPhone: (challenge: PhoneChallenge, code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  selectPersona: (id: string) => Promise<void>;
  toggleCategory: (c: NudgeCategory) => Promise<void>;
  askPermission: () => Promise<PermissionState>;
  completeOnboarding: () => Promise<void>;
  buyPremium: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  showNudge: (payload: NudgePayload) => void;
  dismissNudge: () => void;
  buzz: (style?: ImpactStyle) => void;
  isPersonaLocked: (persona: Persona) => boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [premium, setPremium] = useState<Premium>(DEFAULT_PREMIUM);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [nextFireAt, setNextFireAt] = useState<number | null>(null);
  const [activeNudge, setActiveNudge] = useState<NudgePayload | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  // Always-current settings for callbacks that outlive a render (listeners).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Entitlement is also mirrored in a ref. Right after a purchase the `premium`
  // state has not re-rendered yet, so any imperative call made in the same tick
  // (selecting the very persona that was just paid for) must not read the stale
  // value and decide it is still locked.
  const premiumRef = useRef(premium);
  const applyPremium = useCallback((p: Premium) => {
    premiumRef.current = p;
    setPremium(p);
  }, []);

  const premiumActive = isPremiumActive(premium);

  const buzz = useCallback((style: ImpactStyle = ImpactStyle.Light) => {
    if (!settingsRef.current.hapticsEnabled || !isNative()) return;
    void Haptics.impact({ style }).catch(() => {});
  }, []);

  /** Pulls delivered nudges into stats and refills the buffer if it's low. */
  const syncFromSystem = useCallback(async () => {
    const { delivered } = await reconcileDelivered();
    const [freshStats, storedNext] = await Promise.all([
      store.getStats(),
      store.getNextFireAt(),
    ]);
    setStats(normalizeStats(freshStats));

    if (settingsRef.current.enabled && (await needsTopUp())) {
      const plan = await rescheduleAll(settingsRef.current);
      setNextFireAt(plan[0]?.fireAt ?? null);
    } else {
      setNextFireAt(storedNext && storedNext > Date.now() ? storedNext : null);
    }
    return delivered;
  }, []);

  // Boot: load everything from Preferences, then reconcile with the OS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, st, perm, savedSession] = await Promise.all([
        store.getSettings(),
        store.getStats(),
        checkPermission(),
        sessionStore.get(),
      ]);
      const prem = await checkSubscriptionStatus();
      if (cancelled) return;

      settingsRef.current = s;
      setSettings(s);
      setStats(normalizeStats(st));
      applyPremium(prem);
      setPermission(perm);
      setSession(savedSession);
      await syncFromSystem();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [syncFromSystem, applyPremium]);

  // A nudge arriving (foreground delivery or a tap on the OS notification)
  // shows the same in-app persona card.
  useEffect(() => {
    let handles: Awaited<ReturnType<typeof registerListeners>> = [];
    (async () => {
      handles = await registerListeners((payload) => {
        setActiveNudge(payload);
        void syncFromSystem();
      });
    })();
    return () => {
      handles.forEach((h) => void h.remove());
    };
  }, [syncFromSystem]);

  // Razorpay's hosted checkout returns through a deep link.
  useEffect(() => {
    let dispose: (() => void) | null = null;
    void registerDeepLinks(applyPremium).then((d) => {
      dispose = d;
    });
    return () => dispose?.();
  }, [applyPremium]);

  // Coming back to the foreground is when stats and the buffer get refreshed.
  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;
    (async () => {
      handle = await CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void syncFromSystem();
      });
    })();
    return () => {
      void handle?.remove();
    };
  }, [syncFromSystem]);

  const persist = useCallback(
    async (next: Settings, reschedule: boolean) => {
      settingsRef.current = next;
      setSettings(next);
      await store.setSettings(next);
      if (reschedule) {
        const plan = await rescheduleAll(next);
        setNextFireAt(plan[0]?.fireAt ?? null);
      }
    },
    [],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      // Any of these change what gets scheduled, so the queue is rebuilt.
      const rescheduleKeys: (keyof Settings)[] = [
        'enabled',
        'personaId',
        'minMinutes',
        'maxMinutes',
        'activeStart',
        'activeEnd',
        'categories',
        'soundEnabled',
      ];
      const needsReschedule = rescheduleKeys.some((k) => k in patch);
      await persist(next, needsReschedule && next.enabled);
      if (needsReschedule && !next.enabled) {
        await rescheduleAll(next); // cancels everything
        setNextFireAt(null);
      }
    },
    [persist],
  );

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const perm = await requestPermission();
        setPermission(perm);
        if (perm !== 'granted' && isNative()) {
          // Don't flip the switch on if the OS won't let us deliver anything.
          return;
        }
      }
      await updateSettings({ enabled });
    },
    [updateSettings],
  );

  const isPersonaLocked = useCallback(
    (p: Persona) => p.isPremium && !premiumActive,
    [premiumActive],
  );

  const selectPersona = useCallback(
    async (id: string) => {
      const p = getPersona(id);
      if (p.isPremium && !isPremiumActive(premiumRef.current)) return;
      await updateSettings({ personaId: id });
    },
    [updateSettings],
  );

  const toggleCategory = useCallback(
    async (c: NudgeCategory) => {
      const current = settingsRef.current.categories;
      const next = current.includes(c)
        ? current.filter((x) => x !== c)
        : [...current, c];
      // Refuse to leave the user with zero categories — there'd be nothing to send.
      if (next.length === 0) return;
      await updateSettings({ categories: next });
    },
    [updateSettings],
  );

  const askPermission = useCallback(async () => {
    const perm = await requestPermission();
    setPermission(perm);
    return perm;
  }, []);

  const completeOnboarding = useCallback(async () => {
    await updateSettings({ onboarded: true, enabled: true });
  }, [updateSettings]);

  const buyPremium = useCallback(async () => {
    try {
      const p = await unlockPremium();
      applyPremium(p);
      return isPremiumActive(p);
    } catch (err) {
      console.warn('[nudge] purchase failed', err);
      return false;
    }
  }, [applyPremium]);

  const restore = useCallback(async () => {
    const p = await restorePurchases();
    applyPremium(p);
    return isPremiumActive(p);
  }, [applyPremium]);

  const persistSession = useCallback(async (next: AuthSession) => {
    await sessionStore.set(next);
    setSession(next);
  }, []);

  const sendPhoneCode = useCallback(
    (phoneE164: string) => authProvider.sendPhoneCode(phoneE164),
    [],
  );

  const signInWithPhone = useCallback(
    async (challenge: PhoneChallenge, code: string) => {
      const user = await authProvider.confirmPhoneCode(challenge, code);
      await persistSession({ user, token: null, signedInAt: Date.now() });
    },
    [persistSession],
  );

  const signInWithGoogle = useCallback(async () => {
    const user = await authProvider.signInWithGoogle();
    await persistSession({ user, token: null, signedInAt: Date.now() });
  }, [persistSession]);

  const continueAsGuest = useCallback(async () => {
    await persistSession(guestSession());
  }, [persistSession]);

  const signOut = useCallback(async () => {
    await authProvider.signOut();
    await sessionStore.clear();
    setSession(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      session,
      settings,
      stats,
      premium,
      premiumActive,
      permission,
      persona: getPersona(settings.personaId),
      nextFireAt,
      activeNudge,
      sendPhoneCode,
      signInWithPhone,
      signInWithGoogle,
      continueAsGuest,
      signOut,
      updateSettings,
      setEnabled,
      selectPersona,
      toggleCategory,
      askPermission,
      completeOnboarding,
      buyPremium,
      restore,
      showNudge: setActiveNudge,
      dismissNudge: () => setActiveNudge(null),
      buzz,
      isPersonaLocked,
    }),
    [
      ready, session, settings, stats, premium, premiumActive, permission,
      nextFireAt, activeNudge, sendPhoneCode, signInWithPhone, signInWithGoogle,
      continueAsGuest, signOut, updateSettings, setEnabled, selectPersona,
      toggleCategory, askPermission, completeOnboarding, buyPremium, restore,
      buzz, isPersonaLocked,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export { PERSONAS };
