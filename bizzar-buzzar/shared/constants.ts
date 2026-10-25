/**
 * Timing rules shared by the server, the worker and the browser.
 *
 * The 30-second reveal lead is also hard-coded in the `public_drops` view
 * (db/migrations/0002_access.sql). tests/db-access.test.ts asserts the two agree.
 */

/** A drop enters the reveal-countdown state this long before its release. */
export const REVEAL_LEAD_MS = 30_000;

/** Consecutive releases inside one session must be at least this far apart. */
export const MIN_RELEASE_GAP_MS = 5 * 60_000;

/** ...and at most this far apart. */
export const MAX_RELEASE_GAP_MS = 30 * 60_000;

/** Browser alerts are dispatched this long before release. Push is best-effort, not a guarantee. */
export const ALERT_LEAD_MS = 30_000;

/** Session reminder emails go out this long before the session window opens. */
export const SESSION_REMINDER_LEAD_MS = 15 * 60_000;

/** Default buyer hold on a single unit, bounded by the sale close time. */
export const DEFAULT_HOLD_MS = 120_000;
