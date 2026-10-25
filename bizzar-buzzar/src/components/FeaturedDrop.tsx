import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Condition, DropState, PublicProduct, ReservationView } from '../../shared/api-types.ts';
import { priceCheckout } from '../../shared/pricing.ts';
import { api, messageFor } from '../lib/api.ts';
import { formatSessionWindow, money } from '../lib/format.ts';
import { useSession } from '../lib/auth.tsx';
import { usePreviewScenario } from '../lib/useDrop.ts';
import { Countdown } from './Countdown.tsx';
import { ProductArt } from './ProductArt.tsx';
import { PriceBlock } from './PriceBlock.tsx';
import { Chip, DropStatusChip } from './StatusChip.tsx';

export const CONDITION_LABEL: Record<Condition, string> = {
  new: 'New, sealed',
  open_box: 'Open box',
  refurbished: 'Refurbished',
};

interface PurchaseAction {
  label: string;
  disabled: boolean;
  onPress: () => void;
  notice: string | null;
  busy: boolean;
}

/** The single purchase path. Both the featured card and the mobile sticky bar use it. */
export function usePurchase(state: DropState): PurchaseAction {
  const navigate = useNavigate();
  const { me } = useSession();
  const preview = usePreviewScenario();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const availability = state.availability;

  if (availability?.yourOrderId) {
    return { label: 'View your order', disabled: false, busy: false, notice: null, onPress: () => navigate(`/orders/${availability.yourOrderId}`) };
  }
  if (availability?.yourHold) {
    return {
      label: 'Continue your checkout',
      disabled: false,
      busy: false,
      notice: null,
      onPress: () => navigate(`/checkout/${availability.yourHold!.reservationId}${preview ? `?preview=${preview}` : ''}`),
    };
  }
  if (state.phase !== 'live' || !availability) {
    return { label: 'Buy this drop', disabled: true, busy: false, notice: null, onPress: () => undefined };
  }
  if (availability.state === 'held') {
    return {
      label: 'Temporarily unavailable',
      disabled: true,
      busy: false,
      notice: 'Another buyer is checking out this unit. It becomes available again if their hold ends.',
      onPress: () => undefined,
    };
  }
  if (state.product && !state.product.shippingEligible) {
    return { label: 'Not available to ship', disabled: true, busy: false, notice: 'This item cannot be delivered to India.', onPress: () => undefined };
  }

  const reserve = async () => {
    if (preview) {
      navigate(`/checkout/sample-hold?preview=${preview}`);
      return;
    }
    if (!me) {
      navigate(`/login?next=${encodeURIComponent('/')}`);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const reservation = await api<ReservationView>('/reservations', { body: { dropId: state.dropId } });
      navigate(`/checkout/${reservation.id}`);
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return {
    label: me || preview ? 'Buy this drop' : 'Sign in to buy this drop',
    disabled: busy,
    busy,
    notice,
    onPress: () => void reserve(),
  };
}

function Charges({ product, salePaise }: { product: PublicProduct; salePaise: number }) {
  const price = priceCheckout({ salePaise, shippingFeePaise: product.shippingFeePaise, quantity: 1 });
  return (
    <div className="rounded-[14px] border border-line bg-bg/60 p-4 text-sm">
      <p className="font-medium text-text">
        {product.shippingEligible
          ? product.shippingFeePaise === 0
            ? 'Free delivery to India'
            : `Delivery to India, ${money(product.shippingFeePaise)}`
          : 'Not available for delivery'}
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-muted">
        <dt>Item (quantity 1)</dt>
        <dd className="num text-right text-text">{money(price.itemPaise)}</dd>
        <dt>Delivery</dt>
        <dd className="num text-right text-text">{price.shippingPaise === 0 ? 'Free' : money(price.shippingPaise)}</dd>
        <dt className="font-semibold text-text">Total</dt>
        <dd className="num text-right font-semibold text-text">{money(price.totalPaise)}</dd>
      </dl>
      <p className="mt-3 text-xs text-muted">Your total is shown again on the checkout screen before you pay.</p>
    </div>
  );
}

function LivePanel({ state }: { state: DropState }) {
  const purchase = usePurchase(state);
  const product = state.product!;
  const availability = state.availability!;
  const pricing = state.pricing!;
  const unitLine =
    availability.state === 'held' && !availability.heldByYou
      ? 'Temporarily unavailable'
      : availability.heldByYou
        ? 'Reserved for you'
        : availability.yourOrderId
          ? 'You bought this unit'
          : `${availability.remaining} unit available`;
  const dotTone = availability.state === 'available' && !availability.heldByYou ? 'bg-lime' : 'bg-amber';

  return (
    <article className="card grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-12" aria-labelledby="drop-title">
      <ProductArt src={product.imageUrl} alt={`${product.name}, ${CONDITION_LABEL[product.condition].toLowerCase()}`} />

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <DropStatusChip state={state} />
          <Chip>{CONDITION_LABEL[product.condition]}</Chip>
          <Chip>{product.category}</Chip>
        </div>

        <div className="flex flex-col gap-3">
          <h2 id="drop-title" className="font-display text-[44px] leading-[0.92] font-black uppercase sm:text-[64px]">
            {product.name}
          </h2>
          <p className="max-w-prose text-muted">{product.description}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 text-sm">
          {product.specs.map((spec) => (
            <div key={spec.label} className="flex flex-col">
              <dt className="text-muted">{spec.label}</dt>
              <dd className="font-medium text-text">{spec.value}</dd>
            </div>
          ))}
        </dl>

        <p className="flex items-center gap-3 text-base font-medium" aria-live="polite">
          <span className={`size-2.5 rounded-full ${dotTone}`} aria-hidden="true" />
          {unitLine}
        </p>

        <PriceBlock pricing={pricing} />
        <Charges product={product} salePaise={pricing.salePaise} />

        {state.closesAt && <Countdown size="sm" label="Sale closes in" to={state.closesAt} />}

        <div className="flex flex-col gap-3">
          <button type="button" className="btn-primary w-full lg:w-auto lg:self-start" onClick={purchase.onPress} disabled={purchase.disabled}>
            {purchase.busy ? 'Reserving…' : purchase.label}
          </button>
          {purchase.notice && (
            <p role="alert" className="text-sm text-amber">
              {purchase.notice}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Warranty: {product.warrantyText}. Returns: {product.returnPolicyText}.{' '}
            <Link to="/returns" className="text-text underline underline-offset-4">
              Read the returns policy
            </Link>
          </p>
        </div>
      </div>
    </article>
  );
}

/** Sticky purchase bar for narrow screens. It sits above the bottom navigation and never covers content. */
export function StickyPurchaseBar({ state }: { state: DropState }) {
  const purchase = usePurchase(state);
  if (state.phase !== 'live' || !state.product || !state.pricing) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 pt-3 pb-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-[640px] items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted">{state.product.name}</p>
          <p className="num text-xl font-bold">{money(state.pricing.salePaise)}</p>
        </div>
        <button type="button" className="btn-primary min-w-[52%]" onClick={purchase.onPress} disabled={purchase.disabled}>
          {purchase.busy ? 'Reserving…' : purchase.label}
        </button>
      </div>
    </div>
  );
}

function MysteryPanel({ state }: { state: DropState }) {
  const reveal = state.phase === 'reveal' && state.releaseAt;
  return (
    <article className="card grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12" aria-labelledby="mystery-title">
      <ProductArt src={null} placeholder="mystery" alt="A sealed mystery drop" wide={Boolean(reveal)} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <DropStatusChip state={state} />
          {state.session && <Chip>{formatSessionWindow(state.session.windowOpensAt, state.session.windowClosesAt)}</Chip>}
        </div>
        {reveal ? (
          <>
            <h2 id="mystery-title" className="font-display text-4xl leading-[0.92] font-black uppercase sm:text-6xl">
              Next drop incoming
            </h2>
            <Countdown label="Reveal in" to={state.releaseAt!} />
            <p className="text-muted">Product revealed when the timer reaches zero.</p>
          </>
        ) : (
          <>
            <h2 id="mystery-title" className="font-display text-5xl leading-[0.92] font-black uppercase sm:text-6xl">
              The next drop is a mystery
            </h2>
            <p className="max-w-prose text-muted">
              One surprise at a time. Get alerted 30 seconds before each drop. The product stays hidden until the reveal.
            </p>
          </>
        )}
        <div>
          <Link to="/alerts" className="btn-secondary">
            Get drop alerts
          </Link>
        </div>
      </div>
    </article>
  );
}

function ClosedPanel({ state }: { state: DropState }) {
  const copy: Record<string, { title: string; body: string }> = {
    sold: { title: 'This drop is gone', body: 'Every unit sold. The next drop is still a mystery until its reveal.' },
    ended: { title: 'Sale ended', body: 'This sale closed without a sale. The next drop is still a mystery.' },
    paused: { title: 'Temporarily paused', body: 'The team has paused this drop. Your alerts stay on.' },
  };
  const entry = copy[state.phase] ?? {
    title: state.sessionState === 'ended' ? 'Session ended' : 'No drop is scheduled right now',
    body:
      state.sessionState === 'ended'
        ? 'Thanks for dropping by. Get alerts and we will tell you when the next session opens.'
        : 'Get alerts and we will tell you when the next session opens.',
  };
  const product = state.product;
  return (
    <article className="card grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12" aria-labelledby="closed-title">
      {product ? (
        <ProductArt src={product.imageUrl} alt={`${product.name}, no longer for sale`} muted />
      ) : (
        <ProductArt src={null} placeholder="mystery" alt="A sealed mystery drop" />
      )}
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <DropStatusChip state={state} />
          {product && <Chip>{product.name}</Chip>}
        </div>
        <h2 id="closed-title" className="font-display text-5xl leading-[0.92] font-black uppercase sm:text-6xl">
          {entry.title}
        </h2>
        <p className="max-w-prose text-muted">{entry.body}</p>
        <div>
          <Link to="/alerts" className="btn-primary">
            Get drop alerts
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The featured slot: the one drop that matters right now, in whatever state the server says. */
export function FeaturedDrop({ state }: { state: DropState }) {
  if (state.phase === 'live' && state.product && state.pricing && state.availability) return <LivePanel state={state} />;
  if (state.phase === 'waiting' || state.phase === 'reveal') return <MysteryPanel state={state} />;
  return <ClosedPanel state={state} />;
}
