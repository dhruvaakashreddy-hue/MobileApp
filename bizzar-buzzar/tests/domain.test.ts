import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REVEAL_LEAD_MS } from '../shared/constants.ts';
import { formatMoney, parseRupeesToPaise } from '../shared/money.ts';
import { marginFor, priceCheckout, savingsFor } from '../shared/pricing.ts';
import { resolveDropPhase, resolveSessionState } from '../shared/phase.ts';
import { validateSessionSchedule, type PlannedDrop } from '../shared/schedule.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 25, 13, 30); // 19:00 IST
const INR = { currency: 'INR', locale: 'en-IN' };

function phaseAt(offsetMs: number, extra: Partial<Parameters<typeof resolveDropPhase>[0]> = {}) {
  return resolveDropPhase({
    nowMs: T0 + offsetMs,
    releaseMs: T0,
    closesMs: T0 + 5 * MIN,
    quantity: 1,
    soldUnits: 0,
    dropStatus: 'scheduled',
    sessionPaused: false,
    ...extra,
  });
}

describe('money', () => {
  it('formats sample prices in INR with Indian grouping', () => {
    assert.equal(formatMoney(149_900, INR), '₹1,499');
    assert.equal(formatMoney(499_900, INR), '₹4,999');
  });

  it('keeps paise when they exist', () => {
    assert.equal(formatMoney(149_950, INR), '₹1,499.50');
  });

  it('parses rupee input into integer paise and rejects malformed input', () => {
    assert.equal(parseRupeesToPaise('1499'), 149_900);
    assert.equal(parseRupeesToPaise('1499.5'), 149_950);
    assert.equal(parseRupeesToPaise('1,499'), null);
    assert.equal(parseRupeesToPaise('12.345'), null);
  });
});

describe('pricing', () => {
  it('computes the checkout total from the authoritative sale price and delivery fee', () => {
    assert.deepEqual(priceCheckout({ salePaise: 149_900, shippingFeePaise: 4_900, quantity: 1 }), {
      currency: 'INR',
      itemPaise: 149_900,
      shippingPaise: 4_900,
      totalPaise: 154_800,
    });
  });

  it('reports the sample saving of ₹3,500 (70%) against the ₹4,999 reference', () => {
    assert.deepEqual(savingsFor(499_900, 149_900), { savingsPaise: 350_000, percent: 70 });
  });

  it('shows no savings without an evidenced reference price', () => {
    assert.equal(savingsFor(null, 149_900), null);
    assert.equal(savingsFor(100_000, 149_900), null);
  });

  it('treats any missing cost as incomplete rather than zero', () => {
    const complete = marginFor({
      totalPaise: 154_800,
      refundedPaise: 0,
      procurementPaise: 90_000,
      shippingCostPaise: 4_000,
      otherCostPaise: 0,
      paymentFeePaise: 3_000,
    });
    assert.deepEqual(complete, { status: 'complete', marginPaise: 57_800 });

    const missing = marginFor({
      totalPaise: 154_800,
      refundedPaise: 0,
      procurementPaise: null,
      shippingCostPaise: 4_000,
      otherCostPaise: 0,
      paymentFeePaise: null,
    });
    assert.deepEqual(missing, { status: 'incomplete', missing: ['procurement', 'payment_fee'] });
  });

  it('subtracts refunds from margin', () => {
    const result = marginFor({
      totalPaise: 100_000,
      refundedPaise: 20_000,
      procurementPaise: 50_000,
      shippingCostPaise: 0,
      otherCostPaise: 0,
      paymentFeePaise: 0,
    });
    assert.deepEqual(result, { status: 'complete', marginPaise: 30_000 });
  });
});

describe('drop phase (server clock only)', () => {
  it('is waiting until 30 seconds before release', () => {
    assert.equal(phaseAt(-REVEAL_LEAD_MS - 1), 'waiting');
    assert.equal(phaseAt(-REVEAL_LEAD_MS - 60 * 1000), 'waiting');
  });

  it('enters the reveal countdown exactly 30 seconds before release', () => {
    assert.equal(phaseAt(-REVEAL_LEAD_MS), 'reveal');
    assert.equal(phaseAt(-1), 'reveal');
  });

  it('is live from release until the sale closes', () => {
    assert.equal(phaseAt(0), 'live');
    assert.equal(phaseAt(5 * MIN - 1), 'live');
  });

  it('ends at the close time when unsold, and never reopens', () => {
    assert.equal(phaseAt(5 * MIN), 'ended');
    assert.equal(phaseAt(60 * MIN), 'ended');
  });

  it('is sold as soon as the unit is paid for, even before close', () => {
    assert.equal(phaseAt(2 * MIN, { soldUnits: 1 }), 'sold');
  });

  it('pauses for a paused drop or a paused session', () => {
    assert.equal(phaseAt(MIN, { dropStatus: 'paused' }), 'paused');
    assert.equal(phaseAt(MIN, { sessionPaused: true }), 'paused');
  });

  it('is waiting when the drop has no schedule yet', () => {
    assert.equal(
      resolveDropPhase({
        nowMs: T0,
        releaseMs: null,
        closesMs: null,
        quantity: 1,
        soldUnits: 0,
        dropStatus: 'draft',
        sessionPaused: false,
      }),
      'waiting',
    );
  });
});

describe('session state', () => {
  const session = { status: 'scheduled' as const, opensMs: T0, closesMs: T0 + 120 * MIN };

  it('moves through upcoming, open and ended by the server clock', () => {
    assert.equal(resolveSessionState(session, T0 - 1), 'upcoming');
    assert.equal(resolveSessionState(session, T0), 'open');
    assert.equal(resolveSessionState(session, T0 + 120 * MIN), 'ended');
  });

  it('reports paused regardless of time', () => {
    assert.equal(resolveSessionState({ ...session, status: 'paused' }, T0 + MIN), 'paused');
  });
});

describe('session schedule validation', () => {
  const window = { opensMs: T0, closesMs: T0 + 120 * MIN };
  const drop = (id: string, releaseOffsetMin: number, durationMin = 5): PlannedDrop => ({
    id,
    releaseMs: T0 + releaseOffsetMin * MIN,
    closesMs: T0 + (releaseOffsetMin + durationMin) * MIN,
  });
  const codes = (drops: PlannedDrop[]) => validateSessionSchedule(window, drops).map((issue) => issue.code);

  it('accepts releases 5 and 30 minutes apart, with sale windows that end before the next release', () => {
    assert.deepEqual(codes([drop('a', 0), drop('b', 5), drop('c', 35, 4)]), []);
  });

  it('rejects consecutive releases closer than 5 minutes', () => {
    assert.deepEqual(codes([drop('a', 0), drop('b', 4)]), ['gap_too_short', 'sale_overlaps_next_release']);
  });

  it('rejects consecutive releases further apart than 30 minutes', () => {
    assert.deepEqual(codes([drop('a', 0, 5), drop('b', 31)]), ['gap_too_long']);
  });

  it('accepts a sale that closes exactly as the next drop releases', () => {
    assert.deepEqual(codes([drop('a', 0, 10), drop('b', 10)]), []);
  });

  it('rejects a sale that would still be open when the next drop releases', () => {
    assert.deepEqual(codes([drop('a', 0, 11), drop('b', 10)]), ['sale_overlaps_next_release']);
  });

  it('rejects drops outside the session window and sales that close before they open', () => {
    assert.deepEqual(codes([drop('late', 119, 5)]), ['outside_session_window']);
    assert.deepEqual(
      validateSessionSchedule(window, [{ id: 'x', releaseMs: T0 + 10 * MIN, closesMs: T0 + 9 * MIN }]).map((i) => i.code),
      ['sale_window_invalid'],
    );
  });
});
