/**
 * POST /create-subscription
 *
 * Body: { subscriberId, phoneNumber?, name?, email? }
 * Returns: { subscriptionId, checkoutUrl }
 *
 * Creates the Razorpay subscription and hands the app a URL to open. The app
 * opens that URL, the customer pays with UPI / card / netbanking / wallet, and
 * entitlement is granted later by the signed webhook — never by the client.
 */

import {
  handledPreflight, jsonBody, type ApiRequest, type ApiResponse,
} from './_http.ts';
import { entitlementStore } from './_store.ts';
import { createSubscription, readConfig, RazorpayError } from './_razorpay.ts';

interface Body {
  subscriberId?: string;
  phoneNumber?: string;
  name?: string;
  email?: string;
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  if (handledPreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cfg = readConfig();
  if (!cfg) {
    res.status(500).json({ error: 'Razorpay is not configured. See api/README.md.' });
    return;
  }

  const body = jsonBody<Body>(req) ?? {};
  const subscriberId = body.subscriberId?.trim();
  if (!subscriberId) {
    res.status(400).json({ error: 'subscriberId is required' });
    return;
  }

  const store = entitlementStore();

  try {
    // Reuse a subscription that is still awaiting payment rather than leaving
    // a trail of abandoned ones every time someone taps Subscribe twice.
    const existing = await store.get(subscriberId);
    if (existing && !existing.active) {
      res.status(200).json({
        subscriptionId: existing.subscriptionId,
        checkoutUrl: checkoutUrl(req, existing.subscriptionId, body),
        reused: true,
      });
      return;
    }

    const sub = await createSubscription(cfg, { subscriberId });

    await store.set(subscriberId, {
      subscriptionId: sub.id,
      // Only the signature-verified webhook may flip this to true.
      active: false,
      expiresAt: null,
      lastEvent: 'created',
    });

    res.status(200).json({
      subscriptionId: sub.id,
      checkoutUrl: checkoutUrl(req, sub.id, body),
      // Razorpay's own hosted page, as a fallback if our checkout page is
      // unreachable for any reason.
      hostedUrl: sub.short_url,
    });
  } catch (err) {
    if (err instanceof RazorpayError) {
      console.error('[nudge] razorpay rejected create-subscription', err.detail);
      res.status(502).json({ error: 'Razorpay rejected the request' });
      return;
    }
    console.error('[nudge] create-subscription failed', err);
    res.status(500).json({ error: 'Could not reach Razorpay' });
  }
}

/** Our own checkout page, which knows how to send the customer back to the app. */
function checkoutUrl(req: ApiRequest, subscriptionId: string, body: Body): string {
  const base =
    process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? inferBase(req);
  const params = new URLSearchParams({ subscriptionId });
  if (body.phoneNumber) params.set('contact', body.phoneNumber);
  if (body.name) params.set('name', body.name);
  if (body.email) params.set('email', body.email);
  return `${base}/checkout?${params.toString()}`;
}

function inferBase(req: ApiRequest): string {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const h = Array.isArray(host) ? host[0] : host;
  const p = Array.isArray(proto) ? proto[0] : proto;
  return `${p}://${h ?? 'localhost'}`;
}
