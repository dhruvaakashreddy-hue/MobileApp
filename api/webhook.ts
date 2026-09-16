/**
 * POST /webhook
 *
 * Razorpay calls this when a subscription is authenticated, charged, halted or
 * cancelled. This is the ONLY place entitlement is granted: the deep link back
 * into the app is a UI hint and can be forged by anyone with a text editor.
 *
 * Set it up in the Razorpay dashboard → Settings → Webhooks, pointing at
 * `https://<your-api>/webhook`, subscribed to the `subscription.*` events, with
 * the secret you put in RAZORPAY_WEBHOOK_SECRET.
 */

import crypto from 'node:crypto';
import { applyCors, header, type ApiRequest, type ApiResponse } from './_http.ts';
import { entitlementStore, type Entitlement } from './_store.ts';

/**
 * On Vercel, disable the default body parser for this route so `rawBody` is
 * available — the signature is computed over the exact bytes Razorpay sent, and
 * re-serialising a parsed object will not reproduce them.
 */
export const config = { api: { bodyParser: false } };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

interface SubscriptionEntity {
  id?: string;
  status?: string;
  notes?: { subscriberId?: string; deviceId?: string };
  current_end?: number | null;
  charge_at?: number | null;
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  applyCors(req, res);
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not set' });
    return;
  }

  const signature = header(req, 'x-razorpay-signature');
  const raw = await rawBody(req);
  if (!signature || raw === null) {
    res.status(400).json({ error: 'Missing signature or raw body' });
    return;
  }

  if (!signatureMatches(raw, signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let event: { event?: string; payload?: { subscription?: { entity?: SubscriptionEntity } } };
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Body is not valid JSON' });
    return;
  }

  const entity = event.payload?.subscription?.entity;
  const subscriptionId = entity?.id;
  if (!subscriptionId) {
    // Acknowledge anyway: a non-2xx makes Razorpay retry an event we can do
    // nothing with, for days.
    res.status(200).json({ ok: true, ignored: 'no subscription entity' });
    return;
  }

  const store = entitlementStore();
  // `deviceId` is the older note name; still honoured for subscriptions created
  // by a previous build.
  let subscriberId = entity?.notes?.subscriberId ?? entity?.notes?.deviceId;
  if (!subscriberId) {
    const found = await store.findBySubscriptionId(subscriptionId);
    subscriberId = found?.subscriberId;
  }
  if (!subscriberId) {
    res.status(200).json({ ok: true, ignored: 'no subscriberId' });
    return;
  }

  const name = event.event ?? '';
  switch (name) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed': {
      await store.set(subscriberId, {
        ...grant(entity, subscriptionId),
        lastEvent: name,
      });
      break;
    }
    case 'subscription.halted':
    case 'subscription.paused':
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired': {
      const revoked: Entitlement = {
        subscriptionId,
        active: false,
        expiresAt: null,
        lastEvent: name,
      };
      await store.set(subscriberId, revoked);
      break;
    }
    default:
      break; // pending / updated etc. — nothing to change
  }

  res.status(200).json({ ok: true, event: name });
}

function grant(entity: SubscriptionEntity | undefined, subscriptionId: string): Entitlement {
  // Trust Razorpay's own period end, plus a grace window so a renewal charge
  // that lands a few hours late does not lock a paying user out.
  const periodEnd = entity?.current_end ? entity.current_end * 1000 : null;
  const chargeAt = entity?.charge_at ? entity.charge_at * 1000 : null;
  const base = periodEnd ?? chargeAt ?? Date.now() + THIRTY_DAYS_MS;
  return {
    subscriptionId,
    active: true,
    expiresAt: base + RENEWAL_GRACE_MS,
  };
}

/** Constant-time compare: a plain `===` leaks timing information. */
function signatureMatches(raw: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sig = Buffer.from(signature, 'utf8');
  const exp = Buffer.from(expected, 'utf8');
  return sig.length === exp.length && crypto.timingSafeEqual(sig, exp);
}

/**
 * Gets the exact bytes Razorpay signed. Hosts differ: Vercel exposes
 * `req.rawBody` once the parser is off, Express needs a raw body parser
 * matching every content type, and a bare Node server is a stream.
 */
async function rawBody(req: ApiRequest): Promise<Buffer | null> {
  if (req.rawBody !== undefined) {
    return typeof req.rawBody === 'string'
      ? Buffer.from(req.rawBody, 'utf8')
      : req.rawBody;
  }
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');

  const stream = req as unknown as AsyncIterable<Buffer> & { [Symbol.asyncIterator]?: unknown };
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  return null;
}
