import type { DropState } from '../../shared/api-types.ts';
import type { OrderPaymentStatus, FulfilmentStatus } from '../../shared/api-types.ts';

type Tone = 'lime' | 'amber' | 'muted' | 'danger';

const TONE: Record<Tone, string> = {
  lime: 'border-lime/50 bg-lime/10 text-lime',
  amber: 'border-amber/50 bg-amber/10 text-amber',
  muted: 'border-line bg-elevated text-muted',
  danger: 'border-danger/50 bg-danger/10 text-danger',
};

export function Chip({ tone = 'muted', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`chip ${TONE[tone]}`}>{children}</span>;
}

/** The status of the current drop, in the words the brief uses. */
export function DropStatusChip({ state }: { state: DropState | null }) {
  if (!state) return <Chip>Loading</Chip>;
  switch (state.phase) {
    case 'live':
      return state.availability?.state === 'available' ? <Chip tone="lime">● Live now</Chip> : <Chip tone="amber">Live · held</Chip>;
    case 'reveal':
      return <Chip tone="lime">Reveal in progress</Chip>;
    case 'waiting':
      return <Chip>Mystery</Chip>;
    case 'sold':
      return <Chip tone="muted">Sold out</Chip>;
    case 'ended':
      return <Chip tone="muted">Sale ended</Chip>;
    case 'paused':
      return <Chip tone="amber">Paused</Chip>;
    default:
      return <Chip>{state.sessionState === 'ended' ? 'Session ended' : 'No drop scheduled'}</Chip>;
  }
}

const PAYMENT_LABEL: Record<OrderPaymentStatus, { label: string; tone: Tone }> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'amber' },
  paid: { label: 'Paid', tone: 'lime' },
  failed: { label: 'Payment failed', tone: 'danger' },
  abandoned: { label: 'Checkout not completed', tone: 'muted' },
  refund_pending: { label: 'Refund in progress', tone: 'amber' },
  partially_refunded: { label: 'Partly refunded', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'muted' },
  needs_review: { label: 'Under review', tone: 'amber' },
};

export function PaymentChip({ status }: { status: OrderPaymentStatus }) {
  const entry = PAYMENT_LABEL[status];
  return <Chip tone={entry.tone}>{entry.label}</Chip>;
}

const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  unfulfilled: 'Not yet dispatched',
  preparing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function FulfilmentChip({ status }: { status: FulfilmentStatus }) {
  return <Chip tone={status === 'delivered' || status === 'shipped' ? 'lime' : 'muted'}>{FULFILMENT_LABEL[status]}</Chip>;
}
