import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  clampInterval,
  computeNextFireTime,
  formatInterval,
  formatCountdown,
  formatTimeLabel,
  isWithinActiveHours,
  minutesToTimeString,
  nextActiveWindowStart,
  timeStringToMinutes,
} from './scheduling.ts';

/**
 * Run with `npm test`.
 *
 * These cover the scheduling maths only — the part with awkward edge cases
 * (overnight windows, a nudge landing at 3am) and no way to eyeball it.
 */

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m, 0, 0);

const WORK_DAY = {
  activeStart: 9 * 60,
  activeEnd: 21 * 60,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
};
const OVERNIGHT = {
  activeStart: 22 * 60,
  activeEnd: 6 * 60,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
};

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
  const WINDOW = WORK_DAY;

  it('is exactly one interval later when that lands inside the window', () => {
    const now = at(10);
    const next = computeNextFireTime(now, WINDOW);
    assert.equal((next.getTime() - now.getTime()) / 60_000, DEFAULT_INTERVAL_MINUTES);
  });

  it('honours whatever interval the user picked', () => {
    for (const minutes of [10, 15, 30, 45, 60, 90, 180]) {
      const now = at(9, 5);
      const next = computeNextFireTime(now, { ...WINDOW, intervalMinutes: minutes });
      assert.equal(
        (next.getTime() - now.getTime()) / 60_000,
        minutes,
        `interval ${minutes} should be respected`,
      );
    }
  });

  it('clamps an out-of-range stored interval instead of misbehaving', () => {
    const now = at(10);
    const tooShort = computeNextFireTime(now, { ...WINDOW, intervalMinutes: 1 });
    assert.equal((tooShort.getTime() - now.getTime()) / 60_000, MIN_INTERVAL_MINUTES);

    const tooLong = computeNextFireTime(at(9), { ...WINDOW, intervalMinutes: 9999 });
    // 9am + 180min = noon, still inside the window.
    assert.equal((tooLong.getTime() - at(9).getTime()) / 60_000, MAX_INTERVAL_MINUTES);
  });

  it('is deterministic — the same input gives the same time', () => {
    const now = at(10, 17);
    const a = computeNextFireTime(now, WINDOW).getTime();
    const b = computeNextFireTime(now, WINDOW).getTime();
    assert.equal(a, b);
  });

  it('always lands inside the active window and in the future', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 29, 45, 59]) {
        const now = at(h, m);
        const next = computeNextFireTime(now, WINDOW);
        assert.ok(next.getTime() > now.getTime(), `${h}:${m} must be in the future`);
        assert.ok(
          isWithinActiveHours(next, WINDOW.activeStart, WINDOW.activeEnd),
          `${h}:${m} landed outside active hours`,
        );
      }
    }
  });

  it('pushes a nudge that would overflow the window to the next opening', () => {
    const next = computeNextFireTime(at(20, 45), WINDOW);
    assert.equal(next.getDate(), 16);
    assert.equal(next.getHours(), 9);
    assert.equal(next.getMinutes(), 0);
  });

  it('works for an overnight active window', () => {
    for (let h = 0; h < 24; h++) {
      const next = computeNextFireTime(at(h), OVERNIGHT);
      assert.ok(isWithinActiveHours(next, OVERNIGHT.activeStart, OVERNIGHT.activeEnd));
    }
  });
});

describe('formatting', () => {
  it('formats countdowns', () => {
    assert.equal(formatCountdown(30 * 60_000), '30 min');
    assert.equal(formatCountdown(125 * 60_000), '2 hr 5 min');
    assert.equal(formatCountdown(120 * 60_000), '2 hr');
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

describe('clampInterval', () => {
  it('defaults to 30 minutes', () => {
    assert.equal(DEFAULT_INTERVAL_MINUTES, 30);
  });

  it('never returns less than the 10-minute floor', () => {
    for (const v of [0, 1, 9, -50]) {
      assert.equal(clampInterval(v), MIN_INTERVAL_MINUTES, `${v} should clamp up`);
    }
  });

  it('never returns more than the ceiling', () => {
    assert.equal(clampInterval(10_000), MAX_INTERVAL_MINUTES);
  });

  it('snaps to the 5-minute step', () => {
    assert.equal(clampInterval(32), 30);
    assert.equal(clampInterval(33), 35);
  });

  it('survives a missing or corrupt stored value', () => {
    assert.equal(clampInterval(NaN), DEFAULT_INTERVAL_MINUTES);
    assert.equal(clampInterval(Infinity), DEFAULT_INTERVAL_MINUTES);
  });

  it('leaves every preset untouched', () => {
    for (const preset of [10, 15, 30, 45, 60, 90]) {
      assert.equal(clampInterval(preset), preset);
    }
  });
});

describe('formatInterval', () => {
  it('reads naturally at each scale', () => {
    assert.equal(formatInterval(10), '10 min');
    assert.equal(formatInterval(30), '30 min');
    assert.equal(formatInterval(60), '1 hr');
    assert.equal(formatInterval(90), '1 hr 30 min');
    assert.equal(formatInterval(180), '3 hr');
  });
});
