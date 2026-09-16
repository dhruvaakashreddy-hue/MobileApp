/**
 * Razorpay REST client.
 *
 * Everything here needs the key SECRET, which is why it lives on the server and
 * never in the app bundle. A leaked secret lets anyone charge your customers
 * and refund themselves, so it is read from the environment only.
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  planId: string;
}

/** Reads and validates config, so each handler fails with one clear message. */
export function readConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!keyId || !keySecret || !planId) return null;
  return { keyId, keySecret, planId };
}

export class RazorpayError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = 'RazorpayError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  cfg: RazorpayConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new RazorpayError(`Razorpay ${init.method} ${path} failed`, res.status, text);
  }
  return JSON.parse(text) as T;
}

export interface RazorpaySubscription {
  id: string;
  status:
    | 'created'
    | 'authenticated'
    | 'active'
    | 'pending'
    | 'halted'
    | 'cancelled'
    | 'completed'
    | 'expired';
  short_url: string;
  /** Seconds since epoch; present once a cycle is running. */
  current_end?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string>;
}

/**
 * Creates a ₹99/month subscription.
 *
 * `total_count` is the number of billing cycles the mandate covers. 120 months
 * is ten years — effectively "until cancelled", which is what the paywall
 * promises. Razorpay requires a finite number, so this is the standard trick.
 */
export function createSubscription(
  cfg: RazorpayConfig,
  args: { subscriberId: string; notes?: Record<string, string> },
): Promise<RazorpaySubscription> {
  return request<RazorpaySubscription>(cfg, '/subscriptions', {
    method: 'POST',
    body: {
      plan_id: cfg.planId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      // Carried back to us on every webhook, and how a payment is tied to the
      // account that started it.
      notes: { subscriberId: args.subscriberId, ...args.notes },
    },
  });
}

export function fetchSubscription(
  cfg: RazorpayConfig,
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  return request<RazorpaySubscription>(cfg, `/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
}

export function cancelSubscription(
  cfg: RazorpayConfig,
  subscriptionId: string,
  atCycleEnd: boolean,
): Promise<RazorpaySubscription> {
  return request<RazorpaySubscription>(
    cfg,
    `/subscriptions/${subscriptionId}/cancel`,
    { method: 'POST', body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } },
  );
}

/** Statuses in which the customer has paid and should have access. */
export function grantsAccess(status: RazorpaySubscription['status']): boolean {
  return status === 'active' || status === 'authenticated';
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** A renewal charge can land a little late; don't lock a payer out over it. */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** Turns Razorpay's period end into the expiry the app should honour. */
export function expiryFrom(sub: RazorpaySubscription): number {
  const periodEnd = sub.current_end ? sub.current_end * 1000 : null;
  const chargeAt = sub.charge_at ? sub.charge_at * 1000 : null;
  const base = periodEnd ?? chargeAt ?? Date.now() + THIRTY_DAYS_MS;
  return base + RENEWAL_GRACE_MS;
}
