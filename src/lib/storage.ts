import { Preferences } from '@capacitor/preferences';
import type { NudgeCategory } from '../types';
import {
  ALL_CATEGORIES,
  DEFAULT_PERSONA_ID,
  resolvePersonaId,
} from '../data/personas.ts';
import type { NudgeQueue } from './nudgePool.ts';
import { DEFAULT_INTERVAL_MINUTES } from './scheduling.ts';

/**
 * Everything the app knows lives here, in Capacitor Preferences (UserDefaults
 * on iOS / SharedPreferences on Android). No backend, no database.
 */

export interface Settings {
  onboarded: boolean;
  enabled: boolean;
  personaId: string;
  /** Gap between nudges, in minutes. See scheduling.ts for the allowed range. */
  intervalMinutes: number;
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
  /** How many this-or-thats were answered each way, all time. */
  healthyPicks: number;
  chaosPicks: number;
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
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  activeStart: 9 * 60,
  activeEnd: 21 * 60,
  categories: [...ALL_CATEGORIES],
  soundEnabled: true,
  hapticsEnabled: true,
};

export const DEFAULT_STATS: Stats = {
  todayCount: 0,
  healthyPicks: 0,
  chaosPicks: 0,
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
  queue: 'nudge.queue',
  accounts: 'nudge.accounts',
} as const;

/**
 * What survives a sign-out, keyed by account.
 *
 * The session is deliberately thrown away when someone signs out, so anything
 * that must outlive it cannot live inside the session object. Two things must:
 * the profile, because being asked for your name again on every sign-in is
 * absurd, and the entitlement, because a subscription belongs to the account
 * that paid for it — not to the phone it was bought on.
 */
export interface AccountProfile {
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
}

export interface AccountRecord {
  profile: AccountProfile | null;
  premium: Premium;
}

/** One scheduled nudge, mirrored locally so stats survive the app being killed. */
export interface PlannedNudgeOption {
  id: string;
  text: string;
}

export interface PlannedNudge {
  notificationId: number;
  fireAt: number;
  /** Id of the pair, for the no-repeat guarantee. */
  lineId: string;
  personaId: string;
  /** What the OS notification says — both options, condensed. */
  text: string;
  healthy: PlannedNudgeOption;
  chaos: PlannedNudgeOption;
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

function isPlannedOption(v: unknown): v is PlannedNudgeOption {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.text === 'string' && o.text.length > 0;
}

/**
 * Guards the boundary between stored JSON and typed code. Everything in
 * Preferences was written by some past version of this app, so it is untrusted
 * input as far as the current one is concerned.
 */
export function isValidPlannedNudge(v: unknown): v is PlannedNudge {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.notificationId === 'number' &&
    typeof p.fireAt === 'number' &&
    typeof p.personaId === 'string' &&
    typeof p.text === 'string' &&
    isPlannedOption(p.healthy) &&
    isPlannedOption(p.chaos)
  );
}

/**
 * Drops category ids that no longer exist, and falls back to all of them if
 * that would leave nothing — an empty selection means no nudges can be built
 * at all, which would look like the app quietly breaking.
 */
function migrateCategories(settings: Settings): Settings {
  const known = new Set<string>(ALL_CATEGORIES);
  const kept = (settings.categories ?? []).filter((c) => known.has(c));
  if (kept.length === settings.categories?.length) return settings;
  return { ...settings, categories: kept.length > 0 ? kept : [...ALL_CATEGORIES] };
}

export function isValidQueue(v: unknown): v is NudgeQueue {
  if (!v || typeof v !== 'object') return false;
  const q = v as Record<string, unknown>;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return (
    typeof q.poolKey === 'string' &&
    num(q.seed) &&
    num(q.cursor) &&
    num(q.cycles) &&
    num(q.chaosSeed) &&
    num(q.chaosCursor)
  );
}

export const store = {
  async getSettings(): Promise<Settings> {
    const stored = await readJSON<Settings>(KEYS.settings, DEFAULT_SETTINGS);
    const settings = migrateCategories(stored);
    const personaId = resolvePersonaId(settings.personaId);
    if (personaId === settings.personaId && settings === stored) return stored;

    // Carry a renamed persona across rather than dropping the user back to the
    // default one, and write it back so the dead id does not linger — anything
    // reading Preferences without going through here would still see the old
    // value otherwise.
    const migrated: Settings = { ...settings, personaId };
    await writeJSON(KEYS.settings, migrated);
    return migrated;
  },
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
      if (!value) return [];
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Drop anything that doesn't match the current shape. A plan written by
      // an older build has no this-or-that options on it, and rendering one
      // would crash the app; discarding it makes the queue rebuild instead.
      return parsed.filter(isValidPlannedNudge);
    } catch {
      return [];
    }
  },
  setPlan: (plan: PlannedNudge[]) => writeJSON(KEYS.plan, plan),
  clearPlan: () => Preferences.remove({ key: KEYS.plan }),

  /** All known accounts on this device, keyed by the provider's user id. */
  async getAccounts(): Promise<Record<string, AccountRecord>> {
    try {
      const { value } = await Preferences.get({ key: KEYS.accounts });
      if (!value) return {};
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, AccountRecord>)
        : {};
    } catch {
      return {};
    }
  },

  async getAccount(userId: string): Promise<AccountRecord | null> {
    const accounts = await this.getAccounts();
    return accounts[userId] ?? null;
  },

  async saveAccount(
    userId: string,
    patch: Partial<AccountRecord>,
  ): Promise<AccountRecord> {
    const accounts = await this.getAccounts();
    const current = accounts[userId] ?? { profile: null, premium: DEFAULT_PREMIUM };
    const next: AccountRecord = { ...current, ...patch };
    accounts[userId] = next;
    await writeJSON(KEYS.accounts, accounts);
    return next;
  },

  async getQueue(): Promise<NudgeQueue | null> {
    try {
      const { value } = await Preferences.get({ key: KEYS.queue });
      if (!value) return null;
      const parsed = JSON.parse(value) as unknown;
      // A queue saved before the this-or-that change has no chaos cursor, and
      // reading past the end of an undefined cursor throws. Returning null here
      // makes the caller start a fresh cycle instead.
      return isValidQueue(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  setQueue: (q: NudgeQueue) => writeJSON(KEYS.queue, q),

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
    ...stats,
    todayCount: sameDay ? stats.todayCount + 1 : 1,
    todayKey: key,
    streak,
    lastStreakKey: key,
    totalCount: stats.totalCount + 1,
  };
}

/** Records which side of a this-or-that the user went with. */
export function creditChoice(
  stats: Stats,
  pick: 'healthy' | 'chaos',
): Stats {
  return pick === 'healthy'
    ? { ...stats, healthyPicks: stats.healthyPicks + 1 }
    : { ...stats, chaosPicks: stats.chaosPicks + 1 };
}

/** Zeroes the day counter for display when the stored day is stale. */
export function normalizeStats(stats: Stats, now: Date = new Date()): Stats {
  const key = dateKey(now);
  if (stats.todayKey === key) return stats;
  return { ...stats, todayCount: 0, todayKey: key };
}
