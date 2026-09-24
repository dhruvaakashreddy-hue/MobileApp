/**
 * POST /api/webhook
 *
 * Razorpay webhook handler for managing active entitlements.
 */

import crypto from 'node:crypto';

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  expiresAt: number | null;
}

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
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

async function command(args: (string | number)[]): Promise<unknown> {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error('Redis configuration missing');
  }
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Redis error HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis command failed: ${body.error}`);
  return body.result;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !REST_URL || !REST_TOKEN) {
      return json({ error: 'Server parameters not configured' }, 500);
    }

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
    if (eventId) {
      const claimed = await command(['SET', `rzp:event:${eventId}`, '1', 'NX', 'EX', 604800]);
      if (claimed !== 'OK') return json({ ok: true, duplicate: true }, 200);
    }

    const entity = event.payload?.subscription?.entity;
    const subscriptionId = entity?.id;
    if (!subscriptionId) return json({ ok: true, ignored: 'no subscription id' }, 200);

    let userId = entity?.notes?.userId;
    if (!userId) {
      const stored = await command(['GET', `rzp:sub:${subscriptionId}`]);
      if (typeof stored === 'string') userId = stored;
    }

    if (!userId) return json({ ok: true, ignored: 'no userId for subscription' }, 200);

    switch (event.event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const periodEnd = entity.current_end
          ? entity.current_end * 1000
          : Date.now() + 30 * 24 * 60 * 60 * 1000;
        const entitlement: Entitlement = {
          subscriptionId,
          active: true,
          expiresAt: periodEnd + RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000,
        };
        await command(['SET', `entitlement:${userId}`, JSON.stringify(entitlement)]);
        await command(['SET', `rzp:sub:${subscriptionId}`, userId]);
        break;
      }
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.completed': {
        const entitlement: Entitlement = { subscriptionId, active: false, expiresAt: null };
        await command(['SET', `entitlement:${userId}`, JSON.stringify(entitlement)]);
        break;
      }
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: 'Internal server error', detail: String(err) }, 500);
  }
}

export function GET(): Response {
  return json({ error: 'Method not allowed' }, 405);
}
