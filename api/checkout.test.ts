import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import handler from './checkout.ts';
import { entitlementStore } from './_store.ts';
import type { ApiRequest, ApiResponse } from './_http.ts';

/**
 * The checkout page echoes a subscription id from the query string into a
 * page, so the shape check on that id is what stands between this endpoint and
 * a script injection. It is also the page that decides where the customer is
 * sent afterwards, so the deep link back into the app is pinned here too.
 */

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test-secret';
process.env.RAZORPAY_PLAN_ID = 'plan_test';

function fakeRes(): { res: ApiResponse; out: { code: number | null; html: string } } {
  const out = { code: null as number | null, html: '' };
  const res: ApiResponse = {
    status(code) {
      out.code = code;
      return res;
    },
    json(body) {
      out.html = String(body);
    },
    setHeader() {},
    send(body) {
      out.html = body;
    },
  };
  return { res, out };
}

function get(query: Record<string, string>): ApiRequest {
  return { method: 'GET', headers: {}, query };
}

describe('checkout page', () => {
  before(async () => {
    await entitlementStore().set('subscriber-1', {
      subscriptionId: 'sub_known123',
      active: false,
      expiresAt: null,
    });
  });

  it('refuses a subscription id carrying markup', async () => {
    const { res, out } = fakeRes();
    await handler(get({ subscriptionId: 'sub_x"></script><script>alert(1)</script>' }), res);
    assert.equal(out.code, 400);
    assert.ok(!out.html.includes('alert(1)'), 'injected script must not be echoed');
  });

  it('refuses an id that is not a Razorpay subscription id', async () => {
    for (const bad of ['', 'order_123', 'sub_', '../../etc/passwd']) {
      const { res, out } = fakeRes();
      await handler(get({ subscriptionId: bad }), res);
      assert.equal(out.code, 400, `should have rejected ${JSON.stringify(bad)}`);
    }
  });

  it('serves checkout for a subscription it issued', async () => {
    const { res, out } = fakeRes();
    await handler(get({ subscriptionId: 'sub_known123', contact: '+919876543210' }), res);

    assert.equal(out.code, 200);
    assert.ok(out.html.includes('checkout.razorpay.com'), 'loads Razorpay Checkout');
    assert.ok(out.html.includes('sub_known123'), 'passes the subscription through');
    assert.ok(out.html.includes('rzp_test_key'), 'uses the publishable key id');
    assert.ok(!out.html.includes('test-secret'), 'NEVER ships the key secret');
    assert.ok(out.html.includes('nudgeapp://payment-success'), 'returns to the app');
  });

  it('escapes a prefilled name rather than letting it become script', async () => {
    const { res, out } = fakeRes();
    await handler(
      get({ subscriptionId: 'sub_known123', name: '"</script><script>alert(1)//' }),
      res,
    );
    assert.equal(out.code, 200);
    assert.ok(
      !out.html.includes('</script><script>alert(1)'),
      'prefill must not break out of the script block',
    );
  });
});
