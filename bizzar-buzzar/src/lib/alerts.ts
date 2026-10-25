import { api } from './api.ts';

/**
 * Browser alerts. Nothing here runs until the buyer presses a button that says what it does.
 * Permission is requested inside that click, never on page load.
 */

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function pushState(): PushState {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushState;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'not_configured';

export async function enableBrowserAlerts(vapidPublicKey: string | null): Promise<EnableResult> {
  if (pushState() === 'unsupported') return 'unsupported';
  if (!vapidPublicKey) return 'not_configured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(vapidPublicKey),
    }));

  await api('/me/push-subscriptions', { body: subscription.toJSON() });
  return 'enabled';
}

/** Removes this browser's subscription from the device and from the server. */
export async function disableBrowserAlerts(): Promise<void> {
  if (pushState() !== 'unsupported') {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  await api('/me/alerts/unsubscribe-all', { body: {} });
}
