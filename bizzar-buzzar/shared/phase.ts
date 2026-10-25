import { REVEAL_LEAD_MS } from './constants.ts';

/** What a buyer sees for one drop. */
export type DropPhase = 'waiting' | 'reveal' | 'live' | 'sold' | 'ended' | 'paused';

/** Whether the session as a whole is running, upcoming, or over. */
export type SessionState = 'none' | 'upcoming' | 'open' | 'paused' | 'ended';

export interface PhaseInput {
  nowMs: number;
  /** Null when the drop has not been scheduled yet. */
  releaseMs: number | null;
  closesMs: number | null;
  quantity: number;
  /** Units with a paid order. */
  soldUnits: number;
  dropStatus: 'scheduled' | 'paused' | 'cancelled' | 'draft';
  sessionPaused: boolean;
}

/**
 * Derives the phase from the server clock. Callers pass the server's `now`; a browser
 * clock never feeds into this function.
 */
export function resolveDropPhase(input: PhaseInput): DropPhase {
  if (input.releaseMs === null || input.closesMs === null) return 'waiting';
  if (input.sessionPaused || input.dropStatus === 'paused') return 'paused';
  if (input.nowMs < input.releaseMs - REVEAL_LEAD_MS) return 'waiting';
  if (input.nowMs < input.releaseMs) return 'reveal';
  if (input.soldUnits >= input.quantity) return 'sold';
  if (input.nowMs < input.closesMs) return 'live';
  return 'ended';
}

export interface SessionInput {
  status: 'scheduled' | 'paused' | 'cancelled' | 'draft';
  opensMs: number;
  closesMs: number;
}

export function resolveSessionState(session: SessionInput, nowMs: number): SessionState {
  if (session.status === 'paused') return 'paused';
  if (nowMs < session.opensMs) return 'upcoming';
  if (nowMs < session.closesMs) return 'open';
  return 'ended';
}
