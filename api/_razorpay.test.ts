import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expiryFrom, grantsAccess, RENEWAL_GRACE_MS } from './_razorpay.ts';
import type { RazorpaySubscription } from './_razorpay.ts';

/**
 * How a Razorpay subscription status becomes an expiry date the app enforces.
 * Getting this wrong either locks out someone who has paid or keeps serving
 * someone who has not.
 */

function sub(over: Partial<RazorpaySubscription>): RazorpaySubscription {
  return {
    id: 'sub_1',
    status: 'active',
    short_url: 'https://rzp.io/x',
    ...over,
  };
}

describe('grantsAccess', () => {
  it('grants on the states where money has actually moved', () => {
    assert.equal(grantsAccess('active'), true);
    // The mandate is approved and the first charge is in flight — locking the
    // customer out here is the most common "I paid and it didn't work".
    assert.equal(grantsAccess('authenticated'), true);
  });

  it('refuses every state where it has not', () => {
    for (const status of [
      'created', 'pending', 'halted', 'cancelled', 'completed', 'expired',
    ] as const) {
      assert.equal(grantsAccess(status), false, `${status} must not grant access`);
    }
  });
});

describe('expiryFrom', () => {
  it('uses the paid period end plus the renewal grace window', () => {
    const end = Math.floor(Date.UTC(2026, 0, 31) / 1000);
    assert.equal(expiryFrom(sub({ current_end: end })), end * 1000 + RENEWAL_GRACE_MS);
  });

  it('falls back to the next charge date when the period end is missing', () => {
    const charge = Math.floor(Date.UTC(2026, 1, 15) / 1000);
    assert.equal(
      expiryFrom(sub({ current_end: null, charge_at: charge })),
      charge * 1000 + RENEWAL_GRACE_MS,
    );
  });

  it('still grants a full cycle when Razorpay sends neither date', () => {
    const out = expiryFrom(sub({}));
    assert.ok(out > Date.now() + 29 * 86_400_000, 'must not expire immediately');
  });
});
