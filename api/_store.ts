/**
 * Entitlement store.
 *
 * ⚠️ In-memory only — every serverless cold start wipes it. This is a
 * placeholder so the endpoints are readable end to end.
 *
 * TODO: replace with a real datastore (Postgres, Redis, KV, anything durable)
 * before taking real payments, or subscribers will silently lose access.
 */

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  /** Epoch millis; null until the first successful charge. */
  expiresAt: number | null;
}

export const subscriptions = new Map<string, Entitlement>();
