/**
 * POST /cancel-subscription  { subscriberId }
 *
 * The paywall promises "cancel anytime", so there has to be a way to do it that
 * is not an email to support. Cancels at the end of the paid cycle: the
 * customer keeps what they have already paid for, and is not charged again.
 *
 * ⚠️ Unauthenticated, like /subscription-status — someone who knows a
 * subscriber id could cancel that subscription. It costs them nothing and
 * refunds nobody, but require the signed token here as soon as you add one.
 */

import {
  handledPreflight, jsonBody, type ApiRequest, type ApiResponse,
} from './_http.ts';
import { entitlementStore } from './_store.ts';
import { cancelSubscription, readConfig, RazorpayError } from './_razorpay.ts';

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
    res.status(500).json({ error: 'Razorpay is not configured.' });
    return;
  }

  const subscriberId = jsonBody<{ subscriberId?: string }>(req)?.subscriberId?.trim();
  if (!subscriberId) {
    res.status(400).json({ error: 'subscriberId is required' });
    return;
  }

  const store = entitlementStore();
  const record = await store.get(subscriberId);
  if (!record) {
    res.status(404).json({ error: 'No subscription on record' });
    return;
  }

  try {
    const sub = await cancelSubscription(cfg, record.subscriptionId, true);
    // Access is NOT revoked here — the cycle already paid for runs to its end.
    // The `subscription.cancelled` webhook closes it out when it expires.
    await store.set(subscriberId, { ...record, lastEvent: `cancel:${sub.status}` });
    res.status(200).json({
      ok: true,
      status: sub.status,
      activeUntil: record.expiresAt,
    });
  } catch (err) {
    if (err instanceof RazorpayError) {
      console.error('[nudge] razorpay rejected cancel', err.detail);
      res.status(502).json({ error: 'Razorpay rejected the cancellation' });
      return;
    }
    console.error('[nudge] cancel-subscription failed', err);
    res.status(500).json({ error: 'Could not reach Razorpay' });
  }
}
