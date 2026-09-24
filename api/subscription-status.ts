/**
 * GET /api/subscription-status?userId=...
 *
 * Safe, zero-dependency entitlement check function.
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
    throw new Error('Upstash Redis environment variables are not set');
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
    throw new Error(`Redis command failed with status ${res.status}`);
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
    // If Redis credentials are not configured, return safe fallback status
    if (!storeIsConfigured()) {
      return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
    }

    const userId = new URL(request.url).searchParams.get('userId');
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
    // Prevent function invocation crashes by returning a fallback response
    return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
  }
}/**
 * GET /api/subscription-status?userId=...
 *
 * Source of truth for entitlement status.
 */

import { getEntitlement, storeIsConfigured } from './_store.js';

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
  if (!storeIsConfigured()) {
    return json({ active: false, expiresAt: null, subscriptionId: null }, 200);
  }

  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return json({ error: 'userId is required' }, 400);

  let record;
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
