import type { DropState, PastDrop, PublicPricing, PublicProduct, ReservationView } from '../../shared/api-types.ts';
import { savingsFor } from '../../shared/pricing.ts';

/**
 * Concept preview: sample products and prices, computed in the browser, never from the server.
 * It is compiled out of production builds unless VITE_BB_PREVIEW=true is set for that build.
 */
export const PREVIEW_NOTICE = 'Concept preview — sample products and prices';

export type PreviewScenario =
  | 'waiting'
  | 'reveal'
  | 'live'
  | 'reserved'
  | 'held'
  | 'sold'
  | 'ended'
  | 'session-ended'
  | 'paused';

export const PREVIEW_SCENARIOS: { id: PreviewScenario; label: string; hint: string }[] = [
  { id: 'waiting', label: 'Waiting', hint: 'Mystery state, session window only' },
  { id: 'reveal', label: 'Final 30 seconds', hint: 'Countdown; becomes live at zero' },
  { id: 'live', label: 'Live', hint: 'Product visible, one unit available' },
  { id: 'reserved', label: 'Reserved (you)', hint: 'Your 2-minute hold is running' },
  { id: 'held', label: 'Held by another buyer', hint: 'Temporarily unavailable, not sold' },
  { id: 'sold', label: 'Sold', hint: 'This drop is gone' },
  { id: 'ended', label: 'Sale ended', hint: 'Closed without a sale' },
  { id: 'session-ended', label: 'Session ended', hint: 'No drops left in this session' },
  { id: 'paused', label: 'Paused', hint: 'Temporarily paused by the team' },
];

export function previewAvailable(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_BB_PREVIEW === 'true';
}

export function isPreviewScenario(value: string | null): value is PreviewScenario {
  return PREVIEW_SCENARIOS.some((scenario) => scenario.id === value);
}

export const SAMPLE_PRODUCT: PublicProduct = {
  id: 'sample-studio-headphones',
  name: 'Studio Wireless Headphones',
  description: 'Over-ear wireless headphones with soft dark ear cushions and a folding headband. Sample product for the concept preview.',
  category: 'Audio',
  condition: 'new',
  specs: [
    { label: 'Type', value: 'Over-ear, wireless' },
    { label: 'Battery', value: 'Up to 40 hours' },
    { label: 'Connection', value: 'Bluetooth 5.3' },
    { label: 'Finish', value: 'Silver, dark cushions' },
  ],
  warrantyText: '1 year brand warranty (sample text)',
  returnPolicyText: '7 day returns on unused items (sample text)',
  shippingEligible: true,
  shippingFeePaise: 0,
  imageUrl: '/preview/studio-headphones.svg',
};

const SAMPLE_SALE_PAISE = 149_900;
const SAMPLE_REFERENCE_PAISE = 499_900;
const SAMPLE_HOLD_MS = 120_000;
const SAMPLE_REVEAL_MS = 30_000;

export const SAMPLE_PAST_DROPS: PastDrop[] = [
  {
    dropId: 'sample-past-speaker',
    productName: 'Compact Speaker',
    condition: 'open_box',
    salePaise: 89_900,
    outcome: 'sold',
    releasedAt: '2026-10-25T10:00:00Z',
    imageUrl: '/preview/compact-speaker.svg',
  },
  {
    dropId: 'sample-past-keyboard',
    productName: 'Mechanical Keyboard',
    condition: 'refurbished',
    salePaise: 219_900,
    outcome: 'ended',
    releasedAt: '2026-10-24T19:40:00Z',
    imageUrl: '/preview/mechanical-keyboard.svg',
  },
];

function pricing(): PublicPricing {
  const savings = savingsFor(SAMPLE_REFERENCE_PAISE, SAMPLE_SALE_PAISE);
  return {
    currency: 'INR',
    salePaise: SAMPLE_SALE_PAISE,
    referencePaise: SAMPLE_REFERENCE_PAISE,
    referenceCheckedAt: '2026-10-20T00:00:00Z',
    savingsPaise: savings?.savingsPaise ?? null,
    savingsPercent: savings?.percent ?? null,
  };
}

/** When each scenario started, so timed states (the reveal, the hold) run from the moment they were shown. */
const startedAtByScenario = new Map<PreviewScenario, number>();

/** Restarts a scenario's clock. Picking it from the controls does this. */
export function startPreviewScenario(scenario: PreviewScenario): void {
  startedAtByScenario.set(scenario, Date.now());
}

export function previewStartedAt(scenario: PreviewScenario): number {
  let startedAt = startedAtByScenario.get(scenario);
  if (startedAt === undefined) {
    startedAt = Date.now();
    startedAtByScenario.set(scenario, startedAt);
  }
  return startedAt;
}

/** Builds the drop state a visitor would see for a scenario, at the given moment. */
export function previewDropState(scenario: PreviewScenario, startedAt: number, nowMs: number): DropState {
  const iso = (ms: number) => new Date(ms).toISOString();
  const session = (state: { opens: number; closes: number }) => ({
    id: 'sample-session',
    name: 'Evening Drop (sample)',
    windowOpensAt: iso(state.opens),
    windowClosesAt: iso(state.closes),
  });
  const base = { serverNow: iso(nowMs), dropId: 'sample-drop', product: null, pricing: null, availability: null };
  const sessionWindow = { opens: nowMs - 30 * 60_000, closes: nowMs + 150 * 60_000 };

  switch (scenario) {
    case 'waiting':
      return { ...base, dropId: null, sessionState: 'open', session: session(sessionWindow), phase: 'waiting', releaseAt: null, closesAt: null };

    case 'reveal': {
      const releaseMs = startedAt + SAMPLE_REVEAL_MS;
      if (nowMs < releaseMs) {
        return { ...base, sessionState: 'open', session: session(sessionWindow), phase: 'reveal', releaseAt: iso(releaseMs), closesAt: null };
      }
      // Once the countdown reaches zero, the drop goes live without a page refresh.
      return liveState(nowMs, releaseMs, 'available', session(sessionWindow));
    }

    case 'live':
      return liveState(nowMs, nowMs - 5_000, 'available', session(sessionWindow));

    case 'reserved': {
      const expiresAt = startedAt + SAMPLE_HOLD_MS;
      const state = liveState(nowMs, nowMs - 5_000, 'available', session(sessionWindow));
      return {
        ...state,
        availability: state.availability && {
          ...state.availability,
          remaining: 0,
          state: 'held',
          heldByYou: true,
          yourHold: { reservationId: 'sample-hold', expiresAt: iso(expiresAt) },
        },
      };
    }

    case 'held':
      return liveState(nowMs, nowMs - 5_000, 'held', session(sessionWindow));

    case 'sold':
      return {
        ...liveState(nowMs, nowMs - 10 * 60_000, 'sold', session(sessionWindow)),
        phase: 'sold',
        closesAt: iso(nowMs + 3 * 60_000),
      };

    case 'ended':
      return { ...liveState(nowMs, nowMs - 10 * 60_000, 'available', session(sessionWindow)), phase: 'ended', closesAt: iso(nowMs - 60_000) };

    case 'session-ended':
      return {
        ...base,
        dropId: null,
        sessionState: 'ended',
        session: session({ opens: nowMs - 180 * 60_000, closes: nowMs - 60_000 }),
        phase: 'none',
        releaseAt: null,
        closesAt: null,
      };

    case 'paused':
      return { ...base, dropId: null, sessionState: 'paused', session: session(sessionWindow), phase: 'paused', releaseAt: null, closesAt: null };
  }
}

function liveState(nowMs: number, releaseMs: number, availability: 'available' | 'held' | 'sold', session: DropState['session']): DropState {
  const iso = (ms: number) => new Date(ms).toISOString();
  const quantity = 1;
  const remaining = availability === 'available' ? 1 : 0;
  return {
    serverNow: iso(nowMs),
    sessionState: 'open',
    session,
    phase: 'live',
    dropId: 'sample-drop',
    releaseAt: iso(releaseMs),
    closesAt: iso(releaseMs + 5 * 60_000),
    availability: { quantity, remaining, state: availability, heldByYou: false, yourHold: null, yourOrderId: null },
    product: SAMPLE_PRODUCT,
    pricing: pricing(),
  };
}

/** A sample reservation for the checkout screen. It counts down the same 120 seconds as a live hold. */
export function previewReservation(startedAt: number, nowMs: number): ReservationView {
  const expiresAt = startedAt + SAMPLE_HOLD_MS;
  const expired = nowMs >= expiresAt;
  return {
    id: 'sample-hold',
    dropId: 'sample-drop',
    status: expired ? 'expired' : 'held',
    statusReason: expired ? 'hold_ended' : null,
    quantity: 1,
    expiresAt: new Date(expiresAt).toISOString(),
    serverNow: new Date(nowMs).toISOString(),
    lateAccepted: false,
    product: { name: SAMPLE_PRODUCT.name, condition: SAMPLE_PRODUCT.condition, imageUrl: SAMPLE_PRODUCT.imageUrl },
    pricing: { currency: 'INR', itemPaise: SAMPLE_SALE_PAISE, shippingPaise: 0, totalPaise: SAMPLE_SALE_PAISE },
    orderId: null,
    paymentStatus: null,
  };
}
