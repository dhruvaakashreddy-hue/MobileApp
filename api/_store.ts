/**
 * Entitlement store backed by Upstash Redis over its REST API.
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
  await command(['SET', subKey(entitlement.subscriptionId), userId]);
}

export async function userIdForSubscription(
  subscriptionId: string,
): Promise<string | null> {
  const result = await command(['GET', subKey(subscriptionId)]);
  return typeof result === 'string' ? result : null;
}

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
