import { MAX_RELEASE_GAP_MS, MIN_RELEASE_GAP_MS } from './constants.ts';

export interface PlannedDrop {
  id: string;
  releaseMs: number;
  closesMs: number;
}

export interface SessionWindow {
  opensMs: number;
  closesMs: number;
}

export interface ScheduleIssue {
  code:
    | 'sale_window_invalid'
    | 'outside_session_window'
    | 'gap_too_short'
    | 'gap_too_long'
    | 'sale_overlaps_next_release';
  message: string;
  dropId: string;
}

/**
 * Checks one session's drops, in release order:
 * - each sale window closes after it opens and stays inside the session window;
 * - consecutive releases are 5 to 30 minutes apart;
 * - no sale window runs past the next release, so sale windows never overlap.
 *
 * Overlaps across sessions are enforced by an exclusion constraint in the database.
 */
export function validateSessionSchedule(window: SessionWindow, drops: PlannedDrop[]): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const ordered = [...drops].sort((a, b) => a.releaseMs - b.releaseMs);

  for (const drop of ordered) {
    if (drop.closesMs <= drop.releaseMs) {
      issues.push({ code: 'sale_window_invalid', dropId: drop.id, message: 'The sale must close after it opens.' });
    }
    if (drop.releaseMs < window.opensMs || drop.closesMs > window.closesMs) {
      issues.push({
        code: 'outside_session_window',
        dropId: drop.id,
        message: 'The drop must release and close inside its session window.',
      });
    }
  }

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const next = ordered[i];
    const gap = next.releaseMs - previous.releaseMs;
    if (gap < MIN_RELEASE_GAP_MS) {
      issues.push({
        code: 'gap_too_short',
        dropId: next.id,
        message: 'Consecutive releases in a session must be at least 5 minutes apart.',
      });
    } else if (gap > MAX_RELEASE_GAP_MS) {
      issues.push({
        code: 'gap_too_long',
        dropId: next.id,
        message: 'Consecutive releases in a session must be at most 30 minutes apart.',
      });
    }
    if (previous.closesMs > next.releaseMs) {
      issues.push({
        code: 'sale_overlaps_next_release',
        dropId: previous.id,
        message: 'A sale must close before the next drop releases.',
      });
    }
  }

  return issues;
}
