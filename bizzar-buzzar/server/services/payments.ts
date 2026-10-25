import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/client.ts';
import { PG, pgErrorCode } from '../db/client.ts';
import { AppError, fail } from '../errors.ts';
import { sha256Hex } from '../crypto.ts';
import type { ProviderPayment } from '../adapters/payments.ts';
import type { OrderPaymentStatus } from '../../shared/api-types.ts';
import { priceCheckout } from '../../shared/pricing.ts';
import { audit } from './audit.ts';
import { lockDrop } from './reservations.ts';

export interface CheckoutOrder {
  orderId: string;
  orderNo: number;
  paymentStatus: OrderPaymentStatus;
  providerOrderId: string;
  keyId: string | null;
  amountPaise: number;
  currency: string;
  brand: string;
  prefill: { name: string; email: string; contact: string };
}

interface OrderRow {
  id: string;
  order_no: number;
  reservation_id: string;
  drop_id: string;
  quantity: number;
  currency: string;
  total_paise: number;
  refunded_paise: number;
  payment_status: OrderPaymentStatus;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  address: { fullName: string; phone: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function openCase(
  q: Queryable,
  item: {
    kind:
      | 'late_payment_after_reassignment'
      | 'duplicate_payment'
      | 'amount_mismatch'
      | 'unknown_order'
      | 'refund_failed'
      | 'uncertain_payment';
    orderId?: string | null;
    reservationId?: string | null;
    providerPaymentId?: string | null;
    amountPaise?: number | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await q.query(
    `insert into reconciliation_cases (kind, order_id, reservation_id, provider_payment_id, amount_paise, details)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      item.kind,
      item.orderId ?? null,
      item.reservationId ?? null,
      item.providerPaymentId ?? null,
      item.amountPaise ?? null,
      JSON.stringify(item.details ?? {}),
    ],
  );
}

async function insertRefund(
  q: Queryable,
  input: {
    orderId: string;
    providerPaymentId: string;
    kind: 'order' | 'duplicate';
    amountPaise: number;
    reason: string;
    requestedBy: string | null;
  },
): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `insert into refunds (order_id, provider_payment_id, kind, amount_paise, reason, status, requested_by)
     values ($1, $2, $3, $4, $5, 'requested', $6) returning id`,
    [input.orderId, input.providerPaymentId, input.kind, input.amountPaise, input.reason, input.requestedBy],
  );
  return row.id;
}

/**
 * Creates the provider order for a live hold and returns what the browser needs to open
 * checkout. The amount is calculated here from the database, never taken from the request.
 * Everything runs in one transaction, so a provider failure leaves no half-created order.
 */
export async function createPaymentOrder(
  deps: Deps,
  userId: string,
  reservationId: string,
  addressId: string,
): Promise<CheckoutOrder> {
  return deps.db.tx(async (q) => {
    const [owned] = await q.query<{ drop_id: string }>(
      'select drop_id from reservations where id = $1 and profile_id = $2',
      [reservationId, userId],
    );
    if (!owned) throw fail.notFound('That reservation was not found.');

    // Drop first, then reservation: the same order every reservation path uses.
    const drop = await lockDrop(q, owned.drop_id);
    if (!drop) throw fail.notFound('That drop is not available.');

    const [reservation] = await q.query<{ id: string; status: string; expires_at: Date; quantity: number }>(
      'select id, status, expires_at, quantity from reservations where id = $1 for update',
      [reservationId],
    );

    const [existing] = await q.query<OrderRow>('select * from orders where reservation_id = $1', [reservationId]);
    const [profile] = await q.query<{ email: string }>('select email from profiles where id = $1', [userId]);

    if (existing) {
      if (!existing.provider_order_id) throw fail.conflict('checkout_incomplete', 'Checkout is still being set up. Try again.');
      return checkoutFor(deps, existing, profile.email);
    }

    const now = deps.clock.now();
    if (reservation.status !== 'held') {
      throw fail.conflict('hold_not_active', 'This hold is no longer active.', { status: reservation.status });
    }
    if (reservation.expires_at.getTime() <= now.getTime()) {
      throw fail.conflict('hold_expired', 'Your hold has ended. Check the drop again to see if the unit is still free.');
    }

    const [address] = await q.query<{
      full_name: string;
      phone: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      pincode: string;
      country_code: string;
    }>(
      'select full_name, phone, line1, line2, city, state, pincode, country_code from addresses where id = $1 and profile_id = $2 and deleted_at is null',
      [addressId, userId],
    );
    if (!address) throw fail.badRequest('address_not_found', 'Choose a delivery address.');

    const [product] = await q.query<{
      sku: string;
      name: string;
      condition: string;
      category: string;
      warranty_text: string;
      return_policy_text: string;
      shipping_eligible: boolean;
      shipping_fee_paise: number;
      procurement_cost_paise: number | null;
      shipping_cost_paise: number | null;
      other_cost_paise: number | null;
    }>(
      `select sku, name, condition, category, warranty_text, return_policy_text, shipping_eligible,
              shipping_fee_paise, procurement_cost_paise, shipping_cost_paise, other_cost_paise
         from products where id = $1`,
      [drop.product_id],
    );

    if (!product.shipping_eligible || !deps.config.shippingCountries.includes(address.country_code)) {
      throw fail.badRequest('not_serviceable', 'This item does not ship to that address.');
    }
    if (!/^\d{6}$/.test(address.pincode)) throw fail.badRequest('invalid_pincode', 'Enter a valid 6-digit pincode.');

    const price = priceCheckout(
      { salePaise: drop.sale_price_paise, shippingFeePaise: product.shipping_fee_paise, quantity: reservation.quantity },
      deps.config.currency,
    );

    const [order] = await q.query<OrderRow>(
      `insert into orders (
         reservation_id, profile_id, drop_id, product_id, quantity, currency,
         item_paise, shipping_paise, total_paise, address, product_snapshot,
         cost_procurement_paise, cost_shipping_paise, cost_other_paise
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning *`,
      [
        reservationId,
        userId,
        drop.id,
        drop.product_id,
        reservation.quantity,
        price.currency,
        price.itemPaise,
        price.shippingPaise,
        price.totalPaise,
        JSON.stringify({
          fullName: address.full_name,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          countryCode: address.country_code,
        }),
        JSON.stringify({
          sku: product.sku,
          name: product.name,
          condition: product.condition,
          category: product.category,
          warrantyText: product.warranty_text,
          returnPolicyText: product.return_policy_text,
        }),
        product.procurement_cost_paise,
        product.shipping_cost_paise,
        product.other_cost_paise,
      ],
    );

    // Inside the transaction and under the reservation lock, so two concurrent checkout
    // requests cannot both create a provider order.
    const providerOrder = await deps.payments.createOrder({
      amountPaise: price.totalPaise,
      currency: price.currency,
      receipt: `r_${reservationId}`,
      notes: { order_id: order.id, reservation_id: reservationId },
    });
    const [stored] = await q.query<OrderRow>(
      'update orders set provider_order_id = $2, updated_at = $3 where id = $1 returning *',
      [order.id, providerOrder.id, now],
    );
    await q.query("update reservations set status = 'paying', status_reason = 'checkout_started', updated_at = $2 where id = $1", [
      reservationId,
      now,
    ]);
    return checkoutFor(deps, stored, profile.email);
  });
}

function checkoutFor(deps: Deps, order: OrderRow, email: string): CheckoutOrder {
  return {
    orderId: order.id,
    orderNo: order.order_no,
    paymentStatus: order.payment_status,
    providerOrderId: order.provider_order_id ?? '',
    keyId: deps.payments.publishableKey,
    amountPaise: order.total_paise,
    currency: order.currency,
    brand: deps.config.brand,
    prefill: { name: order.address.fullName, email, contact: order.address.phone },
  };
}

/**
 * Checks the browser's "payment succeeded" callback. The signature must verify, and the
 * provider must confirm the capture. The callback alone never marks an order paid.
 */
export async function verifyCheckoutCallback(
  deps: Deps,
  userId: string,
  input: { providerOrderId: string; providerPaymentId: string; signature: string },
): Promise<{ orderId: string; paymentStatus: OrderPaymentStatus }> {
  const signatureValid = deps.payments.verifyCheckoutSignature({
    orderId: input.providerOrderId,
    paymentId: input.providerPaymentId,
    signature: input.signature,
  });
  if (!signatureValid) {
    throw fail.badRequest('signature_invalid', 'We could not verify that payment. It has not been charged twice.');
  }
  const [owned] = await deps.db.query<{ id: string; profile_id: string }>(
    'select id, profile_id from orders where provider_order_id = $1',
    [input.providerOrderId],
  );
  if (!owned || owned.profile_id !== userId) throw fail.notFound('That order was not found.');

  const payment = await deps.payments.fetchPayment(input.providerPaymentId);
  if (payment.orderId !== input.providerOrderId) {
    throw fail.badRequest('payment_mismatch', 'That payment does not belong to this order.');
  }
  if (payment.status === 'captured') {
    await settleCapturedPayment(deps, `checkout:${payment.id}`, 'checkout.verified', payment);
  }
  const status = await orderPaymentStatus(deps, owned.id);
  return { orderId: owned.id, paymentStatus: status };
}

export async function orderPaymentStatus(deps: Deps, orderId: string): Promise<OrderPaymentStatus> {
  const [row] = await deps.db.query<{ payment_status: OrderPaymentStatus }>(
    'select payment_status from orders where id = $1',
    [orderId],
  );
  if (!row) throw fail.notFound('That order was not found.');
  return row.payment_status;
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/**
 * Handles a Razorpay webhook. The signature is verified against the raw body first. Each
 * provider event is recorded once, so redelivery is harmless. A processing error rolls back
 * the record, so Razorpay's retry gets a clean second attempt.
 */
export async function handleRazorpayWebhook(
  deps: Deps,
  rawBody: string,
  signature: string | null,
  providerEventIdHeader: string | null,
): Promise<WebhookOutcome> {
  if (!signature || !deps.payments.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(401, 'invalid_signature', 'Invalid webhook signature.');
  }

  let event: { event: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw fail.badRequest('invalid_json', 'The webhook body is not valid JSON.');
  }
  const providerEventId = providerEventIdHeader || `body:${sha256Hex(rawBody)}`;

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const entity = event.payload?.payment?.entity;
    if (!entity) return 'ignored';
    const payment = toProviderPayment(entity);
    return settleCapturedPayment(deps, providerEventId, event.event, payment);
  }

  if (event.event === 'refund.processed' || event.event === 'refund.failed') {
    const entity = event.payload?.refund?.entity;
    if (!entity) return 'ignored';
    return settleRefundEvent(deps, providerEventId, event.event, entity);
  }

  // Other events are recorded so an operator can see them, and change nothing.
  await deps.db.tx(async (q) => {
    await q.query(
      `insert into payment_events (provider_event_id, event_type, outcome, processed_at)
       values ($1, $2, 'ignored', $3) on conflict (provider_event_id) do nothing`,
      [providerEventId, event.event, deps.clock.now()],
    );
  });
  return 'ignored';
}

function toProviderPayment(entity: Record<string, unknown>): ProviderPayment {
  return {
    id: String(entity.id),
    orderId: typeof entity.order_id === 'string' ? entity.order_id : null,
    amountPaise: Number(entity.amount),
    currency: String(entity.currency),
    status: entity.status as ProviderPayment['status'],
    feePaise: typeof entity.fee === 'number' ? entity.fee : null,
    method: typeof entity.method === 'string' ? entity.method : null,
  };
}

/**
 * Records a provider event and applies a captured payment in one transaction. Duplicate
 * event IDs are detected by the unique key, and duplicate payments by the order's
 * provider_payment_id. Refunds are called after the commit, so the provider never runs
 * while the database locks are held.
 */
export async function settleCapturedPayment(
  deps: Deps,
  providerEventId: string,
  eventType: string,
  payment: ProviderPayment,
): Promise<WebhookOutcome> {
  const result = await deps.db.tx(async (q) => {
    const inserted = await q.query<{ id: string }>(
      `insert into payment_events (provider_event_id, event_type, provider_order_id, provider_payment_id, amount_paise, currency)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (provider_event_id) do nothing
       returning id`,
      [providerEventId, eventType, payment.orderId, payment.id, payment.amountPaise, payment.currency],
    );
    // The event ID was seen before: a redelivery.
    if (inserted.length === 0) return { eventSeen: true, outcome: 'duplicate', refundId: null };

    // A new event for a payment already applied is still recorded, and changes nothing.
    const applied = await applyCapturedInTx(q, deps, payment);
    await q.query('update payment_events set outcome = $2, processed_at = $3 where id = $1', [
      inserted[0].id,
      applied.outcome,
      deps.clock.now(),
    ]);
    return { eventSeen: false, ...applied };
  });

  if (result.refundId) await executeRefund(deps, result.refundId);
  return result.eventSeen ? 'duplicate' : 'processed';
}

interface Applied {
  outcome: string;
  refundId: string | null;
}

async function applyCapturedInTx(q: Queryable, deps: Deps, payment: ProviderPayment): Promise<Applied> {
  if (!payment.orderId) return { outcome: 'ignored', refundId: null };

  const [link] = await q.query<{ order_id: string; drop_id: string }>(
    'select id as order_id, drop_id from orders where provider_order_id = $1',
    [payment.orderId],
  );
  if (!link) {
    await openCase(q, {
      kind: 'unknown_order',
      providerPaymentId: payment.id,
      amountPaise: payment.amountPaise,
      details: { providerOrderId: payment.orderId },
    });
    return { outcome: 'unknown_order', refundId: null };
  }

  const drop = await lockDrop(q, link.drop_id);
  if (!drop) throw fail.notFound('The drop for this order no longer exists.');
  const [order] = await q.query<OrderRow & { reservation_status: string; reservation_quantity: number }>(
    `select o.*, r.status as reservation_status, r.quantity as reservation_quantity
       from orders o
       join reservations r on r.id = o.reservation_id
      where o.id = $1
      for update of o, r`,
    [link.order_id],
  );
  const now = deps.clock.now();

  if (order.provider_payment_id === payment.id) return { outcome: 'duplicate', refundId: null };

  if (payment.amountPaise !== order.total_paise || payment.currency !== order.currency) {
    await q.query(
      "update orders set payment_status = 'needs_review', updated_at = $2 where id = $1 and provider_payment_id is null",
      [order.id, now],
    );
    await openCase(q, {
      kind: 'amount_mismatch',
      orderId: order.id,
      providerPaymentId: payment.id,
      amountPaise: payment.amountPaise,
      details: { expectedPaise: order.total_paise, expectedCurrency: order.currency, receivedCurrency: payment.currency },
    });
    return { outcome: 'amount_mismatch', refundId: null };
  }

  // A second capture on an order that is already paid. Return the money, and never a second unit.
  if (order.provider_payment_id) {
    const refundId = await insertRefund(q, {
      orderId: order.id,
      providerPaymentId: payment.id,
      kind: 'duplicate',
      amountPaise: payment.amountPaise,
      reason: 'Duplicate capture on an order that is already paid.',
      requestedBy: null,
    });
    await openCase(q, {
      kind: 'duplicate_payment',
      orderId: order.id,
      providerPaymentId: payment.id,
      amountPaise: payment.amountPaise,
      details: { refundId },
    });
    return { outcome: 'duplicate_refund_requested', refundId };
  }

  const holdStillOurs = order.reservation_status === 'paying' || order.reservation_status === 'held';
  if (holdStillOurs && drop.status !== 'cancelled') {
    await markPaid(q, order.reservation_id, order.id, payment, now, false);
    return { outcome: 'paid', refundId: null };
  }

  // Reservation recycled: expired, released or cancelled. Accept only if the unit is still
  // free and the sale is still open. Otherwise refund. The unit is never sold twice.
  const [{ active }] = await q.query<{ active: number }>(
    "select coalesce(sum(quantity), 0)::int as active from reservations where drop_id = $1 and status in ('held', 'paying', 'paid')",
    [drop.id],
  );
  const saleOpen = drop.status === 'scheduled' && drop.closes_at !== null && now.getTime() < drop.closes_at.getTime();
  if (saleOpen && active + order.reservation_quantity <= drop.quantity) {
    await markPaid(q, order.reservation_id, order.id, payment, now, true);
    return { outcome: 'late_accepted', refundId: null };
  }

  const refundId = await insertRefund(q, {
    orderId: order.id,
    providerPaymentId: payment.id,
    kind: 'order',
    amountPaise: payment.amountPaise,
    reason: 'Payment arrived after the hold ended and the unit was no longer available.',
    requestedBy: null,
  });
  await q.query(
    `update orders set provider_payment_id = $2, payment_status = 'refund_pending', paid_at = $3, updated_at = $3
      where id = $1`,
    [order.id, payment.id, now],
  );
  await openCase(q, {
    kind: 'late_payment_after_reassignment',
    orderId: order.id,
    reservationId: order.reservation_id,
    providerPaymentId: payment.id,
    amountPaise: payment.amountPaise,
    details: { refundId, dropStatus: drop.status, reservationStatus: order.reservation_status, activeUnits: active },
  });
  return { outcome: 'refund_requested', refundId };
}

async function markPaid(
  q: Queryable,
  reservationId: string,
  orderId: string,
  payment: ProviderPayment,
  now: Date,
  lateAccepted: boolean,
): Promise<void> {
  await q.query(
    `update orders set provider_payment_id = $2, payment_status = 'paid', paid_at = $3,
            payment_fee_paise = $4, updated_at = $3
      where id = $1`,
    [orderId, payment.id, now, payment.feePaise],
  );
  await q.query(
    `update reservations set status = 'paid', status_reason = $2, late_accepted = $3, updated_at = $4
      where id = $1`,
    [reservationId, lateAccepted ? 'late_payment_accepted' : 'paid', lateAccepted, now],
  );
}

/** Sends a requested refund to the provider and records the result. Safe to call again for the same refund. */
export async function executeRefund(deps: Deps, refundId: string): Promise<void> {
  const [refund] = await deps.db.query<{
    id: string;
    order_id: string;
    provider_payment_id: string;
    kind: 'order' | 'duplicate';
    amount_paise: number;
    status: string;
  }>('select id, order_id, provider_payment_id, kind, amount_paise, status from refunds where id = $1', [refundId]);
  if (!refund) return;

  // Claim the refund atomically. Two callers racing here cannot both reach the provider.
  // The 'pending' mark also lets the retry sweep see an attempt that crashed mid-call.
  const claimed = await deps.db.query(
    "update refunds set status = 'pending', updated_at = $2 where id = $1 and status = 'requested' returning id",
    [refundId, deps.clock.now()],
  );
  if (claimed.length === 0) return;

  try {
    const providerRefund = await deps.payments.createRefund({
      paymentId: refund.provider_payment_id,
      amountPaise: refund.amount_paise,
      notes: { refund_id: refund.id, order_id: refund.order_id },
    });
    await deps.db.tx(async (q) => {
      await q.query('update refunds set provider_refund_id = $2, updated_at = $3 where id = $1', [
        refund.id,
        providerRefund.id,
        deps.clock.now(),
      ]);
      if (providerRefund.status === 'processed') await finishRefund(q, deps, refund.id);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown refund error';
    await deps.db.tx(async (q) => {
      await q.query("update refunds set status = 'failed', error = $2, updated_at = $3 where id = $1", [
        refund.id,
        message,
        deps.clock.now(),
      ]);
      await openCase(q, {
        kind: 'refund_failed',
        orderId: refund.order_id,
        providerPaymentId: refund.provider_payment_id,
        amountPaise: refund.amount_paise,
        details: { refundId: refund.id, message },
      });
    });
  }
}

/** Marks a refund processed exactly once, however many times the event or sync call arrives. */
async function finishRefund(q: Queryable, deps: Deps, refundId: string): Promise<void> {
  const now = deps.clock.now();
  const updated = await q.query<{ order_id: string; kind: string; amount_paise: number }>(
    `update refunds set status = 'processed', updated_at = $2
      where id = $1 and status <> 'processed'
      returning order_id, kind, amount_paise`,
    [refundId, now],
  );
  if (updated.length === 0) return;
  const [refund] = updated;
  if (refund.kind !== 'order') return;
  await q.query(
    `update orders
        set refunded_paise = refunded_paise + $2,
            payment_status = case when refunded_paise + $2 >= total_paise then 'refunded' else 'partially_refunded' end,
            updated_at = $3
      where id = $1`,
    [refund.order_id, refund.amount_paise, now],
  );
}

async function settleRefundEvent(
  deps: Deps,
  providerEventId: string,
  eventType: string,
  entity: Record<string, unknown>,
): Promise<WebhookOutcome> {
  const notes = (entity.notes ?? {}) as Record<string, unknown>;
  const refundRowId = typeof notes.refund_id === 'string' && UUID.test(notes.refund_id) ? notes.refund_id : null;
  const providerRefundId = String(entity.id);

  const result = await deps.db.tx(async (q) => {
    const inserted = await q.query(
      `insert into payment_events (provider_event_id, event_type, provider_payment_id, amount_paise, currency)
       values ($1, $2, $3, $4, $5) on conflict (provider_event_id) do nothing returning id`,
      [providerEventId, eventType, String(entity.payment_id), Number(entity.amount), String(entity.currency ?? 'INR')],
    );
    if (inserted.length === 0) return 'duplicate' as const;

    const [refund] = await q.query<{ id: string; order_id: string; provider_payment_id: string; amount_paise: number }>(
      'select id, order_id, provider_payment_id, amount_paise from refunds where provider_refund_id = $1 or id = $2',
      [providerRefundId, refundRowId],
    );
    let outcome = 'unmatched_refund';
    if (refund && eventType === 'refund.processed') {
      await finishRefund(q, deps, refund.id);
      outcome = 'refund_processed';
    } else if (refund && eventType === 'refund.failed') {
      await q.query("update refunds set status = 'failed', error = 'Provider reported refund failure.', updated_at = $2 where id = $1 and status <> 'processed'", [
        refund.id,
        deps.clock.now(),
      ]);
      await openCase(q, {
        kind: 'refund_failed',
        orderId: refund.order_id,
        providerPaymentId: refund.provider_payment_id,
        amountPaise: refund.amount_paise,
        details: { refundId: refund.id, providerRefundId },
      });
      outcome = 'refund_failed_recorded';
    } else if (!refund) {
      await openCase(q, {
        kind: 'refund_failed',
        providerPaymentId: String(entity.payment_id),
        amountPaise: Number(entity.amount),
        details: { providerRefundId, eventType, reason: 'No matching refund record' },
      });
    }
    await q.query('update payment_events set outcome = $2, processed_at = $3 where provider_event_id = $1', [
      providerEventId,
      outcome,
      deps.clock.now(),
    ]);
    return 'processed' as const;
  });
  return result;
}

/** Admin action: refunds an order's remaining amount, or a stated part of it, through the provider. */
export async function requestOrderRefund(
  deps: Deps,
  adminId: string,
  orderId: string,
  input: { amountPaise?: number; reason: string },
): Promise<string> {
  const refundId = await deps.db.tx(async (q) => {
    const [order] = await q.query<OrderRow>('select * from orders where id = $1 for update', [orderId]);
    if (!order) throw fail.notFound('That order was not found.');
    if (!order.provider_payment_id) throw fail.conflict('not_paid', 'This order has no captured payment to refund.');
    const refundable = order.total_paise - order.refunded_paise;
    const amount = input.amountPaise ?? refundable;
    if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
      throw fail.badRequest('invalid_amount', `The refund must be between 1 and ${refundable} paise.`);
    }
    let id: string;
    try {
      id = await insertRefund(q, {
        orderId,
        providerPaymentId: order.provider_payment_id,
        kind: 'order',
        amountPaise: amount,
        reason: input.reason,
        requestedBy: adminId,
      });
    } catch (error) {
      if (pgErrorCode(error) === PG.uniqueViolation) {
        throw fail.conflict('refund_in_progress', 'A refund for this payment is already in progress.');
      }
      throw error;
    }
    await q.query("update orders set payment_status = 'refund_pending', updated_at = $2 where id = $1", [
      orderId,
      deps.clock.now(),
    ]);
    await audit(q, {
      actorId: adminId,
      actorKind: 'admin',
      action: 'refund.requested',
      entityType: 'order',
      entityId: orderId,
      after: { refundId: id, amountPaise: amount, reason: input.reason },
    });
    return id;
  });
  await executeRefund(deps, refundId);
  return refundId;
}

export { openCase, insertRefund };
