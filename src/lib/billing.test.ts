import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatExpiry, isPremiumActive } from './billing.ts';
import type { Premium } from './storage.ts';

/**
 * Entitlement is the thing standing between a user and an app they paid for,
 * so both directions matter: an expired subscription must stop working, and a
 * valid one must never be judged expired by accident.
 */
describe('isPremiumActive', () => {
  const now = 1_700_000_000_000;
  const active: Premium = {
    active: true,
    expiresAt: now + 86_400_000,
    subscriptionId: 'sub_123',
  };

  it('accepts a subscription that has not expired', () => {
    assert.equal(isPremiumActive(active, now), true);
  });

  it('rejects one whose expiry has passed', () => {
    assert.equal(isPremiumActive({ ...active, expiresAt: now - 1 }, now), false);
  });

  it('rejects the exact moment of expiry rather than granting a free tick', () => {
    assert.equal(isPremiumActive({ ...active, expiresAt: now }, now), false);
  });

  it('rejects an active flag with no expiry — a half-written record', () => {
    assert.equal(isPremiumActive({ ...active, expiresAt: null }, now), false);
  });

  it('rejects a future expiry once the flag is off (cancelled mid-cycle)', () => {
    assert.equal(isPremiumActive({ ...active, active: false }, now), false);
  });
});

describe('formatExpiry', () => {
  it('returns null when there is nothing to show', () => {
    assert.equal(
      formatExpiry({ active: false, expiresAt: null, subscriptionId: null }),
      null,
    );
  });

  it('formats a real expiry', () => {
    const out = formatExpiry({
      active: true,
      expiresAt: Date.UTC(2026, 0, 15, 12),
      subscriptionId: 'sub_1',
    });
    assert.match(String(out), /2026/);
  });
});
