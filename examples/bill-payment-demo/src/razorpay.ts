/**
 * Loading Razorpay Checkout.
 *
 * checkout.js has to come from Razorpay's own CDN — it cannot be bundled,
 * because it is loaded and updated by them. This injects the tag once and
 * remembers the promise, so opening checkout twice does not load it twice.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loader: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    // Already there? Nothing to do. Worth checking before the tag, because the
    // script may have been loaded by something else on the page, and waiting on
    // a second network round trip would delay checkout for no reason.
    if (typeof window.Razorpay === 'function') return resolve();
    if (document.querySelector(`script[src="${CHECKOUT_SRC}"]`)) return resolve();

    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      loader = null;
      reject(new Error('Could not load Razorpay Checkout. Check your connection.'));
    };
    document.body.appendChild(script);
  });

  return loader;
}

/** The three values Checkout hands back on success. */
export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (r: RazorpayFailure) => void): void;
}

export interface RazorpayFailure {
  error: {
    code: string;
    description: string;
    reason?: string;
    step?: string;
    source?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}
