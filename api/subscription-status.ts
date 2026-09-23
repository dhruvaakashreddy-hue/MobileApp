/**
 * GET /api/subscription-status?userId=...
 *
 * The app's source of truth for entitlement. Only the webhook writes it.
 *
 * ⚠️ UNAUTHENTICATED. Anyone who knows a userId can read its status. That is a
 * privacy leak, not a paywall bypass — nothing here grants access. Fix it with
 * the same verified token as create-subscription once real auth lands.
 */

import { getEntitlement, storeIsConfigured } from './_store.js';

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