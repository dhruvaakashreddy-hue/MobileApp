import type { NudgeLine, Persona } from '../types';
import type { Settings } from './storage';

/**
 * Pure scheduling maths — no Capacitor, no side effects, no `Date.now()` reads
 * that aren't passed in. Kept separate from notifications.ts so the awkward
 * cases (overnight windows, a nudge landing at 3am) are easy to reason about
 * and to unit test.
 */

export const MINUTE = 60_000;

/** Formats minutes-past-midnight as `HH:MM` for the native time input. */
export function minutesToTimeString(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function timeStringToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Human-friendly 12-hour label, e.g. `9:00 AM`. */
export function formatTimeLabel(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m % 60).padStart(2, '0')} ${suffix}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * True when `date` falls inside the user's active window. Handles windows that
 * wrap past midnight (start 22:00, end 06:00) as well as a start === end
 * window, which is treated as "all day" rather than "never".
 */
export function isWithinActiveHours(
  date: Date,
  start: number,
  end: number,
): boolean {
  if (start === end) return true;
  const m = minutesOfDay(date);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** The first instant at or after `date` that the window is open. */
export function nextActiveWindowStart(
  date: Date,
  start: number,
  end: number,
): Date {
  if (isWithinActiveHours(date, start, end)) return new Date(date);

  const candidate = new Date(date);
  candidate.setHours(Math.floor(start / 60), start % 60, 0, 0);
  if (candidate.getTime() <= date.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function randomInt(min: number, max: number, rng = Math.random): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Picks when the next nudge should fire: a random gap inside the user's
 * min/max range, pushed forward to the next active window if it would have
 * landed while they're asleep.
 */
export function computeNextFireTime(
  now: Date,
  settings: Pick<Settings, 'minMinutes' | 'maxMinutes' | 'activeStart' | 'activeEnd'>,
  rng = Math.random,
): Date {
  const gap = randomInt(settings.minMinutes, settings.maxMinutes, rng);
  const target = new Date(now.getTime() + gap * MINUTE);
  return nextActiveWindowStart(target, settings.activeStart, settings.activeEnd);
}

/**
 * Chooses the next line: only from categories the user left switched on, and
 * never the same line twice in a row (unless the pool has just one line left).
 */
export function pickLine(
  persona: Persona,
  settings: Pick<Settings, 'categories'>,
  lastLineId: string | null,
  rng = Math.random,
): NudgeLine | null {
  const allowed = persona.lines.filter((l) =>
    settings.categories.includes(l.category),
  );
  if (allowed.length === 0) return null;

  const pool =
    allowed.length > 1
      ? allowed.filter((l) => l.id !== lastLineId)
      : allowed;

  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

/** `~42 min` / `~2 hr 5 min` / `any moment now`. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'any moment now';
  const totalMinutes = Math.round(msRemaining / MINUTE);
  if (totalMinutes < 1) return 'less than a minute';
  if (totalMinutes < 60) return `~${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `~${hours} hr` : `~${hours} hr ${mins} min`;
}
