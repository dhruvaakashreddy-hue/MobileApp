import { LocalNotifications } from '@capacitor/local-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import type { Persona } from '../types';
import { getPersona } from '../data/personas';
import { computeNextFireTime } from './scheduling';
import { createQueue, takeFromQueue } from './nudgePool';
import {
  creditNudge,
  store,
  type PlannedNudge,
  type Settings,
} from './storage';

/**
 * Notification scheduling.
 *
 * Design note — why a rolling buffer instead of a strict one-at-a-time chain:
 * a pure chain only re-arms while the app is alive to observe the delivery, so
 * the moment the OS evicts the app (the normal state for an app like this) the
 * nudges stop for good. Instead we keep a small rolling buffer of upcoming
 * nudges — LOOKAHEAD of them, far below iOS's hard limit of 64 pending local
 * notifications — and top it back up on every delivery, every app resume and
 * every settings change. Each buffered nudge still gets its own randomised gap,
 * so the unpredictability is unchanged; it just survives the app being killed.
 */
const LOOKAHEAD = 12;

/** Reserved notification id range, so we never collide with other plugins. */
const ID_BASE = 4200;

export interface NudgePayload {
  lineId: string;
  personaId: string;
  text: string;
  healthy: { id: string; text: string };
  chaos: { id: string; text: string };
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Android needs a channel per (persona, sound-on/off) pair — a channel's sound is fixed at creation. */
function channelId(persona: Persona, soundEnabled: boolean): string {
  return `nudge-v1-${persona.id}-${soundEnabled ? 'loud' : 'silent'}`;
}

export async function ensureChannels(personas: Persona[]): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  for (const persona of personas) {
    for (const soundEnabled of [true, false]) {
      try {
        await LocalNotifications.createChannel({
          id: channelId(persona, soundEnabled),
          name: `${persona.name}${soundEnabled ? '' : ' (silent)'}`,
          description: `Nudges from ${persona.name}`,
          // 5 = IMPORTANCE_HIGH, which is what makes it a heads-up banner.
          importance: 5,
          visibility: 1,
          sound: soundEnabled ? `${persona.sound}.wav` : undefined,
          vibration: true,
          lights: true,
          lightColor: persona.theme.hex,
        });
      } catch {
        // Channel creation is best-effort; a failure here must not break setup.
      }
    }
  }
}

export type PermissionState = 'granted' | 'denied' | 'prompt';

export async function checkPermission(): Promise<PermissionState> {
  if (!isNative()) return 'granted';
  try {
    const res = await LocalNotifications.checkPermissions();
    return res.display === 'granted'
      ? 'granted'
      : res.display === 'denied'
        ? 'denied'
        : 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isNative()) return 'granted';
  try {
    const res = await LocalNotifications.requestPermissions();
    return res.display === 'granted'
      ? 'granted'
      : res.display === 'denied'
        ? 'denied'
        : 'prompt';
  } catch {
    return 'denied';
  }
}

/**
 * Builds the next `LOOKAHEAD` nudges, each with its own random gap measured
 * from the one before it, skipping anything that would land outside the user's
 * active hours.
 */
export async function buildPlan(
  now: Date,
  settings: Settings,
  persona: Persona,
  count = LOOKAHEAD,
): Promise<PlannedNudge[]> {
  const stored = await store.getQueue();
  let queue = stored ?? createQueue(persona, settings.categories);

  // Draw the whole batch from the no-repeat queue in one go, so the buffer
  // never contains a duplicate of something else already queued.
  const { choices, queue: nextQueue } = takeFromQueue(
    queue,
    persona,
    settings.categories,
    count,
  );
  queue = nextQueue;
  await store.setQueue(queue);

  const plan: PlannedNudge[] = [];
  let cursor = now;

  for (let i = 0; i < choices.length; i++) {
    const fireAt = computeNextFireTime(cursor, settings);
    const { healthy, chaos } = choices[i];
    plan.push({
      notificationId: ID_BASE + i,
      fireAt: fireAt.getTime(),
      lineId: choices[i].id,
      personaId: persona.id,
      text: notificationBody(healthy.text, chaos.text),
      healthy: { id: healthy.id, text: healthy.text },
      chaos: { id: chaos.id, text: chaos.text },
    });
    cursor = fireAt;
  }
  return plan;
}

/**
 * The OS banner has to carry both options — it is the only thing a user sees
 * before they decide whether to open the app.
 */
export function notificationBody(healthy: string, chaos: string): string {
  return `1) ${healthy}\n2) ${chaos}`;
}

export async function cancelAll(): Promise<void> {
  if (!isNative()) {
    await store.clearPlan();
    await store.clearNextFireAt();
    return;
  }
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(
      (n) => n.id >= ID_BASE && n.id < ID_BASE + 200,
    );
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    }
  } catch {
    // Nothing pending, or the plugin is unavailable — either way there is
    // nothing left to cancel.
  }
  await store.clearPlan();
  await store.clearNextFireAt();
}

/**
 * Rebuilds and re-arms the whole schedule. Safe to call any time settings,
 * persona or the on/off toggle change.
 */
export async function rescheduleAll(settings: Settings): Promise<PlannedNudge[]> {
  await cancelAll();
  if (!settings.enabled) return [];

  const persona = getPersona(settings.personaId);
  const plan = await buildPlan(new Date(), settings, persona);
  if (plan.length === 0) return [];

  await store.setPlan(plan);
  await store.setNextFireAt(plan[0].fireAt);
  // Everything before the first nudge has already been accounted for, so a
  // fresh schedule never retroactively credits old plan entries.
  await store.setCreditedThrough(Date.now());

  if (!isNative()) return plan;

  await ensureChannels([persona]);
  try {
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({
        id: p.notificationId,
        title: `${persona.emoji} ${persona.name}`,
        body: p.text,
        schedule: { at: new Date(p.fireAt), allowWhileIdle: true },
        channelId: channelId(persona, settings.soundEnabled),
        // iOS reads `sound` directly; Android takes it from the channel.
        sound: settings.soundEnabled ? `${persona.sound}.wav` : undefined,
        smallIcon: 'ic_stat_nudge',
        largeIcon: `persona_${persona.id.replace(/-/g, '_')}`,
        iconColor: persona.theme.hex,
        extra: {
          lineId: p.lineId,
          personaId: p.personaId,
          text: p.text,
          healthy: p.healthy,
          chaos: p.chaos,
        } satisfies NudgePayload,
      })),
    });
  } catch (err) {
    console.warn('[nudge] failed to schedule notifications', err);
  }

  return plan;
}

/**
 * Credits every planned nudge whose fire time has passed since we last looked.
 * This is what keeps "nudges today" and the streak honest while the app was
 * closed — the OS delivered those notifications even though no JS was running.
 */
export async function reconcileDelivered(now: Date = new Date()): Promise<{
  delivered: PlannedNudge[];
}> {
  const [plan, creditedThrough] = await Promise.all([
    store.getPlan(),
    store.getCreditedThrough(),
  ]);

  const delivered = plan
    .filter((p) => p.fireAt <= now.getTime() && p.fireAt > creditedThrough)
    .sort((a, b) => a.fireAt - b.fireAt);

  if (delivered.length > 0) {
    let stats = await store.getStats();
    for (const d of delivered) {
      stats = creditNudge(stats, new Date(d.fireAt));
    }
    await store.setStats(stats);
    await store.setLastLineId(delivered[delivered.length - 1].lineId);
    await store.setCreditedThrough(delivered[delivered.length - 1].fireAt);
  }

  const upcoming = plan.filter((p) => p.fireAt > now.getTime());
  await store.setNextFireAt(upcoming[0]?.fireAt ?? 0);

  return { delivered };
}

/** True when the buffer has run low and should be rebuilt. */
export async function needsTopUp(now: Date = new Date()): Promise<boolean> {
  const plan = await store.getPlan();
  const upcoming = plan.filter((p) => p.fireAt > now.getTime());
  return upcoming.length < Math.ceil(LOOKAHEAD / 3);
}

export function parsePayload(extra: unknown): NudgePayload | null {
  if (!extra || typeof extra !== 'object') return null;
  const e = extra as Record<string, unknown>;
  if (typeof e.text !== 'string' || typeof e.personaId !== 'string') return null;

  const option = (v: unknown): { id: string; text: string } | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    return typeof o.text === 'string'
      ? { id: typeof o.id === 'string' ? o.id : '', text: o.text }
      : null;
  };

  const healthy = option(e.healthy);
  const chaos = option(e.chaos);
  // A notification scheduled by an older build has no options; without both
  // there is no choice to offer, so ignore it rather than render half a card.
  if (!healthy || !chaos) return null;

  return {
    text: e.text,
    personaId: e.personaId,
    lineId: typeof e.lineId === 'string' ? e.lineId : '',
    healthy,
    chaos,
  };
}

/**
 * Wires up both delivery paths:
 *  - `localNotificationReceived` — the nudge arrived while the app is open
 *  - `localNotificationActionPerformed` — the user tapped the OS notification
 * Both end up showing the same in-app persona card.
 */
export async function registerListeners(
  onNudge: (payload: NudgePayload, source: 'foreground' | 'tap') => void,
): Promise<PluginListenerHandle[]> {
  if (!isNative()) return [];
  const handles: PluginListenerHandle[] = [];

  handles.push(
    await LocalNotifications.addListener('localNotificationReceived', (n) => {
      const payload = parsePayload(n.extra);
      if (payload) onNudge(payload, 'foreground');
    }),
  );

  handles.push(
    await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const payload = parsePayload(action.notification.extra);
        if (payload) onNudge(payload, 'tap');
      },
    ),
  );

  return handles;
}
