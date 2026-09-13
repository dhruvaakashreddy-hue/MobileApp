import { Preferences } from '@capacitor/preferences';
import type { NudgeCategory } from '../types';
import { ALL_CATEGORIES, DEFAULT_PERSONA_ID } from '../data/personas';

/**
 * Everything the app knows lives here, in Capacitor Preferences (UserDefaults
 * on iOS / SharedPreferences on Android). No backend, no database.
 */

export interface Settings {
  onboarded: boolean;
  enabled: boolean;
  personaId: string;
  /** Minimum gap between nudges, in minutes. */
  minMinutes: number;
  /** Maximum gap between nudges, in minutes. */
  maxMinutes: number;
  /** Start of the active window, in minutes past midnight. */
  activeStart: number;
  /** End of the active window, in minutes past midnight. May wrap past midnight. */
  activeEnd: number;
  categories: NudgeCategory[];
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

export interface Stats {
  /** Nudges delivered on `todayKey`. */
  todayCount: number;
  todayKey: string;
  /** Consecutive days with at least one nudge received. */
  streak: number;
  /** Date key of the most recent day the streak was credited for. */
  lastStreakKey: string;
  totalCount: number;
}

export interface Premium {
  active: boolean;
  /** Epoch millis. `null` when there is no subscription on record. */
  expiresAt: number | null;
  /** Razorpay subscription id, once real billing is wired up. */
  subscriptionId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  enabled: false,
  personaId: DEFAULT_PERSONA_ID,
  minMinutes: 45,
  maxMinutes: 120,
  activeStart: 9 * 60,
  activeEnd: 21 * 60,
  categories: [...ALL_CATEGORIES],
  soundEnabled: true,
  hapticsEnabled: true,
};

export const DEFAULT_STATS: Stats = {
  todayCount: 0,
  todayKey: '',
  streak: 0,
  lastStreakKey: '',
  totalCount: 0,
};

export const DEFAULT_PREMIUM: Premium = {
  active: false,
  expiresAt: null,
  subscriptionId: null,
};

const KEYS = {
  settings: 'nudge.settings',
  stats: 'nudge.stats',
  premium: 'nudge.premium',
  lastLineId: 'nudge.lastLineId',
  nextFireAt: 'nudge.nextFireAt',
  plan: 'nudge.plan',
  creditedThrough: 'nudge.creditedThrough',
} as const;

/** One scheduled nudge, mirrored locally so stats survive the app being killed. */
export interface PlannedNudge {
  notificationId: number;
  fireAt: number;
  lineId: string;
  personaId: string;
  text: string;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return fallback;
    // Merge over the defaults so a settings key added in a later app version
    // does not come back undefined for users upgrading from an older build.
    const parsed = JSON.parse(value) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export const store = {
  getSettings: () => readJSON<Settings>(KEYS.settings, DEFAULT_SETTINGS),
  setSettings: (s: Settings) => writeJSON(KEYS.settings, s),

  getStats: () => readJSON<Stats>(KEYS.stats, DEFAULT_STATS),
  setStats: (s: Stats) => writeJSON(KEYS.stats, s),

  getPremium: () => readJSON<Premium>(KEYS.premium, DEFAULT_PREMIUM),
  setPremium: (p: Premium) => writeJSON(KEYS.premium, p),

  async getLastLineId(): Promise<string | null> {
    const { value } = await Preferences.get({ key: KEYS.lastLineId });
    return value ?? null;
  },
  setLastLineId: (id: string) =>
    Preferences.set({ key: KEYS.lastLineId, value: id }),

  async getNextFireAt(): Promise<number | null> {
    const { value } = await Preferences.get({ key: KEYS.nextFireAt });
    const n = value ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
  },
  setNextFireAt: (ts: number) =>
    Preferences.set({ key: KEYS.nextFireAt, value: String(ts) }),
  clearNextFireAt: () => Preferences.remove({ key: KEYS.nextFireAt }),

  async getPlan(): Promise<PlannedNudge[]> {
    try {
      const { value } = await Preferences.get({ key: KEYS.plan });
      return value ? (JSON.parse(value) as PlannedNudge[]) : [];
    } catch {
      return [];
    }
  },
  setPlan: (plan: PlannedNudge[]) => writeJSON(KEYS.plan, plan),
  clearPlan: () => Preferences.remove({ key: KEYS.plan }),

  async getCreditedThrough(): Promise<number> {
    const { value } = await Preferences.get({ key: KEYS.creditedThrough });
    const n = value ? Number(value) : NaN;
    return Number.isFinite(n) ? n : 0;
  },
  setCreditedThrough: (ts: number) =>
    Preferences.set({ key: KEYS.creditedThrough, value: String(ts) }),
};

/** Local (not UTC) date key, so "today" means the user's today. */
export function dateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isYesterday(key: string, today: Date = new Date()): boolean {
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  return dateKey(y) === key;
}

/**
 * Rolls stats forward for a freshly delivered nudge: resets the daily counter
 * when the day has turned over, and extends or restarts the streak.
 */
export function creditNudge(stats: Stats, now: Date = new Date()): Stats {
  const key = dateKey(now);
  const sameDay = stats.todayKey === key;
  let streak = stats.streak;

  if (stats.lastStreakKey !== key) {
    streak = isYesterday(stats.lastStreakKey, now) ? stats.streak + 1 : 1;
  }

  return {
    todayCount: sameDay ? stats.todayCount + 1 : 1,
    todayKey: key,
    streak,
    lastStreakKey: key,
    totalCount: stats.totalCount + 1,
  };
}

/** Zeroes the day counter for display when the stored day is stale. */
export function normalizeStats(stats: Stats, now: Date = new Date()): Stats {
  const key = dateKey(now);
  if (stats.todayKey === key) return stats;
  return { ...stats, todayCount: 0, todayKey: key };
}
