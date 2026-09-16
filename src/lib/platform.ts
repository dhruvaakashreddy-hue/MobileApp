import { Capacitor } from '@capacitor/core';

/**
 * Where the app is running.
 *
 * Its own module rather than a helper inside notifications.ts, because billing
 * and deep-link code need it without dragging the notification and persona
 * layers in behind it.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
