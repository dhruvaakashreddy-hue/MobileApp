import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/client.ts';
import { fail } from '../errors.ts';
import type { Condition, ReservationView } from '../../shared/api-types.ts';
import { resolveDropPhase, type DropPhase } from '../../shared/phase.ts';
import { priceCheckout } from '../../shared/pricing.ts';
import { imageUrlFor } from './catalogue.ts';

interface DropLockRow {
  id: string;
  session_id: string;
  status: 'draft' | 'scheduled' | 'paused' | 'cancelled';
  quantity: number;
  release_at: Date | null;
  closes_at: Date | null;
  sale_price_paise: number;
  product_id: string;
  session_status: 'draft' | 'scheduled' | 'paused' | 'cancelled';
}

interface ReservationJoinRow {
  id: string;
  drop_id: string;
  status: ReservationView['status'];
  status_reason: string | null;
  quantity: number;
  expires_at: Date;
  late_accepted: boolean;
  sale_price_paise: number;
  product_id: string;
  name: string;
  condition: Condition;
  shipping_fee_paise: number;
  order_id: string | null;
  order_payment_status: ReservationView['paymentStatus'];
  item_paise: number | null;
  shipping_paise: number | null;
  total_paise: number | null;
}

/**
 * Serialises every reservation for one drop, and returns the drop row locked.
 * All reservation and payment paths lock the drop first, so they cannot deadlock each other.
 */
export async function lockDrop(q: Queryable, dropId: string): Promise<DropLockRow | null> {
  const [row] = await q.query<DropLockRow>(
    `select d.id, d.session_id, d.status, d.quantity, d.release_at, d.closes_at, d.sale_price_paise, d.product_id,
            s.status as session_status
       from drops d
       join sessions s on s.id = d.session_id
      where d.id = $1
      for update of d`,
    [dropId],
  );
  return row ?? null;
}

export function dropPhaseAt(deps: Deps, drop: DropLockRow, soldUnits: number): DropPhase {
  return resolveDropPhase({
    nowMs: deps.clock.now().getTime(),
    releaseMs: drop.release_at?.getTime() ?? null,
    closesMs: drop.closes_at?.getTime() ?? null,
    quantity: drop.quantity,
    soldUnits,
    dropStatus: drop.status,
    sessionPaused: drop.session_status === 'paused',
  });
}

/**
 * Reserves the single unit for a buyer, using the server clock and the database lock.
 * The request is idempotent: a buyer who already holds the drop gets their existing hold back.
 */
export async function createReservation(deps: Deps, userId: string, dropId: string): Promise<ReservationView> {
  const reservationId = await deps.db.tx(async (q) => {
    const drop = await lockDrop(q, dropId);
    if (!drop || drop.status === 'draft' || drop.status === 'cancelled') {
      throw fail.notFound('That drop is not available.');
    }
    if (!drop.release_at || !drop.closes_at) throw fail.notFound('That drop is not available.');

    const [{ sold }] = await q.query<{ sold: number }>(
      "select coalesce(sum(quantity), 0)::int as sold from reservations where drop_id = $1 and status = 'paid'",
      [dropId],
    );
    const phase = dropPhaseAt(deps, drop, sold);
    if (phase === 'waiting' || phase === 'reveal') throw fail.conflict('not_live', 'This drop has not been released yet.');
    if (phase === 'paused') throw fail.conflict('paused', 'This drop is temporarily paused.');
    if (phase === 'ended') throw fail.conflict('sale_ended', 'This sale has ended.');
    if (phase === 'sold') throw fail.conflict('sold_out', 'This drop is gone.');

    const now = deps.clock.now();
    // Lapsed holds are released before anything else. Otherwise a buyer whose hold ended, but
    // which no sweep has reached yet, would be handed that dead hold back as if it were live.
    await q.query(
      `update reservations set status = 'expired', status_reason = 'hold_ended', updated_at = $2
        where drop_id = $1 and status = 'held' and expires_at <= $2`,
      [dropId, now],
    );

    const [mine] = await q.query<{ id: string }>(
      `select id from reservations
        where drop_id = $1 and profile_id = $2 and status in ('held', 'paying', 'paid')
        for update`,
      [dropId, userId],
    );
    if (mine) return mine.id;
    const [{ active }] = await q.query<{ active: number }>(
      "select coalesce(sum(quantity), 0)::int as active from reservations where drop_id = $1 and status in ('held', 'paying', 'paid')",
      [dropId],
    );
    if (active + 1 > drop.quantity) {
      throw fail.conflict(
        'unit_held',
        'Another buyer is checking out this unit. It becomes available again if their hold ends.',
      );
    }

    const holdEnds = now.getTime() + deps.config.holdSeconds * 1000;
    const expiresAt = new Date(Math.min(holdEnds, drop.closes_at.getTime()));
    const [created] = await q.query<{ id: string }>(
      `insert into reservations (drop_id, profile_id, quantity, status, expires_at)
       values ($1, $2, 1, 'held', $3) returning id`,
      [dropId, userId, expiresAt],
    );
    return created.id;
  });

  return getReservation(deps, userId, reservationId);
}

async function loadRow(deps: Deps, userId: string, reservationId: string): Promise<ReservationJoinRow> {
  const [row] = await deps.db.query<ReservationJoinRow>(
    `select r.id, r.drop_id, r.status, r.status_reason, r.quantity, r.expires_at, r.late_accepted,
            d.sale_price_paise, p.id as product_id, p.name, p.condition, p.shipping_fee_paise,
            o.id as order_id, o.payment_status as order_payment_status,
            o.item_paise, o.shipping_paise, o.total_paise
       from reservations r
       join drops d on d.id = r.drop_id
       join products p on p.id = d.product_id
       left join orders o on o.reservation_id = r.id
      where r.id = $1 and r.profile_id = $2`,
    [reservationId, userId],
  );
  if (!row) throw fail.notFound('That reservation was not found.');
  return row;
}

export async function getReservation(deps: Deps, userId: string, reservationId: string): Promise<ReservationView> {
  const row = await loadRow(deps, userId, reservationId);
  const now = deps.clock.now();
  const priced = priceCheckout(
    { salePaise: row.sale_price_paise, shippingFeePaise: row.shipping_fee_paise, quantity: row.quantity },
    deps.config.currency,
  );
  // A hold past its expiry reads as expired even before a sweep has written that down.
  const lapsed = row.status === 'held' && row.expires_at.getTime() <= now.getTime();
  return {
    id: row.id,
    dropId: row.drop_id,
    status: lapsed ? 'expired' : row.status,
    statusReason: lapsed ? 'hold_ended' : row.status_reason,
    quantity: row.quantity,
    expiresAt: row.expires_at.toISOString(),
    serverNow: deps.clock.now().toISOString(),
    lateAccepted: row.late_accepted,
    product: { name: row.name, condition: row.condition, imageUrl: await imageUrlFor(deps, row.product_id) },
    pricing: {
      currency: deps.config.currency,
      itemPaise: row.item_paise ?? priced.itemPaise,
      shippingPaise: row.shipping_paise ?? priced.shippingPaise,
      totalPaise: row.total_paise ?? priced.totalPaise,
    },
    orderId: row.order_id,
    paymentStatus: row.order_payment_status,
  };
}

/** The buyer lets go of a hold they have not started paying for. */
export async function releaseReservation(deps: Deps, userId: string, reservationId: string): Promise<ReservationView> {
  await deps.db.tx(async (q) => {
    const [row] = await q.query<{ status: string }>(
      'select status from reservations where id = $1 and profile_id = $2 for update',
      [reservationId, userId],
    );
    if (!row) throw fail.notFound('That reservation was not found.');
    if (row.status === 'released' || row.status === 'expired') return;
    if (row.status !== 'held') {
      throw fail.conflict('cannot_release', 'Payment has started for this hold, so it cannot be released.');
    }
    await q.query(
      "update reservations set status = 'released', status_reason = 'buyer_released', updated_at = $2 where id = $1",
      [reservationId, deps.clock.now()],
    );
  });
  return getReservation(deps, userId, reservationId);
}
