import { fail } from '../errors.ts';

export interface ProviderOrder {
  id: string;
  amountPaise: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export type ProviderPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface ProviderPayment {
  id: string;
  orderId: string | null;
  amountPaise: number;
  currency: string;
  status: ProviderPaymentStatus;
  feePaise: number | null;
  method: string | null;
}

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: 'pending' | 'processed' | 'failed';
  notes: Record<string, string>;
}

/**
 * Everything the app needs from a payment provider. Razorpay is the India implementation;
 * the rest of the code never calls a provider SDK directly.
 */
export interface PaymentAdapter {
  readonly name: string;
  readonly mode: 'test' | 'live' | 'fake';
  readonly configured: boolean;
  /** Publishable key only. Safe to ship to the browser. */
  readonly publishableKey: string | null;
  createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** Used when no payment credentials are configured. Every call fails clearly rather than pretending. */
export function unconfiguredPayments(): PaymentAdapter {
  const unavailable = (): never => {
    throw fail.unavailable('payments_not_configured', 'Payments are not configured on this server yet.');
  };
  return {
    name: 'none',
    mode: 'test',
    configured: false,
    publishableKey: null,
    createOrder: unavailable,
    fetchPayment: unavailable,
    fetchOrderPayments: unavailable,
    createRefund: unavailable,
    verifyCheckoutSignature: () => false,
    verifyWebhookSignature: () => false,
  };
}
