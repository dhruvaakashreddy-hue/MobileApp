import webpush from 'web-push';
import type { Config } from '../config.ts';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome =
  | { ok: true }
  | { ok: false; statusCode: number | null; gone: boolean; retryable: boolean; message: string };

export interface PushAdapter {
  readonly configured: boolean;
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage, ttlSeconds: number): Promise<PushOutcome>;
}

/**
 * Web Push over VAPID. Delivery depends on the browser vendor's push service and the device,
 * so callers must not describe it as guaranteed or second-accurate.
 */
export function createWebPushAdapter(vapid: NonNullable<Config['vapid']>): PushAdapter {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return {
    configured: true,
    publicKey: vapid.publicKey,
    async send(target, message, ttlSeconds) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(message),
          { TTL: ttlSeconds, urgency: 'high' },
        );
        return { ok: true };
      } catch (error) {
        const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : null;
        // 404 and 410 mean the browser has dropped this subscription. Retrying cannot help.
        const gone = statusCode === 404 || statusCode === 410;
        const retryable = statusCode === null || statusCode === 429 || statusCode >= 500;
        return { ok: false, statusCode, gone, retryable, message: `Push failed with status ${statusCode ?? 'unknown'}` };
      }
    },
  };
}

export function unconfiguredPush(): PushAdapter {
  return {
    configured: false,
    publicKey: null,
    async send() {
      return { ok: false, statusCode: null, gone: false, retryable: false, message: 'push_not_configured' };
    },
  };
}

/** Test helper: records sends and can simulate per-target outcomes. */
export function createMemoryPush(
  outcome: (target: PushTarget) => PushOutcome = () => ({ ok: true }),
): PushAdapter & { sent: { target: PushTarget; message: PushMessage }[] } {
  const adapter = {
    configured: true,
    publicKey: 'test-vapid-public-key',
    sent: [] as { target: PushTarget; message: PushMessage }[],
    async send(target: PushTarget, message: PushMessage) {
      const result = outcome(target);
      if (result.ok) adapter.sent.push({ target, message });
      return result;
    },
  };
  return adapter;
}
