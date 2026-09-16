import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from './webhook.ts';
import { entitlementStore } from './_store.ts';
import type { ApiRequest, ApiResponse } from './_http.ts';

/**
 * The webhook is the only thing in the system that may grant paid access, and
 * it is reachable by anyone on the internet. Both halves are tested here: that
 * a forged request cannot buy itself a subscription, and that a genuine one
 * grants exactly what was paid for.
 */

const SECRET = 'test-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

interface Captured {
  code: number | null;
  body: unknown;
}

function fakeRes(): { res: ApiResponse; out: Captured } {
  const out: Captured = { code: null, body: undefined };
  const res: ApiResponse = {
    status(code) {
      out.code = code;
      return res;
    },
    json(body) {
      out.body = body;
    },
    setHeader() {},
  };
  return { res, out };
}

function signedRequest(payload: unknown, secretUsed = SECRET): ApiRequest {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secretUsed).update(raw).digest('hex');
  return {
    method: 'POST',
    headers: { 'x-razorpay-signature': signature },
    rawBody: raw,
  };
}

function chargedEvent(subscriberId: string, currentEndSeconds: number) {
  return {
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: 'sub_test123',
          status: 'active',
          notes: { subscriberId },
          current_end: currentEndSeconds,
        },
      },
    },
  };
}

describe('webhook signature verification', () => {
  it('rejects a request signed with the wrong secret', async () => {
    const { res, out } = fakeRes();
    await handler(signedRequest(chargedEvent('nobody', 0), 'wrong-secret'), res);
    assert.equal(out.code, 401);
    assert.equal(await entitlementStore().get('nobody'), null);
  });

  it('rejects a request with no signature at all', async () => {
    const { res, out } = fakeRes();
    await handler(
      { method: 'POST', headers: {}, rawBody: JSON.stringify(chargedEvent('x', 0)) },
      res,
    );
    assert.equal(out.code, 400);
  });

  it('rejects a body altered after signing', async () => {
    const req = signedRequest(chargedEvent('victim', 0));
    // Same signature, different payload — the classic replay-with-edits attack.
    req.rawBody = JSON.stringify(chargedEvent('attacker', 9_999_999_999));
    const { res, out } = fakeRes();
    await handler(req, res);
    assert.equal(out.code, 401);
    assert.equal(await entitlementStore().get('attacker'), null);
  });

  it('rejects anything that is not a POST', async () => {
    const { res, out } = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(out.code, 405);
  });
});

describe('webhook entitlement transitions', () => {
  const subscriberId = 'phone-919876543210';

  beforeEach(async () => {
    await entitlementStore().set(subscriberId, {
      subscriptionId: 'sub_test123',
      active: false,
      expiresAt: null,
    });
  });

  it('grants access on a charge, through to the paid period end', async () => {
    const endSeconds = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const { res, out } = fakeRes();
    await handler(signedRequest(chargedEvent(subscriberId, endSeconds)), res);

    assert.equal(out.code, 200);
    const record = await entitlementStore().get(subscriberId);
    assert.equal(record?.active, true);
    // Period end plus the renewal grace window, so a late charge doesn't lock
    // a paying customer out.
    assert.ok(record!.expiresAt! >= endSeconds * 1000);
  });

  it('revokes access when the mandate is halted', async () => {
    await handler(
      signedRequest(chargedEvent(subscriberId, Math.floor(Date.now() / 1000) + 86_400)),
      fakeRes().res,
    );

    const halted = {
      event: 'subscription.halted',
      payload: {
        subscription: {
          entity: { id: 'sub_test123', notes: { subscriberId } },
        },
      },
    };
    const { res, out } = fakeRes();
    await handler(signedRequest(halted), res);

    assert.equal(out.code, 200);
    const record = await entitlementStore().get(subscriberId);
    assert.equal(record?.active, false);
    assert.equal(record?.expiresAt, null);
  });

  it('acknowledges an event it cannot attribute instead of failing it', async () => {
    // A non-2xx makes Razorpay retry for days; there is nothing to retry here.
    const orphan = {
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_unknown_xyz' } } },
    };
    const { res, out } = fakeRes();
    await handler(signedRequest(orphan), res);
    assert.equal(out.code, 200);
  });

  it('ignores events that say nothing about access', async () => {
    const pending = {
      event: 'subscription.pending',
      payload: {
        subscription: { entity: { id: 'sub_test123', notes: { subscriberId } } },
      },
    };
    await handler(signedRequest(pending), fakeRes().res);
    const record = await entitlementStore().get(subscriberId);
    assert.equal(record?.active, false);
  });
});
