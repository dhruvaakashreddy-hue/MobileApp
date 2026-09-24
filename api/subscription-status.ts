/**
 * GET /api/subscription-status?userId=...
 *
 * Checks entitlement status safely without external module dependencies.
 */

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  expiresAt: number | null;
}

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Graceful fallback if Upstash Redis credentials are not configured in Vercel
    if (!REST_URL || !REST_TOKEN) {
      return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
    }

    const requestUrl = new URL(request.url);
    const userId = requestUrl.searchParams.get('userId');

    if (!userId) {
      return json({ error: 'userId is required' }, 400);
    }

    const res = await fetch(REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', `entitlement:${userId}`]),
    });

    if (!res.ok) {
      return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
    }

    const data = (await res.json()) as { result?: string; error?: string };
    if (data.error || !data.result) {
      return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
    }

    const record = JSON.parse(data.result) as Entitlement;
    const active =
      !!record?.active && !!record.expiresAt && record.expiresAt > Date.now();

    return json(
      {
        active,
        expiresAt: active ? record.expiresAt : null,
        subscriptionId: record?.subscriptionId ?? null,
      },
      200,
    );
  } catch {
    // Ensures the route always returns HTTP 200 with fallback data instead of crashing
    return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
  }
}
