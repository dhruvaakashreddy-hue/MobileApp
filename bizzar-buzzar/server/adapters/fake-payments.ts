import { constantTimeEqual } from '../crypto.ts';
import { checkoutSignature, webhookSignature } from './razorpay.ts';
import type { PaymentAdapter, ProviderOrder, ProviderPayment, ProviderRefund } from './payments.ts';

export interface FakePaymentAdapter extends PaymentAdapter {
  readonly mode: 'fake';
  readonly payments: Map<string, ProviderPayment>;
  readonly refunds: Map<string, ProviderRefund>;
  readonly orders: Map<string, ProviderOrder>;
  /** Test helper: records a captured payment against an order, as Razorpay would. */
  capture(orderId: string, overrides?: Partial<Pick<ProviderPayment, 'amountPaise' | 'currency' | 'feePaise'>>): ProviderPayment;
  /** Test helper: refunds are finished by webhook in production. Tests call this to simulate that. */
  settleRefund(refundId: string, status: 'processed' | 'failed'): ProviderRefund;
}

/**
 * Tests only. Shares the real HMAC code, so tests can produce genuine signatures for
 * webhooks and checkout callbacks. Never selected when NODE_ENV is production.
 */
export function createFakePaymentAdapter(secrets: { keySecret: string; webhookSecret: string }): FakePaymentAdapter {
  const orders = new Map<string, ProviderOrder>();
  const payments = new Map<string, ProviderPayment>();
  const refunds = new Map<string, ProviderRefund>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_fake_${String(++counter).padStart(6, '0')}`;

  return {
    name: 'fake',
    mode: 'fake',
    configured: true,
    publishableKey: 'rzp_test_fake_key',
    orders,
    payments,
    refunds,

    async createOrder({ amountPaise, currency, receipt }) {
      const order: ProviderOrder = { id: nextId('order'), amountPaise, currency, receipt, status: 'created' };
      orders.set(order.id, order);
      return order;
    },

    async fetchPayment(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw new Error(`Unknown fake payment ${paymentId}`);
      return payment;
    },

    async fetchOrderPayments(orderId) {
      return [...payments.values()].filter((payment) => payment.orderId === orderId);
    },

    async createRefund({ paymentId, amountPaise, notes }) {
      const refund: ProviderRefund = { id: nextId('rfnd'), paymentId, amountPaise, status: 'pending', notes };
      refunds.set(refund.id, refund);
      return refund;
    },

    capture(orderId, overrides = {}) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown fake order ${orderId}`);
      const payment: ProviderPayment = {
        id: nextId('pay'),
        orderId,
        amountPaise: overrides.amountPaise ?? order.amountPaise,
        currency: overrides.currency ?? order.currency,
        status: 'captured',
        feePaise: overrides.feePaise ?? Math.round(order.amountPaise * 0.02),
        method: 'upi',
      };
      payments.set(payment.id, payment);
      return payment;
    },

    settleRefund(refundId, status) {
      const refund = refunds.get(refundId);
      if (!refund) throw new Error(`Unknown fake refund ${refundId}`);
      const settled = { ...refund, status };
      refunds.set(refundId, settled);
      return settled;
    },

    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      return constantTimeEqual(checkoutSignature(secrets.keySecret, orderId, paymentId), signature);
    },

    verifyWebhookSignature(rawBody, signature) {
      return constantTimeEqual(webhookSignature(secrets.webhookSecret, rawBody), signature);
    },
  };
}
