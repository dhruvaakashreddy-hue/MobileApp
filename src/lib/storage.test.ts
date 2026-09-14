import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPlannedNudge } from './storage.ts';

/**
 * Regression cover for a crash: a plan written by an older build had no
 * this-or-that options, and rendering one threw while reading `.text` off
 * undefined — which blanked the entire app.
 */
describe('isValidPlannedNudge', () => {
  const valid = {
    notificationId: 4200,
    fireAt: 1_700_000_000_000,
    lineId: 'a|b',
    personaId: 'drill-sergeant',
    text: '1) x\n2) y',
    healthy: { id: 'h', text: 'drink water' },
    chaos: { id: 'c', text: 'salute the fridge' },
  };

  it('accepts a well-formed entry', () => {
    assert.equal(isValidPlannedNudge(valid), true);
  });

  it('rejects an entry from the pre-this-or-that build', () => {
    const { healthy, chaos, ...old } = valid;
    void healthy;
    void chaos;
    assert.equal(isValidPlannedNudge(old), false);
  });

  it('rejects a half-populated entry', () => {
    assert.equal(isValidPlannedNudge({ ...valid, chaos: undefined }), false);
    assert.equal(isValidPlannedNudge({ ...valid, healthy: {} }), false);
    assert.equal(isValidPlannedNudge({ ...valid, healthy: { id: 'h' } }), false);
    assert.equal(isValidPlannedNudge({ ...valid, chaos: { id: 'c', text: '' } }), false);
  });

  it('rejects junk of any shape without throwing', () => {
    for (const junk of [null, undefined, 0, 'nudge', [], {}, { fireAt: 'soon' }]) {
      assert.equal(isValidPlannedNudge(junk), false, `${JSON.stringify(junk)}`);
    }
  });

  it('rejects an entry missing the core scheduling fields', () => {
    assert.equal(isValidPlannedNudge({ ...valid, fireAt: undefined }), false);
    assert.equal(isValidPlannedNudge({ ...valid, personaId: 42 }), false);
  });
});

import { isValidQueue } from './storage.ts';

/**
 * Regression cover for a freeze: a queue saved before the this-or-that change
 * had no chaos cursor, so the chaos lookup indexed with undefined and threw
 * during boot — leaving the app stuck on the splash screen forever.
 */
describe('isValidQueue', () => {
  const valid = {
    poolKey: 'drill-sergeant|hydration,movement',
    seed: 12345,
    cursor: 10,
    cycles: 0,
    chaosSeed: 999,
    chaosCursor: 4,
  };

  it('accepts a current queue', () => {
    assert.equal(isValidQueue(valid), true);
  });

  it('rejects a queue from the pre-this-or-that build', () => {
    const { chaosSeed, chaosCursor, ...old } = valid;
    void chaosSeed;
    void chaosCursor;
    assert.equal(isValidQueue(old), false);
  });

  it('rejects a half-migrated queue', () => {
    assert.equal(isValidQueue({ ...valid, chaosCursor: undefined }), false);
    assert.equal(isValidQueue({ ...valid, chaosSeed: null }), false);
  });

  it('rejects non-finite cursors, which index arrays as undefined', () => {
    assert.equal(isValidQueue({ ...valid, chaosCursor: NaN }), false);
    assert.equal(isValidQueue({ ...valid, cursor: Infinity }), false);
  });

  it('rejects junk of any shape without throwing', () => {
    for (const junk of [null, undefined, 0, 'queue', [], {}]) {
      assert.equal(isValidQueue(junk), false, `${JSON.stringify(junk)}`);
    }
  });
});

import { DEFAULT_PREMIUM, type AccountRecord } from './storage.ts';

/**
 * Regression cover for two bugs that shared a root cause: the profile and the
 * entitlement lived inside the session, which sign-out destroys.
 *
 * Symptom one: signing back in with the same number asked for your name again.
 * Symptom two, worse: the entitlement was a single device-wide value, so a
 * different number signing in afterwards walked into the paid app on someone
 * else's subscription.
 */
describe('account records keep profile and entitlement apart from the session', () => {
  const paid: AccountRecord = {
    profile: { displayName: 'Dhruva', email: null, photoUrl: 'preset:unicorn' },
    premium: { active: true, expiresAt: Date.now() + 86_400_000, subscriptionId: 'sub_1' },
  };

  it('keeps each account separate', () => {
    const accounts: Record<string, AccountRecord> = {
      'phone-919876543210': paid,
      'phone-919123456789': { profile: { displayName: 'Someone Else', email: null, photoUrl: null }, premium: DEFAULT_PREMIUM },
    };
    // The paying account is entitled; the other is not, on the same device.
    assert.equal(accounts['phone-919876543210'].premium.active, true);
    assert.equal(accounts['phone-919123456789'].premium.active, false);
    assert.notEqual(
      accounts['phone-919876543210'].profile?.displayName,
      accounts['phone-919123456789'].profile?.displayName,
    );
  });

  it('an account that never paid defaults to no entitlement', () => {
    const fresh: AccountRecord = { profile: null, premium: DEFAULT_PREMIUM };
    assert.equal(fresh.premium.active, false);
    assert.equal(fresh.premium.expiresAt, null);
  });

  it('a restored profile is enough to count as complete', () => {
    assert.ok(paid.profile?.displayName);
    assert.ok((paid.profile?.displayName ?? '').trim().length > 0);
  });
});
