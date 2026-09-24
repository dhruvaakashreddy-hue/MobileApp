/**
 * GET /api/subscription-status?userId=...
 *
 * The app's source of truth for entitlement. Only the webhook writes it.
 *
 * ⚠️ UNAUTHENTICATED. Anyone who knows a userId can read its status. That is a
 * privacy leak, not a paywall bypass — nothing here grants access. Fix it with
 * the same verified token as create-subscription once real auth lands.
 */

// ============================================================================
// ENTITLEMENT STORE (INLINED)
// ============================================================================

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  /** Epoch millis; null until the first successful charge. */
  expiresAt: number | null;
}

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function storeIsConfigured(): boolean {
  return !!REST_URL && !!REST_TOKEN;
}

async function command(args: (string | number)[]): Promise<unknown> {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set',
    );
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
    throw new Error(`Redis command failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result;
}

const entKey = (userId: string) => `entitlement:${userId}`;

export async function getEntitlement(
  userId: string,
): Promise<Entitlement | null> {
  const result = await command(['GET', entKey(userId)]);
  if (typeof result !== 'string') return null;
  try {
    return JSON.parse(result) as Entitlement;
  } catch {
    return null;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Entitlement changes the moment a webhook lands; a cached 200 would
      // keep a cancelled subscriber unlocked or a new one locked out.
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  // Safe fallback if Redis is not yet configured in environment variables
  if (!storeIsConfigured()) {
    return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
  }

  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return json({ error: 'userId is required' }, 400);

  let record: Entitlement | null = null;
  try {
    record = await getEntitlement(userId);
  } catch (err) {
    return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
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
}
