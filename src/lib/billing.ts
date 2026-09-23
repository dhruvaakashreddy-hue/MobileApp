import { Browser } from '@capacitor/browser';
import { store, type Premium } from './storage';

/**
 * Subscription handling.
 *
 * v1 is a LOCAL STUB: `unlockPremium()` writes a flag plus an expiry date into
 * Preferences so the paywall and the locked-persona UI can be built and tested
 * end to end. No real money moves, and there are no keys in this bundle.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ OPEN DECISION — read docs/BILLING_DECISION.md before wiring real billing.
 *
 * Apple (App Store Review Guideline 3.1.1) and Google (Play Billing policy)
 * both require their own in-app purchase rails for digital content unlocked
 * inside the app. Razorpay is NOT compliant for that, so the two viable paths
 * are:
 *   (a) RevenueCat + StoreKit/Play Billing in the app, Razorpay only on a
 *       companion website; or
 *   (b) Android-only distribution via direct APK / your own website, where
 *       Razorpay is allowed, and skip the stores for now.
 *
 * That choice is yours to make, so the code below is written against the
 * `BillingProvider` interface: swapping between a Razorpay provider and a
 * RevenueCat provider is a one-line change in `activeProvider`, and no screen
 * needs to know which one is in use.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const PRICE_LABEL = '₹99';
export const PRICE_PERIOD = 'month';

export interface BillingProvider {
  id: 'stub' | 'razorpay' | 'revenuecat';
  /** Starts a purchase. Resolves once the flow has been handed off or completed. */
  purchase(): Promise<Premium>;
  /** Re-reads entitlement from the source of truth. */
  restore(): Promise<Premium>;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** Entitlement is active only while the local flag AND the expiry agree. */
export function isPremiumActive(p: Premium, now: number = Date.now()): boolean {
  if (!p.active) return false;
  if (p.expiresAt === null) return false;
  return p.expiresAt > now;
}

/**
 * v1 stub provider — grants a 30-day local entitlement with no payment.
 * TODO: delete this once a real provider below is live. Do not ship it to
 * production: anyone reaching the paywall gets premium for free.
 */
const stubProvider: BillingProvider = {
  id: 'stub',
  async purchase(): Promise<Premium> {
    const premium: Premium = {
      active: true,
      expiresAt: Date.now() + THIRTY_DAYS,
      subscriptionId: 'stub-subscription',
    };
    await store.setPremium(premium);
    return premium;
  },
  async restore(): Promise<Premium> {
    // With no server, "restore" can only re-read what's on this device.
    const premium = await store.getPremium();
    if (!isPremiumActive(premium)) {
      const cleared: Premium = { active: false, expiresAt: null, subscriptionId: null };
      await store.setPremium(cleared);
      return cleared;
    }
    return premium;
  },
};

/**
 * Razorpay provider — NOT wired up. Razorpay Checkout is a web flow, so it is
 * opened in the system browser and returns via the `nudgeapp://payment-success`
 * deep link handled in `src/lib/deeplink.ts`.
 *
 * TODO before this can work (see docs/MANUAL_SETUP.md):
 *   1. Create a Razorpay business account and finish KYC in their dashboard.
 *      Bank account details go in the dashboard ONLY — never in this repo.
 *   2. Create a ₹99/month Subscription Plan; note its Plan ID.
 *   3. Deploy `api/` and set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 *      RAZORPAY_PLAN_ID / RAZORPAY_WEBHOOK_SECRET as env vars on the host.
 *      The SECRET is server-side only and must never enter the app bundle.
 *   4. Put the deployed base URL in VITE_API_BASE_URL.
 */
const razorpayProvider: BillingProvider = {
  id: 'razorpay',
  async purchase(): Promise<Premium> {
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (!apiBase) {
      throw new Error(
        'VITE_API_BASE_URL is not set — deploy api/ and configure it first.',
      );
    }
    // A subscription must be created server-side; the client never holds the
    // key secret and never signs anything itself.
    const res = await fetch(`${apiBase}/create-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: await getDeviceId() }),
    });
    if (!res.ok) throw new Error(`create-subscription failed: ${res.status}`);
    const { shortUrl } = (await res.json()) as { shortUrl: string };

    // Hand off to Razorpay's hosted page; the deep link brings us back.
    await Browser.open({ url: shortUrl, presentationStyle: 'popover' });

    // Entitlement is granted by the deep-link handler once payment succeeds,
    // so nothing is unlocked here.
    return store.getPremium();
  },
  async restore(): Promise<Premium> {
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (!apiBase) return store.getPremium();
    try {
      const res = await fetch(
        `${apiBase}/subscription-status?deviceId=${encodeURIComponent(await getDeviceId())}`,
      );
      if (!res.ok) return store.getPremium();
      const data = (await res.json()) as {
        active: boolean;
        expiresAt: number | null;
        subscriptionId: string | null;
      };
      const premium: Premium = {
        active: data.active,
        expiresAt: data.expiresAt,
        subscriptionId: data.subscriptionId,
      };
      await store.setPremium(premium);
      return premium;
    } catch {
      return store.getPremium();
    }
  },
};

/** Stable per-install id, used to tie a subscription to this device. */
async function getDeviceId(): Promise<string> {
  const existing = await store.getPremium();
  if (existing.subscriptionId) return existing.subscriptionId;
  return `device-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// TODO: switch to `razorpayProvider` (web/Android-direct) or add a RevenueCat
// provider (App Store / Play) once the decision in docs/BILLING_DECISION.md is
// made. Everything else in the app reads from here.
export const activeProvider: BillingProvider = razorpayProvider;

void stubProvider; // referenced above; kept wired for the switch-over.

export async function checkSubscriptionStatus(): Promise<Premium> {
  const premium = await store.getPremium();
  if (premium.active && !isPremiumActive(premium)) {
    const expired: Premium = { active: false, expiresAt: null, subscriptionId: null };
    await store.setPremium(expired);
    return expired;
  }
  return premium;
}

export async function unlockPremium(): Promise<Premium> {
  return activeProvider.purchase();
}

export async function restorePurchases(): Promise<Premium> {
  return activeProvider.restore();
}

export function formatExpiry(p: Premium): string | null {
  if (!p.expiresAt) return null;
  return new Date(p.expiresAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
