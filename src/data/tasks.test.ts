import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAOS_ACTIONS, TASK_ACTIONS } from './tasks.ts';
import { ALL_CATEGORIES } from './personas.ts';

describe('healthy tasks are exercises and resets', () => {
  it('has 100 unique actions with unique ids', () => {
    assert.equal(TASK_ACTIONS.length, 100);
    assert.equal(new Set(TASK_ACTIONS.map((t) => t.id)).size, 100);
    assert.equal(new Set(TASK_ACTIONS.map((t) => t.text)).size, 100);
  });

  it('only uses categories the settings screen can show', () => {
    const known = new Set<string>(ALL_CATEGORIES);
    for (const t of TASK_ACTIONS) {
      assert.ok(known.has(t.category), `${t.id} has unknown category ${t.category}`);
    }
  });

  it('covers every category, so none of the toggles is dead', () => {
    for (const c of ALL_CATEGORIES) {
      const count = TASK_ACTIONS.filter((t) => t.category === c).length;
      assert.ok(count >= 10, `category ${c} only has ${count} tasks`);
    }
  });

  it('reads as an instruction, not a fragment', () => {
    for (const t of TASK_ACTIONS) {
      assert.ok(t.text.length > 8, `${t.id} too short: "${t.text}"`);
      assert.equal(t.text, t.text.trim());
      assert.ok(!/[.!?]$/.test(t.text), `${t.id} should not end in punctuation`);
    }
  });
});

describe('chaos tasks are short', () => {
  it('has 50 unique actions', () => {
    assert.equal(CHAOS_ACTIONS.length, 50);
    assert.equal(new Set(CHAOS_ACTIONS.map((t) => t.text)).size, 50);
  });

  it('keeps every one to a handful of words', () => {
    for (const t of CHAOS_ACTIONS) {
      const words = t.text.split(/\s+/).length;
      assert.ok(words <= 8, `"${t.text}" is ${words} words — too long for the naughty side`);
    }
  });

  it('is meaningfully shorter than the healthy side', () => {
    const avg = (xs: string[]) =>
      xs.reduce((n, x) => n + x.split(/\s+/).length, 0) / xs.length;
    const chaosAvg = avg(CHAOS_ACTIONS.map((t) => t.text));
    const healthyAvg = avg(TASK_ACTIONS.map((t) => t.text));
    assert.ok(
      chaosAvg < healthyAvg - 1,
      `chaos avg ${chaosAvg.toFixed(1)} vs healthy ${healthyAvg.toFixed(1)}`,
    );
  });
});
