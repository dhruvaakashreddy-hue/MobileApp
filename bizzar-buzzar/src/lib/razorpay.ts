/**
 * Loads Razorpay's hosted checkout script on demand. It is loaded only on the checkout screen,
 * and it runs only with the order ID the server created.
 */

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('The payment window could not load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
