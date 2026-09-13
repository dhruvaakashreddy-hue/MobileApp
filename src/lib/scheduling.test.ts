import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextFireTime,
  formatCountdown,
  formatTimeLabel,
  isWithinActiveHours,
  minutesToTimeString,
  nextActiveWindowStart,
  pickLine,
  timeStringToMinutes,
} from './scheduling.ts';
import type { Persona } from '../types.ts';

/**
 * Run with `npm test`.
 *
 * These cover the scheduling maths only — the part with awkward edge cases
 * (overnight windows, a nudge landing at 3am) and no way to eyeball it.
 */

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m, 0, 0);

const WORK_DAY = { activeStart: 9 * 60, activeEnd: 21 * 60 };
const OVERNIGHT = { activeStart: 22 * 60, activeEnd: 6 * 60 };

describe('isWithinActiveHours', () => {
  it('handles a normal daytime window', () => {
    assert.equal(isWithinActiveHours(at(10), WORK_DAY.activeStart, WORK_DAY.activeEnd), true);
    assert.equal(isWithinActiveHours(at(3), WORK_DAY.activeStart, WORK_DAY.activeEnd), false);
  });

  it('treats start as inclusive and end as exclusive', () => {
    assert.equal(isWithinActiveHours(at(9), WORK_DAY.activeStart, WORK_DAY.activeEnd), true);
    assert.equal(isWithinActiveHours(at(21), WORK_DAY.activeStart, WORK_DAY.activeEnd), false);
  });

  it('handles a window that wraps past midnight', () => {
    assert.equal(isWithinActiveHours(at(23), OVERNIGHT.activeStart, OVERNIGHT.activeEnd), true);
    assert.equal(isWithinActiveHours(at(2), OVERNIGHT.activeStart, OVERNIGHT.activeEnd), true);
    assert.equal(isWithinActiveHours(at(12), OVERNIGHT.activeStart, OVERNIGHT.activeEnd), false);
  });

  it('treats start === end as all day, not never', () => {
    assert.equal(isWithinActiveHours(at(4), 600, 600), true);
  });
});

describe('nextActiveWindowStart', () => {
  it('moves an early-morning time to the same day opening', () => {
    const t = nextActiveWindowStart(at(3), WORK_DAY.activeStart, WORK_DAY.activeEnd);
    assert.equal(t.getHours(), 9);
    assert.equal(t.getDate(), 15);
  });

  it('moves a late-night time to the next day opening', () => {
    const t = nextActiveWindowStart(at(23), WORK_DAY.activeStart, WORK_DAY.activeEnd);
    assert.equal(t.getHours(), 9);
    assert.equal(t.getDate(), 16);
  });

  it('leaves a time already inside the window alone', () => {
    const t = nextActiveWindowStart(at(10, 30), WORK_DAY.activeStart, WORK_DAY.activeEnd);
    assert.equal(t.getHours(), 10);
    assert.equal(t.getMinutes(), 30);
  });
});

describe('computeNextFireTime', () => {
  const settings = { minMinutes: 15, maxMinutes: 120, ...WORK_DAY };

  it('always lands inside the active window and in the future', () => {
    for (let i = 0; i < 2000; i++) {
      const now = at(8 + (i % 14), i % 60);
      const next = computeNextFireTime(now, settings);
      assert.ok(next.getTime() > now.getTime(), 'must be in the future');
      assert.ok(
        isWithinActiveHours(next, settings.activeStart, settings.activeEnd),
        `landed outside active hours: ${next.toString()}`,
      );
    }
  });

  it('respects the min/max range when no push-forward is needed', () => {
    // From 10:00 every possible draw lands before 21:00, so the raw gap stands.
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      const now = at(10);
      const gap = (computeNextFireTime(now, settings).getTime() - now.getTime()) / 60_000;
      min = Math.min(min, gap);
      max = Math.max(max, gap);
    }
    assert.equal(min, 15);
    assert.equal(max, 120);
  });

  it('pushes an out-of-hours draw to the next window opening', () => {
    // 20:30 with a 15-120min range: most draws overflow past 21:00.
    const now = at(20, 30);
    let pushed = 0;
    for (let i = 0; i < 500; i++) {
      const t = computeNextFireTime(now, settings);
      if (t.getDate() === 16) {
        assert.equal(t.getHours(), 9);
        assert.equal(t.getMinutes(), 0);
        pushed++;
      }
    }
    assert.ok(pushed > 0, 'expected at least some draws to be pushed to tomorrow');
  });

  it('works for an overnight active window', () => {
    const overnight = { minMinutes: 30, maxMinutes: 90, ...OVERNIGHT };
    for (let i = 0; i < 1000; i++) {
      const next = computeNextFireTime(at(i % 24, i % 60), overnight);
      assert.ok(isWithinActiveHours(next, OVERNIGHT.activeStart, OVERNIGHT.activeEnd));
    }
  });
});

describe('pickLine', () => {
  const persona = {
    lines: [
      { id: 'a', text: 'a', category: 'posture' },
      { id: 'b', text: 'b', category: 'posture' },
      { id: 'c', text: 'c', category: 'work' },
    ],
  } as Persona;

  it('only picks from enabled categories', () => {
    for (let i = 0; i < 50; i++) {
      assert.equal(pickLine(persona, { categories: ['work'] }, null)?.id, 'c');
    }
  });

  it('returns null when every category is switched off', () => {
    assert.equal(pickLine(persona, { categories: ['social'] }, null), null);
  });

  it('never repeats the previous line', () => {
    for (let i = 0; i < 200; i++) {
      assert.notEqual(pickLine(persona, { categories: ['posture'] }, 'a')?.id, 'a');
    }
  });

  it('may repeat when only one line is available', () => {
    const solo = { lines: [{ id: 'solo', text: 's', category: 'work' }] } as Persona;
    assert.equal(pickLine(solo, { categories: ['work'] }, 'solo')?.id, 'solo');
  });
});

describe('formatting', () => {
  it('formats countdowns', () => {
    assert.equal(formatCountdown(42 * 60_000), '~42 min');
    assert.equal(formatCountdown(125 * 60_000), '~2 hr 5 min');
    assert.equal(formatCountdown(120 * 60_000), '~2 hr');
    assert.equal(formatCountdown(0), 'any moment now');
    assert.equal(formatCountdown(-5000), 'any moment now');
  });

  it('formats 12-hour time labels', () => {
    assert.equal(formatTimeLabel(0), '12:00 AM');
    assert.equal(formatTimeLabel(12 * 60), '12:00 PM');
    assert.equal(formatTimeLabel(21 * 60), '9:00 PM');
  });

  it('round-trips the native time input format', () => {
    for (const mins of [0, 45, 9 * 60, 13 * 60 + 37, 23 * 60 + 59]) {
      assert.equal(timeStringToMinutes(minutesToTimeString(mins)), mins);
    }
  });
});
