/**
 * POST /api/webhook
 *
 * Razorpay webhook handler for processing subscription events.
 */

import crypto from 'node:crypto';
import {
  claimEvent,
  getEntitlement,
  setEntitlement,
  storeIsConfigured,
  userIdForSubscription,
} from './_store.js';

const RENEWAL_GRACE_DAYS = 3;

interface SubscriptionEntity {
  id?: string;
  notes?: { userId?: string };
  current_end?: number;
}

interface RazorpayEvent {
  event: string;
  payload?: { subscription?: { entity?: SubscriptionEntity } };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'RAZORPAY_WEBHOOK_SECRET is not set' }, 500);
  if (!storeIsConfigured()) return json({ error: 'Store is not configured' }, 500);

  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);

  const raw = await request.text();

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return json({ error: 'Body is not valid JSON' }, 400);
  }

  const eventId = request.headers.get('x-razorpay-event-id');
  if (eventId && !(await claimEvent(eventId))) {
    return json({ ok: true, duplicate: true }, 200);
  }

  const entity = event.payload?.subscription?.entity;
  const subscriptionId = entity?.id;
  if (!subscriptionId) {
    return json({ ok: true, ignored: 'no subscription id' }, 200);
  }

  const userId =
    entity?.notes?.userId ?? (await userIdForSubscription(subscriptionId));
  if (!userId) {
    return json({ ok: true, ignored: 'no userId for subscription' }, 200);
  }

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      const periodEnd = entity.current_end
        ? entity.current_end * 1000
        : Date.now() + 30 * 24 * 60 * 60 * 1000;
      await setEntitlement(userId, {
        subscriptionId,
        active: true,
        expiresAt: periodEnd + RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000,
      });
      break;
    }
    case 'subscription.halted':
    case 'subscription.cancelled':
    case 'subscription.completed': {
      await setEntitlement(userId, {
        subscriptionId,
        active: false,
        expiresAt: null,
      });
      break;
    }
    case 'subscription.pending': {
      await getEntitlement(userId);
      break;
    }
    default:
      break;
  }

  return json({ ok: true }, 200);
}

export function GET(): Response {
  return json({ error: 'Method not allowed' }, 405);
}
