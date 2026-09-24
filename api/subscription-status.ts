/**
 * GET /api/subscription-status?userId=...
 *
 * Source of truth for app entitlement status.
 */

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  expiresAt: number | null;
}

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function storeIsConfigured(): boolean {
  return !!REST_URL && !!REST_TOKEN;
}

async function command(args: (string | number)[]): Promise<unknown> {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error('Redis env variables are not set');
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
    throw new Error(`Redis HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result;
}

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
    if (!storeIsConfigured()) {
      // Safe fallback if Redis isn't set up yet
      return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return json({ error: 'userId is required' }, 400);
    }

    const result = await command(['GET', `entitlement:${userId}`]);
    let record: Entitlement | null = null;

    if (typeof result === 'string') {
      try {
        record = JSON.parse(result) as Entitlement;
      } catch {
        record = null;
      }
    }

    const active =
      !!record?.active && !!record.expiresAt && record.expiresAt > Date.now();

    return json(
      {
        active,
        expiresAt: active ? record!.expiresAt : null,
        subscriptionId: record?.subscriptionId ?? null,
      },
      200,
    );
  } catch (err) {
    // Catch-all to prevent Vercel Function Invocation Errors
    return json({ active: false, expiresAt: null, subscriptionId: null, detail: String(err) }, 200);
  }
}
