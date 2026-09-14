import type { Settings } from './storage';

/**
 * Pure scheduling maths — no Capacitor, no side effects, no `Date.now()` reads
 * that aren't passed in. Kept separate from notifications.ts so the awkward
 * cases (overnight windows, a nudge landing at 3am) are easy to reason about
 * and to unit test.
 */

export const MINUTE = 60_000;

/**
 * The gap between nudges, in minutes. One number rather than a min/max range:
 * less to explain, and it makes "next nudge" an exact time rather than an
 * approximation.
 */
export const DEFAULT_INTERVAL_MINUTES = 30;
export const MIN_INTERVAL_MINUTES = 10;
export const MAX_INTERVAL_MINUTES = 180;
/** Slider granularity, and what the interval is rounded to. */
export const INTERVAL_STEP_MINUTES = 5;

/**
 * Keeps a stored interval inside the supported range. Applied on read as well
 * as on write, so a value from an older build (or a corrupted one) can never
 * produce a nonsensical schedule.
 */
export function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_INTERVAL_MINUTES;
  const stepped =
    Math.round(minutes / INTERVAL_STEP_MINUTES) * INTERVAL_STEP_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, stepped));
}

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
  settings: Pick<Settings, 'activeStart' | 'activeEnd' | 'intervalMinutes'>,
): Date {
  const gap = clampInterval(settings.intervalMinutes);
  const target = new Date(now.getTime() + gap * MINUTE);
  return nextActiveWindowStart(target, settings.activeStart, settings.activeEnd);
}

/** `30 min` / `1 hr 30 min` — for labelling the interval itself. */
export function formatInterval(minutes: number): string {
  const m = clampInterval(minutes);
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`;
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
