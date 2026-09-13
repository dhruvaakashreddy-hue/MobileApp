/**
 * POST /create-subscription
 *
 * Creates a Razorpay subscription for the ₹99/month plan and hands the app back
 * a hosted checkout URL. The key secret stays here, server-side; the app never
 * sees it.
 *
 * TODO: not wired up. Set the environment variables listed in api/README.md and
 * replace the in-memory store before deploying.
 */

import { subscriptions } from './_store';

interface Req {
  method?: string;
  body?: { deviceId?: string };
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const planId = process.env.RAZORPAY_PLAN_ID;

  if (!keyId || !keySecret || !planId) {
    res.status(500).json({
      error: 'Razorpay is not configured. See api/README.md.',
    });
    return;
  }

  const deviceId = req.body?.deviceId;
  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
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
        // UPI Autopay / eNACH mandates run monthly; 120 keeps the mandate
        // alive for ten years, which is effectively "until cancelled".
        total_count: 120,
        customer_notify: 1,
        // Lets the webhook tie a payment back to the device that started it.
        notes: { deviceId },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      res.status(502).json({ error: 'Razorpay rejected the request', detail });
      return;
    }

    const sub = (await response.json()) as {
      id: string;
      short_url: string;
      status: string;
    };

    subscriptions.set(deviceId, {
      subscriptionId: sub.id,
      active: false, // only the verified webhook may flip this to true
      expiresAt: null,
    });

    res.status(200).json({ subscriptionId: sub.id, shortUrl: sub.short_url });
  } catch (err) {
    res.status(500).json({ error: 'Could not reach Razorpay', detail: String(err) });
  }
}
