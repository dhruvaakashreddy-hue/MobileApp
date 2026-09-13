/**
 * GET /subscription-status?deviceId=...
 *
 * The app's source of truth for entitlement. Only the webhook writes here.
 *
 * TODO: this is unauthenticated — anyone who guesses a device id can read its
 * status. Before production, sign the device id at install time and require
 * that token here.
 */

import { subscriptions } from './_store';

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default function handler(req: Req, res: Res): void {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const deviceId = req.query?.deviceId;
  if (typeof deviceId !== 'string') {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }

  const record = subscriptions.get(deviceId);
  const active =
    !!record?.active && !!record.expiresAt && record.expiresAt > Date.now();

  res.status(200).json({
    active,
    expiresAt: active ? record!.expiresAt : null,
    subscriptionId: record?.subscriptionId ?? null,
  });
}
