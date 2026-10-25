import { fail } from '../errors.ts';
import { constantTimeEqual, hmacSha256Hex } from '../crypto.ts';
import type {
  PaymentAdapter,
  ProviderOrder,
  ProviderPayment,
  ProviderPaymentStatus,
  ProviderRefund,
} from './payments.ts';

/** Checkout callback signature: HMAC(order_id|payment_id) with the key secret. */
export function checkoutSignature(keySecret: string, orderId: string, paymentId: string): string {
  return hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
}

/** Webhook signature: HMAC of the raw request body with the webhook secret. */
export function webhookSignature(webhookSecret: string, rawBody: string): string {
  return hmacSha256Hex(webhookSecret, rawBody);
}

interface RazorpayOrderJson {
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  status: string;
}

interface RazorpayPaymentJson {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: ProviderPaymentStatus;
  fee?: number | null;
  method?: string | null;
}

interface RazorpayRefundJson {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
  notes?: Record<string, string>;
}

const BASE_URL = 'https://api.razorpay.com/v1';

export interface RazorpayOptions {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: 'test' | 'live';
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Razorpay over its REST API. Card data never passes through this app: checkout runs in
 * Razorpay's own widget, and this code only sees order and payment IDs and amounts.
 */
export function createRazorpayAdapter(options: RazorpayOptions): PaymentAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? BASE_URL;
  const authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Provider error bodies are logged by the caller if needed. Buyers see only a generic message.
      throw fail.upstream(`The payment provider returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  const toOrder = (json: RazorpayOrderJson): ProviderOrder => ({
    id: json.id,
    amountPaise: json.amount,
    currency: json.currency,
    receipt: json.receipt ?? null,
    status: json.status,
  });

  const toPayment = (json: RazorpayPaymentJson): ProviderPayment => ({
    id: json.id,
    orderId: json.order_id,
    amountPaise: json.amount,
    currency: json.currency,
    status: json.status,
    feePaise: json.fee ?? null,
    method: json.method ?? null,
  });

  const toRefund = (json: RazorpayRefundJson): ProviderRefund => ({
    id: json.id,
    paymentId: json.payment_id,
    amountPaise: json.amount,
    status: json.status,
    notes: json.notes ?? {},
  });

  return {
    name: 'razorpay',
    mode: options.mode,
    configured: true,
    publishableKey: options.keyId,

    async createOrder({ amountPaise, currency, receipt, notes }) {
      const json = await call<RazorpayOrderJson>('POST', '/orders', {
        amount: amountPaise,
        currency,
        receipt,
        notes,
        payment_capture: 1,
      });
      return toOrder(json);
    },

    async fetchPayment(paymentId) {
      return toPayment(await call<RazorpayPaymentJson>('GET', `/payments/${encodeURIComponent(paymentId)}`));
    },

    async fetchOrderPayments(orderId) {
      const json = await call<{ items: RazorpayPaymentJson[] }>(
        'GET',
        `/orders/${encodeURIComponent(orderId)}/payments`,
      );
      return json.items.map(toPayment);
    },

    async createRefund({ paymentId, amountPaise, notes }) {
      const json = await call<RazorpayRefundJson>(
        'POST',
        `/payments/${encodeURIComponent(paymentId)}/refund`,
        { amount: amountPaise, notes, speed: 'normal' },
      );
      return toRefund(json);
    },

    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      return constantTimeEqual(checkoutSignature(options.keySecret, orderId, paymentId), signature);
    },

    verifyWebhookSignature(rawBody, signature) {
      return constantTimeEqual(webhookSignature(options.webhookSecret, rawBody), signature);
    },
  };
}
