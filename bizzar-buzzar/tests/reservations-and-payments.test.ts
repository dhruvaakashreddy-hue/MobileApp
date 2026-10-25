import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppError } from '../server/errors.ts';
import { checkoutSignature, webhookSignature } from '../server/adapters/razorpay.ts';
import type { ProviderPayment } from '../server/adapters/payments.ts';
import { createReservation, getReservation, releaseReservation } from '../server/services/reservations.ts';
import { createPaymentOrder, handleRazorpayWebhook, requestOrderRefund, verifyCheckoutCallback } from '../server/services/payments.ts';
import { sweep } from '../server/services/jobs.ts';
import { getDropState } from '../server/services/catalogue.ts';
import {
  createWorld,
  insertAddress,
  insertDrop,
  insertProduct,
  insertProfile,
  insertSession,
  MIN,
  SKIP_WITHOUT_DB,
  type World,
} from './helpers.ts';

const WEBHOOK_SECRET = 'test-webhook-secret';
const KEY_SECRET = 'test-key-secret';

/** A drop released a minute ago and closing in `closesInMin` minutes. Each test gets a fresh database, so windows never collide. */
async function liveDrop(world: World, options: { quantity?: number; closesInMin?: number } = {}): Promise<string> {
  const now = world.clock.now().getTime();
  const productId = await insertProduct(world.db);
  const sessionId = await insertSession(world.db, new Date(now - 10 * MIN), new Date(now + 3 * 60 * MIN));
  return insertDrop(world.db, {
    sessionId,
    productId,
    releaseAt: new Date(now - MIN),
    closesAt: new Date(now + (options.closesInMin ?? 4) * MIN),
    quantity: options.quantity ?? 1,
  });
}

async function buyer(world: World, email: string): Promise<{ id: string; addressId: string }> {
  const id = await insertProfile(world.db, email);
  const addressId = await insertAddress(world.db, id);
  return { id, addressId };
}

function captureEvent(payment: ProviderPayment, eventId = `evt_${randomUUID()}`): { raw: string; signature: string; eventId: string } {
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: payment.id,
          order_id: payment.orderId,
          amount: payment.amountPaise,
          currency: payment.currency,
          status: 'captured',
          fee: payment.feePaise,
          method: 'upi',
        },
      },
    },
  });
  return { raw, signature: webhookSignature(WEBHOOK_SECRET, raw), eventId };
}

async function deliverCapture(world: World, payment: ProviderPayment, eventId?: string) {
  const event = captureEvent(payment, eventId);
  return handleRazorpayWebhook(world.deps, event.raw, event.signature, eventId ?? event.eventId);
}

async function orderFor(world: World, reservationId: string) {
  const [row] = await world.db.query<{
    id: string;
    payment_status: string;
    provider_order_id: string;
    provider_payment_id: string | null;
    refunded_paise: number;
    total_paise: number;
  }>(
    `select id, payment_status, provider_order_id, provider_payment_id, refunded_paise, total_paise
       from orders where reservation_id = $1`,
    [reservationId],
  );
  return row;
}

async function reservationStatus(world: World, reservationId: string): Promise<string> {
  const [row] = await world.db.query<{ status: string }>('select status from reservations where id = $1', [reservationId]);
  return row.status;
}

async function count(world: World, sql: string, params: unknown[] = []): Promise<number> {
  const [row] = await world.db.query<{ count: number }>(sql, params);
  return row.count;
}

describe('one unit, many buyers', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld();
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('lets exactly one of many concurrent buyers reserve the single unit', async () => {
    const dropId = await liveDrop(world);
    const buyers = await Promise.all(Array.from({ length: 6 }, (_, i) => buyer(world, `race${i}@example.com`)));

    const results = await Promise.allSettled(buyers.map((b) => createReservation(world.deps, b.id, dropId)));

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    assert.equal(won.length, 1, 'exactly one reservation should succeed');
    assert.equal(lost.length, 5);
    for (const failure of lost) {
      assert.ok(failure.reason instanceof AppError);
      assert.equal(failure.reason.code, 'unit_held', 'losers are told the unit is held, not sold');
    }
    assert.equal(await count(world, "select count(*)::int as count from reservations where drop_id = $1 and status = 'held'", [dropId]), 1);
  });

  it('treats a repeat reserve from the same buyer as the same hold', async () => {
    const dropId = await liveDrop(world, { closesInMin: 6 });
    const alice = await buyer(world, 'repeat@example.com');
    const first = await createReservation(world.deps, alice.id, dropId);
    const second = await createReservation(world.deps, alice.id, dropId);
    assert.equal(second.id, first.id);
  });

  it('ends a hold at the sale close when that comes before the normal two minutes', async () => {
    const dropId = await liveDrop(world, { closesInMin: 0.5 });
    const alice = await buyer(world, 'short@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    assert.equal(new Date(hold.expiresAt).getTime(), world.clock.now().getTime() + 30_000);
  });

  it('gives the hold 120 seconds from the server clock, whatever the browser says', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'clock@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    assert.equal(new Date(hold.expiresAt).getTime() - world.clock.now().getTime(), 120_000);
  });

  it('frees the unit when a hold expires, so the next buyer can reserve', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'expire-a@example.com');
    const bob = await buyer(world, 'expire-b@example.com');
    await createReservation(world.deps, alice.id, dropId);
    await assert.rejects(createReservation(world.deps, bob.id, dropId), (e: AppError) => e.code === 'unit_held');

    world.clock.advance(121_000);
    const swept = await sweep(world.deps);
    assert.equal(swept.holdsExpired, 1);

    const bobHold = await createReservation(world.deps, bob.id, dropId);
    assert.equal(bobHold.status, 'held');
  });

  it('gives a buyer whose hold lapsed a fresh hold, even before any sweep has run', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'lapsed-again@example.com');
    const first = await createReservation(world.deps, alice.id, dropId);

    world.clock.advance(121_000); // the hold has lapsed, but no sweep has recorded it
    const view = await getDropState(world.deps, alice.id);
    assert.equal(view.availability?.yourHold, null, 'the public view no longer shows a lapsed hold');
    assert.equal((await getReservation(world.deps, alice.id, first.id)).status, 'expired');

    const again = await createReservation(world.deps, alice.id, dropId);
    assert.notEqual(again.id, first.id, 'the lapsed hold is not handed back');
    assert.equal(again.status, 'held');
    assert.equal(await reservationStatus(world, first.id), 'expired');
  });

  it('lets a buyer release a hold they have not started paying for', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'release-a@example.com');
    const bob = await buyer(world, 'release-b@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    assert.equal((await releaseReservation(world.deps, alice.id, hold.id)).status, 'released');
    assert.equal((await createReservation(world.deps, bob.id, dropId)).status, 'held');
  });

  it('refuses reservations before release and during the reveal, and after the sale closes', async () => {
    const now = world.clock.now().getTime();
    const product = await insertProduct(world.db);
    const session = await insertSession(world.db, new Date(now - 60 * MIN), new Date(now + 240 * MIN));
    const alice = await buyer(world, 'phase@example.com');
    const upcoming = await insertDrop(world.db, {
      sessionId: session,
      productId: product,
      releaseAt: new Date(now + 10 * MIN),
      closesAt: new Date(now + 15 * MIN),
      position: 1,
    });
    const ended = await insertDrop(world.db, {
      sessionId: session,
      productId: product,
      releaseAt: new Date(now - 20 * MIN),
      closesAt: new Date(now - 15 * MIN),
      position: 2,
    });
    const revealing = await insertDrop(world.db, {
      sessionId: session,
      productId: product,
      releaseAt: new Date(now + 20 * MIN),
      closesAt: new Date(now + 25 * MIN),
      position: 3,
    });

    await assert.rejects(createReservation(world.deps, alice.id, upcoming), (e: AppError) => e.code === 'not_live');
    await assert.rejects(createReservation(world.deps, alice.id, ended), (e: AppError) => e.code === 'sale_ended');

    // Move the third drop into its reveal window: releases in 20 s, so it is inside the 30 s countdown.
    await world.db.query('update drops set release_at = $2, closes_at = $3 where id = $1', [
      revealing,
      new Date(now + 20_000),
      new Date(now + 5 * MIN),
    ]);
    await assert.rejects(createReservation(world.deps, alice.id, revealing), (e: AppError) => e.code === 'not_live');
  });
});

describe('payments and the late-payment policy', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld();
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('creates the provider order for the server-calculated total: sale price plus delivery', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'amount-check@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    assert.equal(checkout.amountPaise, 149_900 + 4_900);
    assert.equal(checkout.currency, 'INR');
    assert.equal(checkout.paymentStatus, 'awaiting_payment');
  });

  it('marks an order paid from a verified webhook, and a redelivery changes nothing', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'pay-ok@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const payment = world.payments.capture(checkout.providerOrderId);

    const eventId = `evt_${randomUUID()}`;
    assert.equal(await deliverCapture(world, payment, eventId), 'processed');
    assert.equal(await deliverCapture(world, payment, eventId), 'duplicate', 'same event ID is a duplicate');
    assert.equal(await deliverCapture(world, payment, `evt_${randomUUID()}`), 'processed', 'a new event for the same payment is absorbed');

    const order = await orderFor(world, hold.id);
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.provider_payment_id, payment.id);
    assert.equal(await reservationStatus(world, hold.id), 'paid');
    assert.equal(await count(world, 'select count(*)::int as count from orders where drop_id = $1', [dropId]), 1);
  });

  it('rejects a tampered webhook whose signature no longer matches, and records nothing', async () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', amount: 100, currency: 'INR', status: 'captured' } } } });
    const signature = webhookSignature(WEBHOOK_SECRET, raw);
    const tampered = raw.replace('"amount":100', '"amount":1');
    await assert.rejects(handleRazorpayWebhook(world.deps, tampered, signature, 'evt_tampered'), (e: AppError) => e.status === 401);
    assert.equal(await count(world, "select count(*)::int as count from payment_events where provider_event_id = 'evt_tampered'"), 0);
  });

  it('does not mark an order paid from the browser callback alone; the provider must confirm the capture', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'callback@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);

    // The signature is genuine, but the provider reports the payment as failed.
    const failedPaymentId = 'pay_failed_at_provider';
    world.payments.payments.set(failedPaymentId, {
      id: failedPaymentId,
      orderId: checkout.providerOrderId,
      amountPaise: checkout.amountPaise,
      currency: 'INR',
      status: 'failed',
      feePaise: null,
      method: 'upi',
    });
    const result = await verifyCheckoutCallback(world.deps, alice.id, {
      providerOrderId: checkout.providerOrderId,
      providerPaymentId: failedPaymentId,
      signature: checkoutSignature(KEY_SECRET, checkout.providerOrderId, failedPaymentId),
    });
    assert.equal(result.paymentStatus, 'awaiting_payment');
  });

  it('refuses a checkout callback with a bad signature', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'badsig@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const payment = world.payments.capture(checkout.providerOrderId);
    await assert.rejects(
      verifyCheckoutCallback(world.deps, alice.id, {
        providerOrderId: checkout.providerOrderId,
        providerPaymentId: payment.id,
        signature: 'f'.repeat(64),
      }),
      (e: AppError) => e.code === 'signature_invalid',
    );
  });

  it('confirms a genuine checkout callback once the provider shows the capture', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'callback-ok@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const payment = world.payments.capture(checkout.providerOrderId);
    const result = await verifyCheckoutCallback(world.deps, alice.id, {
      providerOrderId: checkout.providerOrderId,
      providerPaymentId: payment.id,
      signature: checkoutSignature(KEY_SECRET, checkout.providerOrderId, payment.id),
    });
    assert.equal(result.paymentStatus, 'paid');
  });

  it('refunds a second capture on a paid order rather than selling the unit twice', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'double@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const first = world.payments.capture(checkout.providerOrderId);
    const second = world.payments.capture(checkout.providerOrderId);
    await deliverCapture(world, first);
    await deliverCapture(world, second);

    const order = await orderFor(world, hold.id);
    assert.equal(order.provider_payment_id, first.id, 'the first capture is the order payment');
    assert.equal(order.payment_status, 'paid');
    const refunds = [...world.payments.refunds.values()].filter((r) => r.paymentId === second.id);
    assert.equal(refunds.length, 1, 'the duplicate capture is refunded');
    assert.equal(await count(world, "select count(*)::int as count from reconciliation_cases where kind = 'duplicate_payment'"), 1);
  });

  it('opens a case and does not mark paid when the captured amount is wrong', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'amount@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const payment = world.payments.capture(checkout.providerOrderId, { amountPaise: 100 });
    assert.equal(await deliverCapture(world, payment), 'processed');
    assert.notEqual((await orderFor(world, hold.id)).payment_status, 'paid');
    assert.equal(await count(world, "select count(*)::int as count from reconciliation_cases where kind = 'amount_mismatch'"), 1);
  });

  it('applies concurrent deliveries of one event exactly once', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'concurrent@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    const event = captureEvent(world.payments.capture(checkout.providerOrderId));
    const outcomes = await Promise.all([
      handleRazorpayWebhook(world.deps, event.raw, event.signature, event.eventId),
      handleRazorpayWebhook(world.deps, event.raw, event.signature, event.eventId),
      handleRazorpayWebhook(world.deps, event.raw, event.signature, event.eventId),
    ]);
    assert.equal(outcomes.filter((o) => o === 'processed').length, 1);
    assert.equal(outcomes.filter((o) => o === 'duplicate').length, 2);
  });

  it('keeps a checkout whose payment is still in flight, and accepts a capture during the grace period', async () => {
    const dropId = await liveDrop(world, { closesInMin: 40 });
    const alice = await buyer(world, 'grace@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);

    world.clock.advance(150_000); // past the 120 s hold, but inside the 10 minute grace period
    const summary = await sweep(world.deps);
    assert.equal(summary.paymentsRecycled, 0, 'nothing is recycled before the provider has been asked');
    assert.equal(summary.paymentsDeferred, 1);
    assert.equal(await reservationStatus(world, hold.id), 'paying');

    await deliverCapture(world, world.payments.capture(checkout.providerOrderId));
    assert.equal((await orderFor(world, hold.id)).payment_status, 'paid', 'a capture during grace still belongs to this buyer');
  });

  it('recycles an abandoned checkout after the grace period, and a later capture is refunded', async () => {
    const dropId = await liveDrop(world, { closesInMin: 60 });
    const alice = await buyer(world, 'abandon@example.com');
    const bob = await buyer(world, 'abandon-bob@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);

    world.clock.advance(13 * MIN);
    const summary = await sweep(world.deps);
    assert.equal(summary.paymentsRecycled, 1);
    assert.equal(await reservationStatus(world, hold.id), 'expired');
    assert.equal((await orderFor(world, hold.id)).payment_status, 'abandoned');

    const bobHold = await createReservation(world.deps, bob.id, dropId);
    const bobCheckout = await createPaymentOrder(world.deps, bob.id, bobHold.id, bob.addressId);
    await deliverCapture(world, world.payments.capture(bobCheckout.providerOrderId));
    assert.equal((await orderFor(world, bobHold.id)).payment_status, 'paid');

    // Alice's payment finally lands, after her unit went to Bob.
    const late = world.payments.capture(checkout.providerOrderId);
    assert.equal(await deliverCapture(world, late), 'processed');
    const aliceOrder = await orderFor(world, hold.id);
    assert.equal(aliceOrder.payment_status, 'refund_pending');
    const refund = [...world.payments.refunds.values()].find((r) => r.paymentId === late.id);
    assert.ok(refund, 'a refund was requested with the provider');
    assert.equal(refund.amountPaise, checkout.amountPaise);
    assert.equal(await count(world, "select count(*)::int as count from reconciliation_cases where kind = 'late_payment_after_reassignment'"), 1);

    assert.equal((await orderFor(world, bobHold.id)).payment_status, 'paid', 'the unit is still sold once, to Bob');
    assert.equal(await count(world, "select count(*)::int as count from orders where drop_id = $1 and payment_status = 'paid'", [dropId]), 1);
  });

  it('accepts a late capture when the unit is still free and the sale is open', async () => {
    const dropId = await liveDrop(world, { closesInMin: 60 });
    const alice = await buyer(world, 'late-free@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    world.clock.advance(13 * MIN);
    await sweep(world.deps);
    assert.equal(await reservationStatus(world, hold.id), 'expired');

    await deliverCapture(world, world.payments.capture(checkout.providerOrderId));
    assert.equal((await orderFor(world, hold.id)).payment_status, 'paid');
    assert.equal(await reservationStatus(world, hold.id), 'paid');
    assert.equal(await count(world, 'select count(*)::int as count from reservations where id = $1 and late_accepted', [hold.id]), 1);
  });

  it('applies a refund webhook once, however often it is delivered', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'refund-hook@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    const checkout = await createPaymentOrder(world.deps, alice.id, hold.id, alice.addressId);
    await deliverCapture(world, world.payments.capture(checkout.providerOrderId));

    const order = await orderFor(world, hold.id);
    const admin = await insertProfile(world.db, 'refund-admin@example.com', { admin: true });
    const refundId = await requestOrderRefund(world.deps, admin, order.id, { reason: 'Customer asked' });

    const providerRefund = [...world.payments.refunds.values()].find((r) => r.notes.refund_id === refundId);
    assert.ok(providerRefund);
    const settled = world.payments.settleRefund(providerRefund.id, 'processed');
    const raw = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: settled.id, payment_id: settled.paymentId, amount: settled.amountPaise, currency: 'INR', status: 'processed', notes: settled.notes },
        },
      },
    });
    const signature = webhookSignature(WEBHOOK_SECRET, raw);
    await handleRazorpayWebhook(world.deps, raw, signature, `evt_${randomUUID()}`);
    await handleRazorpayWebhook(world.deps, raw, signature, `evt_${randomUUID()}`);

    const after = await orderFor(world, hold.id);
    assert.equal(after.refunded_paise, checkout.amountPaise, 'counted once, not twice');
    assert.equal(after.payment_status, 'refunded');
  });

  it('keeps reservations private: another buyer cannot read them', async () => {
    const dropId = await liveDrop(world, { closesInMin: 20 });
    const alice = await buyer(world, 'owner@example.com');
    const stranger = await buyer(world, 'stranger@example.com');
    const hold = await createReservation(world.deps, alice.id, dropId);
    assert.equal((await getReservation(world.deps, alice.id, hold.id)).status, 'held');
    await assert.rejects(getReservation(world.deps, stranger.id, hold.id), (e: AppError) => e.status === 404);
  });
});
