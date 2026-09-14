import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaosAt,
  chaosPoolSize,
  createQueue,
  nudgeAt,
  poolSize,
  remainingInCycle,
  seededOrder,
  takeFromQueue,
} from './nudgePool.ts';
import { PERSONAS, NUDGES_PER_PERSONA } from '../data/personas.ts';
import { CHAOS_ACTIONS, TASK_ACTIONS } from '../data/tasks.ts';
import { ALL_CATEGORIES } from '../data/personas.ts';

const ALL = ALL_CATEGORIES;

describe('pool size', () => {
  it('offers 5,000 distinct nudges per persona', () => {
    assert.equal(NUDGES_PER_PERSONA, 5000);
    for (const persona of PERSONAS) {
      assert.equal(poolSize(persona, ALL), 5000, `${persona.id} pool`);
    }
  });

  it('is built from 100 actions and 50 phrasings', () => {
    assert.equal(TASK_ACTIONS.length, 100);
    for (const p of PERSONAS) assert.equal(p.wrappers.length, 50);
  });

  it('shrinks proportionally when categories are switched off', () => {
    const oneCategory = poolSize(PERSONAS[0], ['hydration']);
    const actions = TASK_ACTIONS.filter((t) => t.category === 'hydration').length;
    assert.equal(oneCategory, actions * 50);
  });
});

describe('rendered nudges', () => {
  it('never leaves an unfilled slot', () => {
    for (const persona of PERSONAS) {
      for (let i = 0; i < poolSize(persona, ALL); i++) {
        const n = nudgeAt(persona, ALL, i);
        assert.ok(n, `index ${i} should render`);
        assert.ok(!n!.text.includes('{t}'), `index ${i} left a slot: ${n!.text}`);
        assert.ok(n!.text.length > 10, `index ${i} suspiciously short`);
      }
    }
  });

  it('produces 5,000 genuinely distinct texts per persona', () => {
    for (const persona of PERSONAS) {
      const seen = new Set<string>();
      for (let i = 0; i < 5000; i++) seen.add(nudgeAt(persona, ALL, i)!.text);
      assert.equal(seen.size, 5000, `${persona.id} produced ${seen.size} distinct`);
    }
  });

  it('shouts for the drill sergeant only', () => {
    const drill = PERSONAS.find((p) => p.id === 'drill-sergeant')!;
    const bestie = PERSONAS.find((p) => p.id === 'mischievous-bestie')!;
    const shout = nudgeAt(drill, ALL, 0)!.text;
    assert.equal(shout, shout.toUpperCase());
    const chat = nudgeAt(bestie, ALL, 0)!.text;
    assert.notEqual(chat, chat.toUpperCase());
  });

  it('returns null when every category is off', () => {
    assert.equal(nudgeAt(PERSONAS[0], [], 0), null);
  });
});

describe('seededOrder', () => {
  it('is a true permutation', () => {
    const order = seededOrder(5000, 12345);
    assert.equal(order.length, 5000);
    assert.equal(new Set(order).size, 5000);
    assert.equal(Math.min(...order), 0);
    assert.equal(Math.max(...order), 4999);
  });

  it('is deterministic for a seed, and different across seeds', () => {
    assert.deepEqual(seededOrder(100, 7), seededOrder(100, 7));
    assert.notDeepEqual(seededOrder(100, 7), seededOrder(100, 8));
  });

  it('actually shuffles', () => {
    const order = seededOrder(1000, 42);
    const fixed = order.filter((v, i) => v === i).length;
    assert.ok(fixed < 50, `too many unmoved elements: ${fixed}`);
  });
});

describe('no-repeat queue', () => {
  const persona = PERSONAS[0];

  it('delivers all 5,000 before repeating a single one', () => {
    let queue = createQueue(persona, ALL, 99);
    const seen = new Set<string>();

    // Drain the entire pool in realistic batches.
    for (let batch = 0; batch < 500; batch++) {
      const res = takeFromQueue(queue, persona, ALL, 10);
      queue = res.queue;
      for (const n of res.choices) {
        assert.ok(!seen.has(n.id), `repeat before exhaustion: ${n.id}`);
        seen.add(n.id);
      }
    }
    assert.equal(seen.size, 5000);
    assert.equal(queue.cycles, 0, 'should not have wrapped yet');
  });

  it('starts a fresh cycle once the pool is exhausted', () => {
    let queue = createQueue(persona, ALL, 7);
    const first = takeFromQueue(queue, persona, ALL, 5000);
    queue = first.queue;
    assert.equal(new Set(first.choices.map((n) => n.id)).size, 5000);

    const next = takeFromQueue(queue, persona, ALL, 10);
    assert.equal(next.queue.cycles, 1, 'cycle counter should advance');
    assert.equal(next.choices.length, 10);
  });

  it('reshuffles between cycles rather than looping identically', () => {
    let queue = createQueue(persona, ALL, 3);
    const a = takeFromQueue(queue, persona, ALL, 5000);
    const b = takeFromQueue(a.queue, persona, ALL, 5000);
    assert.notDeepEqual(
      a.choices.map((n) => n.id),
      b.choices.map((n) => n.id),
      'second cycle should be a different order',
    );
    // ...but still covering the whole pool.
    assert.equal(new Set(b.choices.map((n) => n.id)).size, 5000);
  });

  it('survives being persisted and reloaded mid-cycle', () => {
    let queue = createQueue(persona, ALL, 55);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // Round-trip through JSON, exactly as Preferences would.
      queue = JSON.parse(JSON.stringify(queue));
      const res = takeFromQueue(queue, persona, ALL, 12);
      queue = res.queue;
      for (const n of res.choices) {
        assert.ok(!seen.has(n.id), `repeat after reload: ${n.id}`);
        seen.add(n.id);
      }
    }
    assert.equal(seen.size, 2400);
  });

  it('starts a new cycle when the persona changes', () => {
    const queue = createQueue(PERSONAS[0], ALL, 11);
    const advanced = takeFromQueue(queue, PERSONAS[0], ALL, 100).queue;
    const switched = takeFromQueue(advanced, PERSONAS[1], ALL, 1);
    assert.equal(switched.queue.cursor, 1, 'cursor resets for the new pool');
    assert.ok(switched.choices[0].healthy.id.startsWith(PERSONAS[1].id));
  });

  it('starts a new cycle when categories change', () => {
    const queue = createQueue(persona, ALL, 21);
    const advanced = takeFromQueue(queue, persona, ALL, 100).queue;
    const narrowed = takeFromQueue(advanced, persona, ['hydration'], 1);
    assert.equal(narrowed.queue.cursor, 1);
    assert.equal(narrowed.choices[0].healthy.category, 'hydration');
  });

  it('respects category filtering with no repeats', () => {
    let queue = createQueue(persona, ['movement'], 5);
    const size = poolSize(persona, ['movement']);
    const seen = new Set<string>();
    const res = takeFromQueue(queue, persona, ['movement'], size);
    queue = res.queue;
    for (const n of res.choices) {
      assert.equal(n.healthy.category, 'movement');
      assert.ok(!seen.has(n.id));
      seen.add(n.id);
    }
    assert.equal(seen.size, size);
  });

  it('yields nothing when every category is off', () => {
    const res = takeFromQueue(createQueue(persona, []), persona, [], 5);
    assert.equal(res.choices.length, 0);
  });

  it('reports how many remain before a repeat', () => {
    const queue = createQueue(persona, ALL, 1);
    assert.equal(remainingInCycle(queue, persona, ALL), 5000);
    const after = takeFromQueue(queue, persona, ALL, 1200).queue;
    assert.equal(remainingInCycle(after, persona, ALL), 3800);
  });
});

describe('this-or-that pairing', () => {
  const persona = PERSONAS[0];
  const ALL2 = ALL_CATEGORIES;

  it('offers a chaos option for every persona', () => {
    assert.equal(CHAOS_ACTIONS.length, 50);
    for (const p of PERSONAS) assert.equal(chaosPoolSize(p), 50 * 50);
  });

  it('renders chaos options in the persona voice with no unfilled slot', () => {
    for (const p of PERSONAS) {
      for (let i = 0; i < chaosPoolSize(p); i++) {
        const n = chaosAt(p, i);
        assert.ok(!n.text.includes('{t}'), `chaos ${i} left a slot`);
        assert.ok(n.text.length > 10);
      }
    }
  });

  it('always returns two genuinely different options', () => {
    let queue = createQueue(persona, ALL2, 31, 77);
    const res = takeFromQueue(queue, persona, ALL2, 500);
    for (const c of res.choices) {
      assert.ok(c.healthy.text.length > 0);
      assert.ok(c.chaos.text.length > 0);
      assert.notEqual(c.healthy.text, c.chaos.text);
      assert.notEqual(c.healthy.id, c.chaos.id);
    }
  });

  it('does not lock a task to the same chaotic partner', () => {
    // Two independent cursors, so the pairing shifts between cycles.
    const queue = createQueue(persona, ALL2, 5, 9);
    const first = takeFromQueue(queue, persona, ALL2, 5000);
    const second = takeFromQueue(first.queue, persona, ALL2, 5000);
    const pairingA = new Map(first.choices.map((c) => [c.healthy.id, c.chaos.id]));
    let differing = 0;
    for (const c of second.choices) {
      if (pairingA.get(c.healthy.id) !== c.chaos.id) differing++;
    }
    assert.ok(differing > 4000, `only ${differing} pairings changed`);
  });

  it('keeps the healthy side repeat-free across a full cycle', () => {
    let queue = createQueue(persona, ALL2, 13, 17);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const res = takeFromQueue(queue, persona, ALL2, 10);
      queue = res.queue;
      for (const c of res.choices) {
        assert.ok(!seen.has(c.healthy.id), `healthy repeat: ${c.healthy.id}`);
        seen.add(c.healthy.id);
      }
    }
    assert.equal(seen.size, 5000);
  });

  it('recycles the smaller chaos pool without ever blocking', () => {
    // Chaos has 2,500 entries against 5,000 healthy, so it wraps twice.
    let queue = createQueue(persona, ALL2, 1, 2);
    const res = takeFromQueue(queue, persona, ALL2, 5000);
    assert.equal(res.choices.length, 5000);
    assert.equal(new Set(res.choices.map((c) => c.chaos.id)).size, 2500);
  });
});

describe('pool lookups survive a bad index', () => {
  const persona = PERSONAS[0];

  it('never returns undefined for an out-of-range or non-finite index', () => {
    // A stale cursor once produced NaN here, which indexed the action array as
    // undefined and threw on `.id` — taking the whole app down at boot.
    for (const bad of [NaN, Infinity, -Infinity, -1, -9999, 1e9, 5000, 2500]) {
      const chaos = chaosAt(persona, bad as number);
      assert.ok(chaos && typeof chaos.id === 'string', `chaosAt(${bad})`);
      assert.ok(!chaos.text.includes('{t}'), `chaosAt(${bad}) left a slot`);

      const healthy = nudgeAt(persona, ALL_CATEGORIES, bad as number);
      assert.ok(healthy && typeof healthy.id === 'string', `nudgeAt(${bad})`);
      assert.ok(!healthy!.text.includes('{t}'), `nudgeAt(${bad}) left a slot`);
    }
  });
});
