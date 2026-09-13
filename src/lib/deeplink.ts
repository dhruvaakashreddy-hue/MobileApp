import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { store, type Premium } from './storage';
import { isNative } from './notifications';

/**
 * Handles the return trip from Razorpay's hosted checkout:
 * `nudgeapp://payment-success?subscription_id=...`
 *
 * TODO (real billing): a deep link alone must NOT be trusted to grant an
 * entitlement — anyone can open a URL. Once `api/` is deployed, this handler
 * should call `/subscription-status` and let the SERVER (which has verified
 * Razorpay's webhook signature) decide whether the subscription is active.
 * The optimistic local unlock below exists only so the stubbed flow is
 * testable end to end.
 */

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function registerDeepLinks(
  onPremiumChange: (p: Premium) => void,
): Promise<() => void> {
  if (!isNative()) return () => {};

  const handle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!url.startsWith('nudgeapp://')) return;

    // Close the in-app browser Razorpay was shown in.
    void Browser.close().catch(() => {});

    if (parsed.host === 'payment-success') {
      const subscriptionId = parsed.searchParams.get('subscription_id');
      const premium: Premium = {
        active: true,
        expiresAt: Date.now() + THIRTY_DAYS,
        subscriptionId,
      };
      await store.setPremium(premium);
      onPremiumChange(premium);
    }
  });

  return () => {
    void handle.remove();
  };
}
