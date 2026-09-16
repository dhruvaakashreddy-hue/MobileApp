import { Browser } from '@capacitor/browser';
import { store, type Premium } from './storage.ts';
import { isNative } from './platform.ts';

/**
 * Subscription handling.
 *
 * Tapping Subscribe opens Razorpay Checkout, which offers UPI (GPay, PhonePe,
 * Paytm, or any UPI app), cards, netbanking and wallets. The flow is:
 *
 *   1. App  → POST /create-subscription          (server holds the key secret)
 *   2. App  → opens the returned checkout URL    (system / in-app browser)
 *   3. User → pays, and sets up the monthly UPI Autopay mandate
 *   4. Razorpay → POST /webhook                  (signed; grants entitlement)
 *   5. App  → GET /subscription-status           (the only thing it trusts)
 *
 * Step 5 is the important one. The `nudgeapp://payment-success` deep link is a
 * hint that payment finished, nothing more — anyone can open a URL, so it is
 * never allowed to unlock the app by itself. Entitlement always comes from the
 * server, which learned it from Razorpay's signed webhook.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ STORE POLICY — read docs/BILLING_DECISION.md.
 *
 * Apple (Guideline 3.1.1) and Google (Play Billing policy) require their own
 * in-app purchase rails for digital content unlocked inside the app. Razorpay
 * is the right rail for ₹99/month in India, but it is NOT store-compliant, so
 * this flow is for direct Android distribution and the web. For the App Store
 * and Play, add a RevenueCat provider behind the same `BillingProvider`
 * interface — no screen needs to know which one is in use.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const PRICE_LABEL = '₹99';
export const PRICE_PERIOD = 'month';

/** Who is paying. Keyed on the account so a subscription survives a reinstall. */
export interface Subscriber {
  id: string;
  phoneNumber?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface BillingProvider {
  id: 'stub' | 'razorpay';
  /** Starts a purchase. Resolves once the server confirms, or the user backs out. */
  purchase(subscriber: Subscriber): Promise<Premium>;
  /** Re-reads entitlement from the source of truth. */
  restore(subscriber: Subscriber): Promise<Premium>;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NO_PREMIUM: Premium = { active: false, expiresAt: null, subscriptionId: null };

/** Entitlement is active only while the local flag AND the expiry agree. */
export function isPremiumActive(p: Premium, now: number = Date.now()): boolean {
  if (!p.active) return false;
  if (p.expiresAt === null) return false;
  return p.expiresAt > now;
}

/**
 * The deployed `api/` base URL. Empty in a dev build with no server, and in
 * unit tests, where `import.meta.env` does not exist at all.
 */
function apiBase(): string {
  const env = import.meta.env as ImportMetaEnv | undefined;
  return (env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
}

/**
 * `fetch` with a deadline.
 *
 * A mobile network can leave a request hanging indefinitely, and every call
 * below sits in front of something the user is waiting on — the paywall button,
 * or a resume check. An unbounded fetch here shows up as an app that has hung.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────────── Razorpay ────────────────────────────────── */

interface StatusResponse {
  active: boolean;
  expiresAt: number | null;
  subscriptionId: string | null;
}

/**
 * Asks the server whether this subscriber is entitled, and mirrors the answer
 * locally so the app works offline afterwards.
 *
 * A network failure returns what is already on the device rather than locking
 * someone out on a train — the expiry date still bounds how long that lasts.
 */
export async function verifyEntitlement(subscriberId: string): Promise<Premium> {
  const base = apiBase();
  if (!base) return store.getPremium();
  try {
    const res = await fetchWithTimeout(
      `${base}/subscription-status?subscriberId=${encodeURIComponent(subscriberId)}`,
      { headers: { Accept: 'application/json' } },
      8_000,
    );
    if (!res.ok) return store.getPremium();
    const data = (await res.json()) as StatusResponse;
    const premium: Premium = {
      active: !!data.active,
      expiresAt: data.expiresAt ?? null,
      subscriptionId: data.subscriptionId ?? null,
    };
    await store.setPremium(premium);
    return premium;
  } catch {
    return store.getPremium();
  }
}

/**
 * Polls for entitlement while the customer is paying.
 *
 * Razorpay's webhook usually lands within a couple of seconds of payment, but
 * it is a separate network hop and can lag, so this keeps asking. It gives up
 * when `stop()` says the checkout window has been closed and a short grace
 * period has passed, or when the overall deadline is reached.
 */
async function pollForEntitlement(
  subscriberId: string,
  opts: { timeoutMs: number; intervalMs: number; closedFor: () => number | null },
): Promise<Premium> {
  const deadline = Date.now() + opts.timeoutMs;
  const GRACE_AFTER_CLOSE_MS = 12_000;

  while (Date.now() < deadline) {
    await sleep(opts.intervalMs);
    const premium = await verifyEntitlement(subscriberId);
    if (isPremiumActive(premium)) return premium;

    const closedFor = opts.closedFor();
    if (closedFor !== null && closedFor > GRACE_AFTER_CLOSE_MS) break;
  }
  return store.getPremium();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const razorpayProvider: BillingProvider = {
  id: 'razorpay',

  async purchase(subscriber: Subscriber): Promise<Premium> {
    const base = apiBase();
    if (!base) {
      throw new Error('VITE_API_BASE_URL is not set — deploy api/ first.');
    }

    // The subscription is created server-side: the client never holds the key
    // secret and never signs anything itself.
    const res = await fetchWithTimeout(`${base}/create-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriberId: subscriber.id,
        phoneNumber: subscriber.phoneNumber ?? undefined,
        name: subscriber.name ?? undefined,
        email: subscriber.email ?? undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`create-subscription failed: ${res.status} ${detail}`);
    }
    const { checkoutUrl } = (await res.json()) as { checkoutUrl: string };

    // Track when the payment window closes, so an abandoned checkout stops the
    // poll below instead of spinning for minutes.
    let closedAt: number | null = null;
    const closedFor = () => (closedAt === null ? null : Date.now() - closedAt);

    if (isNative()) {
      const finished = await Browser.addListener('browserFinished', () => {
        closedAt = Date.now();
      });
      try {
        await Browser.open({ url: checkoutUrl, presentationStyle: 'popover' });
        return await pollForEntitlement(subscriber.id, {
          timeoutMs: 5 * 60_000,
          intervalMs: 2_500,
          closedFor,
        });
      } finally {
        void finished.remove();
      }
    }

    // Web build: a new tab, since there is no deep link to come back through.
    const tab = window.open(checkoutUrl, '_blank', 'noopener');
    if (!tab) {
      // Popup blocked — same tab, and the customer returns to a fresh load
      // where `restore` picks the subscription up.
      window.location.assign(checkoutUrl);
      return store.getPremium();
    }
    const watch = window.setInterval(() => {
      if (tab.closed) closedAt = Date.now();
    }, 1_000);
    try {
      return await pollForEntitlement(subscriber.id, {
        timeoutMs: 5 * 60_000,
        intervalMs: 2_500,
        closedFor,
      });
    } finally {
      window.clearInterval(watch);
    }
  },

  restore(subscriber: Subscriber): Promise<Premium> {
    return verifyEntitlement(subscriber.id);
  },
};

/* ─────────────────────────────── stub ──────────────────────────────────── */

/**
 * Development fallback, used only while VITE_API_BASE_URL is unset. Grants a
 * 30-day local entitlement and charges nothing, so the screens behind the
 * paywall can be worked on without a payment account.
 *
 * It cannot reach production by accident: setting VITE_API_BASE_URL — which a
 * real build needs anyway — switches the app to Razorpay, and the paywall
 * shows a warning banner whenever this one is live.
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
    // With no server, "restore" can only re-read what is on this device.
    const premium = await store.getPremium();
    if (!isPremiumActive(premium)) {
      await store.setPremium(NO_PREMIUM);
      return NO_PREMIUM;
    }
    return premium;
  },
};

/** Razorpay as soon as an API base URL exists; the stub only before that. */
export const activeProvider: BillingProvider = apiBase()
  ? razorpayProvider
  : stubProvider;

/** True when payments are real. The paywall warns when they are not. */
export function billingIsLive(): boolean {
  return activeProvider.id === 'razorpay';
}

/* ──────────────────────────── app-facing API ───────────────────────────── */

/** Falls back to a per-install id if called before anyone has signed in. */
async function resolveSubscriber(subscriber?: Subscriber): Promise<Subscriber> {
  if (subscriber?.id) return subscriber;
  return { id: await store.getSubscriberId() };
}

export async function unlockPremium(subscriber?: Subscriber): Promise<Premium> {
  return activeProvider.purchase(await resolveSubscriber(subscriber));
}

export async function restorePurchases(subscriber?: Subscriber): Promise<Premium> {
  return activeProvider.restore(await resolveSubscriber(subscriber));
}

/**
 * Cancels at the end of the paid cycle. Access continues until the date the
 * customer has already paid for, which is what "cancel anytime" means.
 */
export async function cancelSubscription(subscriber?: Subscriber): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  const who = await resolveSubscriber(subscriber);
  try {
    const res = await fetchWithTimeout(`${base}/cancel-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriberId: who.id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The local entitlement check, used at launch.
 *
 * Deliberately offline: the app must open at the speed of a Preferences read,
 * not at the speed of the slowest mobile network the user is on. Expiry is
 * enforced here, so a lapsed subscription stops working with no connectivity at
 * all — and `refreshEntitlement` catches up with the server a moment later.
 */
export async function checkSubscriptionStatus(): Promise<Premium> {
  const premium = await store.getPremium();
  if (premium.active && !isPremiumActive(premium)) {
    await store.setPremium(NO_PREMIUM);
    return NO_PREMIUM;
  }
  return premium;
}

/**
 * Re-checks entitlement against the server. Called once the app is up and on
 * every resume, so a subscription that lapses or is cancelled elsewhere stops
 * working here too.
 */
export async function refreshEntitlement(
  subscriber?: Subscriber,
): Promise<Premium> {
  if (!billingIsLive()) return checkSubscriptionStatus();
  const who = await resolveSubscriber(subscriber);
  const fresh = await verifyEntitlement(who.id);
  if (isPremiumActive(fresh)) return fresh;
  return checkSubscriptionStatus();
}

export function formatExpiry(p: Premium): string | null {
  if (!p.expiresAt) return null;
  return new Date(p.expiresAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
