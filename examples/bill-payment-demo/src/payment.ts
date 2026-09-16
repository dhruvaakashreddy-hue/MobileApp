import { loadRazorpay, type RazorpayFailure, type RazorpaySuccess } from './razorpay';
import type { CreatedOrder, PaymentMethod } from './types';

/**
 * The whole payment round trip, in one place.
 *
 * Order of events:
 *   1. ask our server to create an order   (server decides the amount)
 *   2. open Razorpay Checkout on the chosen method
 *   3. Checkout returns three values on success
 *   4. ask our server to verify the signature   (only now is it really paid)
 */

export async function createOrder(billId: string): Promise<CreatedOrder> {
  const res = await fetch('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billId }), // note: no amount — the server owns that
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Could not create the order');
  return data as CreatedOrder;
}

export async function verifyPayment(result: RazorpaySuccess): Promise<string> {
  const res = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
  const data = await res.json();
  if (!res.ok || !data.verified) {
    throw new Error(data.error ?? 'We could not verify that payment');
  }
  return data.paymentId as string;
}

/**
 * Tells Checkout to lead with the method the user picked.
 *
 * `show_default_blocks: false` means "show only my block", so choosing UPI
 * opens straight into UPI instead of the full menu. Drop that line if you would
 * rather offer everything with the chosen one first.
 */
function displayConfig(method: PaymentMethod) {
  const names: Record<PaymentMethod, string> = {
    upi: 'Pay by UPI',
    card: 'Pay by card',
    wallet: 'Pay by wallet',
  };
  return {
    display: {
      blocks: {
        chosen: { name: names[method], instruments: [{ method }] },
      },
      sequence: ['block.chosen'],
      preferences: { show_default_blocks: false },
    },
  };
}

export interface PayArgs {
  order: CreatedOrder;
  method: PaymentMethod;
  onSuccess: (paymentId: string) => void;
  onFailure: (message: string) => void;
  onDismiss: () => void;
}

export async function openCheckout({
  order,
  method,
  onSuccess,
  onFailure,
  onDismiss,
}: PayArgs): Promise<void> {
  await loadRazorpay();

  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: 'BillMate',
    description: order.bill.label,
    order_id: order.orderId,
    config: displayConfig(method),

    // Called by Checkout after a successful payment.
    handler: (response: RazorpaySuccess) => {
      // Do NOT show success yet. These values are only a claim until the
      // server has checked the signature against the key secret.
      verifyPayment(response)
        .then(onSuccess)
        .catch((err: Error) => onFailure(err.message));
    },

    prefill: { name: '', email: '', contact: '' },
    notes: { billId: order.bill.id },
    theme: { color: '#4f46e5' },

    modal: {
      // Fires when the user closes Checkout without paying.
      ondismiss: onDismiss,
    },
  });

  rzp.on('payment.failed', (response: RazorpayFailure) => {
    onFailure(response.error.description || 'The payment did not go through.');
  });

  rzp.open();
}
