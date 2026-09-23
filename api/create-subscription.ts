/**
 * POST /api/create-subscription
 *
 * Creates a Razorpay subscription for the monthly plan and hands the app back a
 * hosted checkout URL. The key secret stays here, server-side; the app never
 * sees it.
 *
 * ⚠️ UNAUTHENTICATED. Anyone can POST any userId and get a checkout link for
 * it. That is tolerable only while auth is a stub, because the worst case is a
 * stranger paying for someone else's account. Once real auth lands, require a
 * verified token here and take the userId from the token, never from the body.
 */

import { setEntitlement, storeIsConfigured } from './_store.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const planId = process.env.RAZORPAY_PLAN_ID;

  if (!keyId || !keySecret || !planId) {
    return json({ error: 'Razorpay is not configured. See api/README.md.' }, 500);
  }
  if (!storeIsConfigured()) {
    return json({ error: 'Store is not configured. See api/README.md.' }, 500);
  }

  let userId: string | undefined;
  try {
    const body = (await request.json()) as { userId?: string };
    userId = body.userId;
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  if (!userId || typeof userId !== 'string' || userId.length > 128) {
    return json({ error: 'userId is required' }, 400);
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const response = await fetch(`${RAZORPAY_API}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: planId,
        // UPI Autopay / eNACH mandates run monthly; 120 keeps the mandate alive
        // for ten years, which is effectively "until cancelled".
        total_count: 120,
        customer_notify: 1,
        // Lets the webhook tie a charge back to the account that started it.
        notes: { userId },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: 'Razorpay rejected the request', detail }, 502);
    }

    const sub = (await response.json()) as {
      id: string;
      short_url: string;
      status: string;
    };

    // Recorded inactive. Only the signature-verified webhook may flip this.
    await setEntitlement(userId, {
      subscriptionId: sub.id,
      active: false,
      expiresAt: null,
    });

    return json({ subscriptionId: sub.id, shortUrl: sub.short_url }, 200);
  } catch (err) {
    return json({ error: 'Could not reach Razorpay', detail: String(err) }, 500);
  }
}

export function GET(): Response {
  return json({ error: 'Method not allowed' }, 405);
}