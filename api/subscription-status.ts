/**
 * GET /subscription-status?subscriberId=...
 *
 * The app's source of truth for entitlement. The app polls this after payment
 * and re-checks it on every resume.
 *
 * Normally this answers from the store, which the signed webhook writes. If the
 * store has no active record — a missed webhook, a cold start that wiped an
 * in-memory store, a webhook that has not landed yet in the seconds right after
 * payment — it asks Razorpay directly and repairs the record. Without that
 * fallback a paying customer can end up locked out of an app they have paid for,
 * which is the worst failure this system has.
 *
 * ⚠️ Unauthenticated: anyone who knows a subscriber id can read its status.
 * That leaks "is this account subscribed", nothing more — no payment details,
 * and it grants nothing. Before launch, issue a signed token at sign-in and
 * require it here (see api/README.md).
 */

import {
  handledPreflight, queryParam, type ApiRequest, type ApiResponse,
} from './_http.ts';
import { entitlementStore, isEntitled, type Entitlement } from './_store.ts';
import { expiryFrom, fetchSubscription, grantsAccess, readConfig } from './_razorpay.ts';

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  if (handledPreflight(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // `deviceId` is accepted as an alias so builds from before accounts existed
  // keep working.
  const subscriberId =
    queryParam(req, 'subscriberId') ?? queryParam(req, 'deviceId');
  if (!subscriberId) {
    res.status(400).json({ error: 'subscriberId is required' });
    return;
  }

  const store = entitlementStore();
  let record = await store.get(subscriberId);

  if (!isEntitled(record) && record?.subscriptionId) {
    const repaired = await repairFromRazorpay(subscriberId, record);
    if (repaired) record = repaired;
  }

  const entitled = isEntitled(record);
  res.status(200).json({
    active: entitled,
    expiresAt: entitled ? (record?.expiresAt ?? null) : null,
    subscriptionId: record?.subscriptionId ?? null,
  });
}

/** Asks Razorpay what it thinks, and writes the answer back into the store. */
async function repairFromRazorpay(
  subscriberId: string,
  record: Entitlement,
): Promise<Entitlement | null> {
  const cfg = readConfig();
  if (!cfg) return null;
  try {
    const sub = await fetchSubscription(cfg, record.subscriptionId);
    const next: Entitlement = {
      subscriptionId: sub.id,
      active: grantsAccess(sub.status),
      expiresAt: grantsAccess(sub.status) ? expiryFrom(sub) : null,
      lastEvent: `poll:${sub.status}`,
    };
    await entitlementStore().set(subscriberId, next);
    return next;
  } catch (err) {
    console.error('[nudge] could not verify subscription with Razorpay', err);
    return null;
  }
}
