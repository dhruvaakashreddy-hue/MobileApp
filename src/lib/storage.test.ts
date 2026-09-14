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
