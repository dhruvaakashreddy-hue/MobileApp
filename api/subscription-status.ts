/**
 * GET /api/subscription-status?userId=...
 *
 * The app's source of truth for entitlement. Only the webhook writes it.
 *
 * ⚠️ UNAUTHENTICATED. Anyone who knows a userId can read its status. That is a
 * privacy leak, not a paywall bypass — nothing here grants access. Fix it with
 * the same verified token as create-subscription once real auth lands.
 */

/**
 * Entitlement store.
 *
 * Backed by Upstash Redis over its REST API. Two reasons for REST rather than a
 * client library: every function in api/ is a separate lambda with its own
 * memory, so the store has to be external; and REST needs no dependency and no
 * connection pooling, which is what you want in a serverless function that may
 * cold-start on every request.
 *
 * Keyed by USER id, not device id. A subscription belongs to the account that
 * paid for it — keying on the device loses it on reinstall or a new phone,
 * which becomes a refund request.
 */

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
const eventKey = (eventId: string) => `rzp:event:${eventId}`;
const subKey = (subscriptionId: string) => `rzp:sub:${subscriptionId}`;

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

export async function setEntitlement(
  userId: string,
  entitlement: Entitlement,
): Promise<void> {
  await command(['SET', entKey(userId), JSON.stringify(entitlement)]);
  // Reverse index: webhook events that arrive without notes can still be
  // matched back to a user via the subscription id.
  await command(['SET', subKey(entitlement.subscriptionId), userId]);
}

export async function userIdForSubscription(
  subscriptionId: string,
): Promise<string | null> {
  const result = await command(['GET', subKey(subscriptionId)]);
  return typeof result === 'string' ? result : null;
}

/**
 * Idempotency guard. Razorpay retries on any non-2xx and can deliver the same
 * event more than once even on success, so every event is claimed exactly once.
 * Returns true if this is the first time we've seen the id.
 *
 * SET .. NX is atomic, so two concurrent deliveries cannot both win.
 */
export async function claimEvent(eventId: string): Promise<boolean> {
  const result = await command([
    'SET',
    eventKey(eventId),
    '1',
    'NX',
    'EX',
    60 * 60 * 24 * 7,
  ]);
  return result === 'OK';
}

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
  if (!storeIsConfigured()) {
    return json({ error: 'Store is not configured' }, 500);
  }

  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return json({ error: 'userId is required' }, 400);

  let record;
  try {
    record = await getEntitlement(userId);
  } catch (err) {
    // Fail closed on the flag, but say so, so the client can keep trusting its
    // last known good state rather than locking a paying user out on a blip.
    return json({ error: 'Store unavailable', detail: String(err) }, 503);
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
