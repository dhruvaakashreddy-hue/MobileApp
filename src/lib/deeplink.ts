import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { store, type Premium } from './storage';
import { isNative } from './notifications';
import { verifyEntitlement } from './billing';

/**
 * Handles the return trip from Razorpay Checkout:
 *
 *   nudgeapp://payment-success?subscription_id=...&payment_id=...
 *   nudgeapp://payment-cancelled?subscription_id=...
 *
 * A deep link is NOT proof of payment — any app or web page can open one — so
 * nothing is unlocked from its contents. It only tells the app that checkout
 * finished, which is the cue to ask the server (which verified Razorpay's
 * signed webhook) what the truth is.
 */

/** The webhook can land a beat after the redirect, so a miss is retried. */
const VERIFY_ATTEMPTS = 6;
const VERIFY_INTERVAL_MS = 2_000;

export async function registerDeepLinks(
  onPremiumChange: (p: Premium) => void,
  subscriberId?: () => Promise<string>,
): Promise<() => void> {
  if (!isNative()) return () => {};

  const handle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith('nudgeapp://')) return;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }

    // Close the in-app browser Razorpay was shown in.
    void Browser.close().catch(() => {});

    if (parsed.host !== 'payment-success' && parsed.host !== 'payment-cancelled') {
      return;
    }

    const who = subscriberId
      ? await subscriberId()
      : await store.getSubscriberId();

    // Even on "cancelled" it is worth one check: the modal's dismiss callback
    // also fires on some UPI apps after a payment that did go through.
    const attempts = parsed.host === 'payment-success' ? VERIFY_ATTEMPTS : 1;

    for (let i = 0; i < attempts; i++) {
      const premium = await verifyEntitlement(who);
      if (premium.active) {
        onPremiumChange(premium);
        return;
      }
      if (i < attempts - 1) await sleep(VERIFY_INTERVAL_MS);
    }

    // Nothing granted: leave the paywall exactly as it was. The poll started
    // when Subscribe was tapped is still running and will catch a late webhook.
    onPremiumChange(await store.getPremium());
  });

  return () => {
    void handle.remove();
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
