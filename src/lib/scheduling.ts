import type { Settings } from './storage';

/**
 * Pure scheduling maths — no Capacitor, no side effects, no `Date.now()` reads
 * that aren't passed in. Kept separate from notifications.ts so the awkward
 * cases (overnight windows, a nudge landing at 3am) are easy to reason about
 * and to unit test.
 */

export const MINUTE = 60_000;

/**
 * Fixed cadence: a nudge every 30 minutes inside the active window.
 *
 * This used to be a user-configurable min/max range. One fixed number is less
 * to explain, less to get wrong, and makes "next nudge" an exact time rather
 * than an approximation.
 */
export const NUDGE_INTERVAL_MINUTES = 30;

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

/**
 * When the next nudge should fire: exactly one interval from now, pushed
 * forward to the next active window if that would land while they're asleep.
 */
export function computeNextFireTime(
  now: Date,
  settings: Pick<Settings, 'activeStart' | 'activeEnd'>,
): Date {
  const target = new Date(now.getTime() + NUDGE_INTERVAL_MINUTES * MINUTE);
  return nextActiveWindowStart(target, settings.activeStart, settings.activeEnd);
}

/** `30 min` / `2 hr 5 min` / `any moment now`. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'any moment now';
  const totalMinutes = Math.round(msRemaining / MINUTE);
  if (totalMinutes < 1) return 'less than a minute';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`;
}
