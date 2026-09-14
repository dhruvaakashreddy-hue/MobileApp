import type { NudgeCategory, Persona } from '../types';
import {
  CHAOS_ACTIONS,
  TASK_ACTIONS,
  type ChaosAction,
  type TaskAction,
} from '../data/tasks.ts';

/**
 * The nudge pool and its no-repeat queue.
 *
 * A nudge is one task action rendered through one of the persona's phrasings,
 * so the pool is every (phrasing x action) pair: 50 x 100 = 5,000 per persona.
 *
 * The queue guarantees the whole pool is used before anything repeats. It does
 * that without storing a 5,000-entry list: the order is a seeded shuffle, so
 * only the seed and a cursor are persisted and the permutation is recomputed on
 * demand (well under a millisecond).
 */

/** Deterministic PRNG — same seed, same order, on every device and restart. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over 0..size-1, driven by the seed. */
export function seededOrder(size: number, seed: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function actionsFor(categories: NudgeCategory[]): TaskAction[] {
  const enabled = new Set(categories);
  return TASK_ACTIONS.filter((t) => enabled.has(t.category));
}

/** How many distinct healthy nudges exist for this persona and selection. */
export function poolSize(persona: Persona, categories: NudgeCategory[]): number {
  return persona.wrappers.length * actionsFor(categories).length;
}

/** How many distinct chaos nudges exist for this persona. */
export function chaosPoolSize(persona: Persona): number {
  return persona.wrappers.length * CHAOS_ACTIONS.length;
}

export interface RenderedNudge {
  /** Stable id for this exact pairing, used to prove no repeats. */
  id: string;
  text: string;
  category: NudgeCategory;
}

/**
 * One this-or-that: a real task on one side, something ridiculous on the other.
 * The user picks. Both are phrased by the same persona, so the choice feels
 * like one character offering two options rather than two different voices.
 */
export interface NudgeChoice {
  /** Combined id for the pair — what the no-repeat guarantee is measured on. */
  id: string;
  healthy: RenderedNudge;
  chaos: RenderedNudge;
}

/** Drill Sergeant shouts; the phrasings are authored in caps already. */
function applyVoice(persona: Persona, text: string): string {
  return persona.id === 'drill-sergeant' ? text.toUpperCase() : text;
}

export function renderNudge(
  persona: Persona,
  action: TaskAction | ChaosAction,
  wrapperIndex: number,
): string {
  const wrapper = persona.wrappers[wrapperIndex % persona.wrappers.length];
  // replaceAll, not replace: a phrasing may use the slot more than once
  // ("{t} or we're not friends (jk. but {t})").
  return applyVoice(persona, wrapper.replaceAll('{t}', action.text));
}

/** Maps a pool index to the actual nudge it stands for. */
export function nudgeAt(
  persona: Persona,
  categories: NudgeCategory[],
  index: number,
): RenderedNudge | null {
  const actions = actionsFor(categories);
  if (actions.length === 0) return null;

  const wrapperCount = persona.wrappers.length;
  const total = wrapperCount * actions.length;
  const safe = Number.isFinite(index)
    ? ((Math.floor(index) % total) + total) % total
    : 0;
  const wrapperIndex = safe % wrapperCount;
  const action = actions[Math.floor(safe / wrapperCount)];

  return {
    id: `${persona.id}:${wrapperIndex}:${action.id}`,
    text: renderNudge(persona, action, wrapperIndex),
    category: action.category,
  };
}

/** Maps a chaos-pool index to its rendered nudge. */
export function chaosAt(persona: Persona, index: number): RenderedNudge {
  const wrapperCount = persona.wrappers.length;
  // Normalise first: an out-of-range or non-finite index would otherwise index
  // the array with NaN and yield undefined.
  const safe = Number.isFinite(index)
    ? ((Math.floor(index) % (wrapperCount * CHAOS_ACTIONS.length)) +
        wrapperCount * CHAOS_ACTIONS.length) %
      (wrapperCount * CHAOS_ACTIONS.length)
    : 0;
  const wrapperIndex = safe % wrapperCount;
  const action = CHAOS_ACTIONS[Math.floor(safe / wrapperCount)];

  return {
    id: `${persona.id}:chaos:${wrapperIndex}:${action.id}`,
    text: renderNudge(persona, action, wrapperIndex),
    category: 'random',
  };
}

// ─── The queue ────────────────────────────────────────────────────────────

export interface NudgeQueue {
  /** Which pool this queue belongs to; a change means a fresh cycle. */
  poolKey: string;
  seed: number;
  /** How far through the shuffled order we are. */
  cursor: number;
  /** Completed full passes — shown as "you've seen all 5,000" bragging rights. */
  cycles: number;
  /**
   * The chaos side runs its own independent cycle, because the two pools are
   * different sizes. Pairing them off a single cursor would lock each healthy
   * task to the same chaotic partner forever.
   */
  chaosSeed: number;
  chaosCursor: number;
}

/** Persona plus enabled categories: change either and the pool itself changed. */
export function poolKeyFor(
  persona: Persona,
  categories: NudgeCategory[],
): string {
  return `${persona.id}|${[...categories].sort().join(',')}`;
}

export function createQueue(
  persona: Persona,
  categories: NudgeCategory[],
  seed = Math.floor(Math.random() * 0xffffffff),
  chaosSeed = Math.floor(Math.random() * 0xffffffff),
): NudgeQueue {
  return {
    poolKey: poolKeyFor(persona, categories),
    seed,
    cursor: 0,
    cycles: 0,
    chaosSeed,
    chaosCursor: 0,
  };
}

/**
 * Takes the next `count` nudges without repeating until the pool is exhausted.
 * On exhausting it, reshuffles with a new seed and starts a fresh cycle — so
 * the order differs next time round rather than looping identically.
 */
export function takeFromQueue(
  queue: NudgeQueue,
  persona: Persona,
  categories: NudgeCategory[],
  count: number,
): { choices: NudgeChoice[]; queue: NudgeQueue } {
  const size = poolSize(persona, categories);
  const chaosSize = chaosPoolSize(persona);
  if (size === 0 || chaosSize === 0) return { choices: [], queue };

  const key = poolKeyFor(persona, categories);
  let current: NudgeQueue =
    queue.poolKey === key ? { ...queue } : createQueue(persona, categories);

  const choices: NudgeChoice[] = [];
  let order = seededOrder(size, current.seed);
  let chaosOrder = seededOrder(chaosSize, current.chaosSeed);

  for (let i = 0; i < count; i++) {
    if (current.cursor >= size) {
      // Pool exhausted — everything has been seen once. New cycle, new order.
      current = {
        ...current,
        seed: nextSeed(current.seed),
        cursor: 0,
        cycles: current.cycles + 1,
      };
      order = seededOrder(size, current.seed);
    }
    if (current.chaosCursor >= chaosSize) {
      current = {
        ...current,
        chaosSeed: nextSeed(current.chaosSeed),
        chaosCursor: 0,
      };
      chaosOrder = seededOrder(chaosSize, current.chaosSeed);
    }

    const healthy = nudgeAt(persona, categories, order[current.cursor]);
    const chaos = chaosAt(persona, chaosOrder[current.chaosCursor]);
    current = {
      ...current,
      cursor: current.cursor + 1,
      chaosCursor: current.chaosCursor + 1,
    };

    if (healthy) {
      choices.push({ id: `${healthy.id}|${chaos.id}`, healthy, chaos });
    }
  }

  return { choices, queue: current };
}

/** Linear congruential step — a new, well-spread seed for the next cycle. */
function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

/** How many nudges remain in this cycle before anything repeats. */
export function remainingInCycle(
  queue: NudgeQueue,
  persona: Persona,
  categories: NudgeCategory[],
): number {
  const size = poolSize(persona, categories);
  if (queue.poolKey !== poolKeyFor(persona, categories)) return size;
  return Math.max(0, size - queue.cursor);
}
