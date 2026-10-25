import { useEffect, useState } from 'react';

/**
 * Server time for display only. Countdowns use this offset so a wrong device clock does not
 * show the wrong time. Nothing here authorises a purchase: the server decides every
 * reservation with its own clock.
 */
let offsetMs = 0;

export function noteServerTime(serverIso: string, requestStartedMs: number, requestEndedMs: number): void {
  const server = Date.parse(serverIso);
  if (Number.isNaN(server)) return;
  // The server's time is assumed to sit at the midpoint of the round trip.
  offsetMs = server - (requestStartedMs + requestEndedMs) / 2;
}

export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

/** Re-renders on an interval with the server-corrected time. */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNowMs()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
