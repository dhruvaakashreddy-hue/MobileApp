/**
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
