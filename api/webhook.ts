/**
 * POST /webhook
 *
 * Razorpay calls this when a subscription is charged, halted or cancelled.
 * This is the ONLY place entitlement may be granted: the deep link back into
 * the app is just a UI hint and can be forged by anyone.
 *
 * TODO: not wired up. See api/README.md.
 */

import crypto from 'node:crypto';
import { subscriptions } from './_store';

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  /** MUST be the raw, unparsed body — see the note below. */
  rawBody?: string | Buffer;
  body?: unknown;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

/**
 * On Vercel, disable the default body parser for this route so `rawBody` is
 * available — the signature is computed over the exact bytes Razorpay sent, and
 * re-serialising a parsed object will not reproduce them.
 */
export const config = { api: { bodyParser: false } };

const RENEWAL_GRACE_DAYS = 3;

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not set' });
    return;
  }

  const signature = req.headers['x-razorpay-signature'];
  const raw = req.rawBody;
  if (typeof signature !== 'string' || raw === undefined) {
    res.status(400).json({ error: 'Missing signature or raw body' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw)
    .digest('hex');

  // Constant-time compare: a plain === leaks timing information.
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let event: {
    event: string;
    payload?: {
      subscription?: {
        entity?: {
          id?: string;
          notes?: { deviceId?: string };
          current_end?: number; // seconds since epoch
        };
      };
    };
  };
  try {
    event = JSON.parse(raw.toString());
  } catch {
    res.status(400).json({ error: 'Body is not valid JSON' });
    return;
  }

  const entity = event.payload?.subscription?.entity;
  const deviceId = entity?.notes?.deviceId;
  const subscriptionId = entity?.id;

  if (!deviceId || !subscriptionId) {
    // Acknowledge anyway: a non-2xx makes Razorpay retry an event we can do
    // nothing with.
    res.status(200).json({ ok: true, ignored: 'no deviceId in notes' });
    return;
  }

  switch (event.event) {
    case 'subscription.charged':
    case 'subscription.activated': {
      // Trust Razorpay's own period end, plus a small grace window so a slow
      // renewal charge doesn't briefly lock a paying user out.
      const periodEnd = entity.current_end
        ? entity.current_end * 1000
        : Date.now() + 30 * 24 * 60 * 60 * 1000;
      subscriptions.set(deviceId, {
        subscriptionId,
        active: true,
        expiresAt: periodEnd + RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000,
      });
      break;
    }
    case 'subscription.halted':
    case 'subscription.cancelled':
    case 'subscription.completed': {
      subscriptions.set(deviceId, {
        subscriptionId,
        active: false,
        expiresAt: null,
      });
      break;
    }
    default:
      break; // other events are not interesting to us
  }

  res.status(200).json({ ok: true });
}
