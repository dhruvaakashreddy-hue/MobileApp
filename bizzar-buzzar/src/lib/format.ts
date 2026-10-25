import { formatMoney } from '../../shared/money.ts';

/** Set once from /api/config. Defaults match the India launch: INR, en-IN, Asia/Kolkata. */
const display = { currency: 'INR', locale: 'en-IN', timeZone: 'Asia/Kolkata' };

export function setDisplayConfig(next: { currency: string; locale: string; timeZone: string }): void {
  Object.assign(display, next);
}

export function money(paise: number): string {
  return formatMoney(paise, { currency: display.currency, locale: display.locale });
}

/** Whole seconds, minutes and seconds with tabular digits, e.g. 00:30 or 1:04:12. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(display.locale, {
    timeZone: display.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase();
}

function dayLabel(date: Date, now: Date): string {
  const sameDay = (a: Date, b: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: display.timeZone }).format(a) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: display.timeZone }).format(b);
  if (sameDay(date, now)) return 'Today';
  return new Intl.DateTimeFormat(display.locale, { timeZone: display.timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

/** "Today, 7:00 pm – 9:00 pm IST". The general session window only, never a precise drop time. */
export function formatSessionWindow(opensIso: string, closesIso: string, now: Date = new Date()): string {
  const opens = new Date(opensIso);
  return `${dayLabel(opens, now)}, ${formatClock(opensIso)} – ${formatClock(closesIso)} IST`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(display.locale, { timeZone: display.timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(display.locale, {
    timeZone: display.timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/**
 * Turns the value of a datetime-local input (read as IST, which has no daylight time) into an
 * ISO string with an explicit offset, as the API requires.
 */
export function istLocalToIso(value: string): string {
  return `${value}:00+05:30`;
}

/** Inverse of istLocalToIso, for pre-filling an input with a stored instant. */
export function isoToIstLocal(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}
