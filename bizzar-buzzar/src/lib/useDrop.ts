import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { DropState, ReservationView } from '../../shared/api-types.ts';
import { api, messageFor } from './api.ts';
import { serverNowMs, useServerNow } from './clock.ts';
import { isPreviewScenario, previewAvailable, previewDropState, previewReservation, previewStartedAt, type PreviewScenario } from './preview.ts';

/** The preview scenario from the URL, if this build allows preview. */
export function usePreviewScenario(): PreviewScenario | null {
  const { search } = useLocation();
  const value = new URLSearchParams(search).get('preview');
  return previewAvailable() && isPreviewScenario(value) ? value : null;
}

/** Visitors refresh the drop state on this cadence, so the reveal and release happen promptly. */
function pollDelayMs(state: DropState | null): number {
  switch (state?.phase) {
    case 'reveal':
      return 1000;
    case 'live':
      return 15_000;
    case 'waiting':
    case 'paused':
    default:
      return 30_000;
  }
}

export interface DropStateHook {
  state: DropState | null;
  error: string | null;
  refresh: () => Promise<void>;
  preview: PreviewScenario | null;
}

/**
 * The server's view of the current drop. The browser never decides the phase: it asks the
 * server again on resume, on reconnect, and at the release moment.
 */
export function useDropState(): DropStateHook {
  const preview = usePreviewScenario();
  const now = useServerNow(preview ? 500 : 60_000);
  const [live, setLive] = useState<DropState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (preview) return;
    try {
      setLive(await api<DropState>('/drop'));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [preview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll on a cadence that depends on the phase. Browser timers schedule display only.
  useEffect(() => {
    if (preview) return;
    const id = window.setTimeout(() => void refresh(), pollDelayMs(live));
    return () => window.clearTimeout(id);
  }, [live, refresh, preview]);

  // Refetch on resume, tab focus and reconnect, so a stale tab cannot act on old state.
  useEffect(() => {
    if (preview) return;
    const onResume = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [refresh, preview]);

  // At the countdown's zero, ask the server. If it has not released yet, the poll above retries every second.
  useEffect(() => {
    if (preview || live?.phase !== 'reveal' || !live.releaseAt) return;
    const delay = Math.max(0, Date.parse(live.releaseAt) - serverNowMs()) + 150;
    const id = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(id);
  }, [live, refresh, preview]);

  if (preview) {
    const state = previewDropState(preview, previewStartedAt(preview), now);
    return { state, error: null, refresh, preview };
  }
  return { state: live, error, refresh, preview: null };
}

export interface ReservationHook {
  reservation: ReservationView | null;
  error: string | null;
  refresh: () => Promise<void>;
  preview: PreviewScenario | null;
}

/** The buyer's own hold. The server's expiry is authoritative; the countdown only displays it. */
export function useReservation(reservationId: string): ReservationHook {
  const preview = usePreviewScenario();
  const now = useServerNow(500);
  const [live, setLive] = useState<ReservationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (preview) return;
    try {
      setLive(await api<ReservationView>(`/reservations/${reservationId}`));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [preview, reservationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (preview) return;
    const onResume = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [refresh, preview]);

  if (preview) {
    // The checkout belongs to the reserved scenario, so its hold runs from the moment that state was shown.
    return { reservation: previewReservation(previewStartedAt('reserved'), now), error: null, refresh, preview };
  }
  return { reservation: live, error, refresh, preview: null };
}
