import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppError } from '../server/errors.ts';
import type { PushOutcome, PushTarget } from '../server/adapters/push.ts';
import {
  addOrderNote,
  cancelDrop,
  createDrop,
  createProduct,
  createSession,
  inspectDrop,
  scheduleDrop,
  setDropPaused,
  setSessionStatus,
  updateDrop,
  type ProductInput,
} from '../server/services/admin.ts';
import { createPaymentOrder, handleRazorpayWebhook } from '../server/services/payments.ts';
import { createReservation } from '../server/services/reservations.ts';
import { dispatchDueJobs, queueDropAlert, sweep } from '../server/services/jobs.ts';
import { getDropState } from '../server/services/catalogue.ts';
import { webhookSignature } from '../server/adapters/razorpay.ts';
import { createWorld, insertAddress, insertProfile, MIN, SKIP_WITHOUT_DB, type World } from './helpers.ts';

const adminInput = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  sku: `SKU-${randomUUID().slice(0, 8)}`,
  name: 'Studio Wireless Headphones',
  description: 'Silver over-ear headphones',
  category: 'Audio',
  condition: 'new',
  specs: [{ label: 'Type', value: 'Over-ear' }],
  warrantyText: '1 year brand warranty',
  returnPolicyText: '7 day return on unused items',
  shippingEligible: true,
  shippingFeePaise: 4900,
  procurementCostPaise: 90_000,
  shippingCostPaise: 4_000,
  otherCostPaise: 0,
  isSample: true,
  ...overrides,
});

describe('administration: products and validation', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  let admin: string;
  beforeEach(async () => {
    world = await createWorld();
    admin = await insertProfile(world.db, 'ops@example.com', { admin: true });
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('refuses a product that cannot state its warranty and return terms', async () => {
    await assert.rejects(createProduct(world.deps, admin, adminInput({ warrantyText: '' })), (e: AppError) => e.code === 'invalid_product');
  });

  it('refuses a negative or fractional cost', async () => {
    await assert.rejects(createProduct(world.deps, admin, adminInput({ shippingCostPaise: -1 })), (e: AppError) => e.code === 'invalid_amount');
    await assert.rejects(createProduct(world.deps, admin, adminInput({ procurementCostPaise: 10.5 })), (e: AppError) => e.code === 'invalid_amount');
  });

  it('refuses a price reference with no evidence', async () => {
    const productId = await createProduct(world.deps, admin, adminInput());
    const { addPriceReference } = await import('../server/services/admin.ts');
    await assert.rejects(
      addPriceReference(world.deps, admin, productId, {
        condition: 'new',
        amountPaise: 499_900,
        sourceLabel: '',
        sourceUrl: null,
        evidenceNote: '',
        capturedAt: new Date(),
      }),
      (e: AppError) => e.code === 'evidence_required',
    );
  });

  it('records every change in the audit log, in the same transaction', async () => {
    const productId = await createProduct(world.deps, admin, adminInput());
    const [entry] = await world.db.query<{ action: string; actor_kind: string }>(
      "select action, actor_kind from audit_log where entity_id = $1 and action = 'product.created'",
      [productId],
    );
    assert.equal(entry.actor_kind, 'admin');
  });
});

describe('administration: scheduling rules', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  let admin: string;
  let productId: string;
  beforeEach(async () => {
    world = await createWorld(new Date());
    admin = await insertProfile(world.db, 'sched@example.com', { admin: true });
    productId = await createProduct(world.deps, admin, adminInput());
  });
  afterEach(async () => {
    await world.db.end();
  });

  const at = (minutesFromStart: number) => new Date(world.clock.now().getTime() + minutesFromStart * MIN);

  async function publishedSession(): Promise<string> {
    const sessionId = await createSession(world.deps, admin, { name: 'Evening', opensAt: at(-10), closesAt: at(180) });
    await setSessionStatus(world.deps, admin, sessionId, 'publish');
    return sessionId;
  }

  async function draftDrop(sessionId: string, releaseMin: number, closeMin: number, position: number, pid = productId) {
    return createDrop(world.deps, admin, sessionId, {
      productId: pid,
      salePaise: 149_900,
      quantity: 1,
      position,
      releaseAt: at(releaseMin),
      closesAt: at(closeMin),
    });
  }

  it('schedules drops 5 minutes apart and refuses a gap of 4 minutes', async () => {
    const sessionId = await publishedSession();
    const first = await draftDrop(sessionId, 10, 14, 1);
    await scheduleDrop(world.deps, admin, first);
    const tooClose = await draftDrop(sessionId, 14, 18, 2);
    await assert.rejects(scheduleDrop(world.deps, admin, tooClose), (e: AppError) => e.code === 'schedule_invalid');
    const fiveApart = await draftDrop(sessionId, 15, 18, 3);
    await scheduleDrop(world.deps, admin, fiveApart);
  });

  it('refuses a gap longer than 30 minutes', async () => {
    const sessionId = await publishedSession();
    const first = await draftDrop(sessionId, 10, 14, 1);
    await scheduleDrop(world.deps, admin, first);
    const tooFar = await draftDrop(sessionId, 41, 45, 2);
    await assert.rejects(scheduleDrop(world.deps, admin, tooFar), (e: AppError) => e.code === 'schedule_invalid');
  });

  it('refuses a sale that runs into the next drop of its session', async () => {
    const sessionId = await publishedSession();
    const first = await draftDrop(sessionId, 10, 20, 1);
    await scheduleDrop(world.deps, admin, first);
    const second = await draftDrop(sessionId, 15, 19, 2);
    await assert.rejects(scheduleDrop(world.deps, admin, second), (e: AppError) => e.code === 'schedule_invalid');
  });

  it('refuses a sale that overlaps a drop in another session, enforced by the database', async () => {
    const one = await publishedSession();
    const two = await createSession(world.deps, admin, { name: 'Late', opensAt: at(-10), closesAt: at(180) });
    await setSessionStatus(world.deps, admin, two, 'publish');
    const a = await draftDrop(one, 10, 15, 1);
    await scheduleDrop(world.deps, admin, a);
    const b = await draftDrop(two, 12, 17, 1);
    await assert.rejects(scheduleDrop(world.deps, admin, b), (e: AppError) => e.code === 'sale_overlaps');
  });

  it('will not schedule a drop in a session that is still a draft', async () => {
    const sessionId = await createSession(world.deps, admin, { name: 'Draft', opensAt: at(-10), closesAt: at(180) });
    const dropId = await draftDrop(sessionId, 10, 14, 1);
    await assert.rejects(scheduleDrop(world.deps, admin, dropId), (e: AppError) => e.code === 'session_not_published');
  });

  it('locks a drop for editing once its reveal has started', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, 10, 14, 1);
    await scheduleDrop(world.deps, admin, dropId);
    world.clock.advance(9.5 * MIN); // 30 seconds before release
    await assert.rejects(
      updateDrop(world.deps, admin, dropId, { productId, salePaise: 1, quantity: 1, position: 1, releaseAt: at(10), closesAt: at(14) }),
      (e: AppError) => e.code === 'locked',
    );
  });

  it('pauses and resumes a drop, and a paused drop shows as paused to visitors', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, -1, 4, 1);
    await scheduleDrop(world.deps, admin, dropId);
    assert.equal((await getDropState(world.deps, null)).phase, 'live');
    await setDropPaused(world.deps, admin, dropId, true);
    assert.equal((await getDropState(world.deps, null)).phase, 'paused');
    await assert.rejects(createReservation(world.deps, await insertProfile(world.db, 'paused-buyer@example.com'), dropId), (e: AppError) => e.code === 'paused');
    await setDropPaused(world.deps, admin, dropId, false);
    assert.equal((await getDropState(world.deps, null)).phase, 'live');
  });

  it('cancels a drop with a paid order to refund, and refunds it through the provider', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, -1, 30, 1);
    await scheduleDrop(world.deps, admin, dropId);
    const buyer = await insertProfile(world.db, 'refund-cancel@example.com');
    const addressId = await insertAddress(world.db, buyer);
    const hold = await createReservation(world.deps, buyer, dropId);
    const checkout = await createPaymentOrder(world.deps, buyer, hold.id, addressId);
    const payment = world.payments.capture(checkout.providerOrderId);
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, amount: payment.amountPaise, currency: 'INR', status: 'captured', fee: payment.feePaise } } } });
    await handleRazorpayWebhook(world.deps, raw, webhookSignature('test-webhook-secret', raw), `evt_${randomUUID()}`);

    const result = await cancelDrop(world.deps, admin, dropId, { reason: 'Supplier recall', paidOrdersAction: 'refund' });
    assert.equal(result.refundsRequested, 1);
    const [order] = await world.db.query<{ payment_status: string }>('select payment_status from orders where drop_id = $1', [dropId]);
    assert.equal(order.payment_status, 'refund_pending');
    assert.equal([...world.payments.refunds.values()].filter((r) => r.paymentId === payment.id).length, 1);
  });

  it('keeps paid orders when the admin chooses to keep them, and says so', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, -1, 30, 1);
    await scheduleDrop(world.deps, admin, dropId);
    const buyer = await insertProfile(world.db, 'keep-cancel@example.com');
    const addressId = await insertAddress(world.db, buyer);
    const hold = await createReservation(world.deps, buyer, dropId);
    const checkout = await createPaymentOrder(world.deps, buyer, hold.id, addressId);
    const payment = world.payments.capture(checkout.providerOrderId);
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, amount: payment.amountPaise, currency: 'INR', status: 'captured' } } } });
    await handleRazorpayWebhook(world.deps, raw, webhookSignature('test-webhook-secret', raw), `evt_${randomUUID()}`);

    const result = await cancelDrop(world.deps, admin, dropId, { reason: 'Keep and ship', paidOrdersAction: 'keep' });
    assert.equal(result.refundsRequested, 0);
    assert.equal(result.paidOrdersKept, 1);
    const [order] = await world.db.query<{ payment_status: string }>('select payment_status from orders where drop_id = $1', [dropId]);
    assert.equal(order.payment_status, 'paid');
  });

  it('gives the administrator a full inspection view with notes and history', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, 10, 14, 1);
    await scheduleDrop(world.deps, admin, dropId);
    const view = await inspectDrop(world.deps, dropId);
    assert.ok(view.drop);
    assert.ok(Array.isArray(view.history));
    assert.ok((view.history as unknown[]).length >= 1);
  });

  it('keeps administrator notes on the order and out of buyer views', async () => {
    const sessionId = await publishedSession();
    const dropId = await draftDrop(sessionId, -1, 30, 1);
    await scheduleDrop(world.deps, admin, dropId);
    const buyer = await insertProfile(world.db, 'notes@example.com');
    const addressId = await insertAddress(world.db, buyer);
    const hold = await createReservation(world.deps, buyer, dropId);
    const checkout = await createPaymentOrder(world.deps, buyer, hold.id, addressId);
    const [order] = await world.db.query<{ id: string }>('select id from orders where provider_order_id = $1', [checkout.providerOrderId]);
    await addOrderNote(world.deps, admin, order.id, 'Customer asked for a gift receipt');
    await assert.rejects(
      world.db.asRole('bb_user', buyer, (q) => q.query('select body from order_notes')),
      (e: { code?: string }) => e.code === '42501',
      'buyers have no access to administrator notes',
    );
  });

  it('does not write anything when a schedule is refused', async () => {
    const sessionId = await publishedSession();
    const first = await draftDrop(sessionId, 10, 14, 1);
    await scheduleDrop(world.deps, admin, first);
    const tooClose = await draftDrop(sessionId, 13, 16, 2);
    await assert.rejects(scheduleDrop(world.deps, admin, tooClose));
    const [row] = await world.db.query<{ status: string }>('select status from drops where id = $1', [tooClose]);
    assert.equal(row.status, 'draft');
  });
});

describe('alerts: scheduled, deduplicated, expiring', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  let dropId: string;
  let releaseAt: Date;

  async function subscribe(email: string, endpoint: string, pushEnabled = true): Promise<string> {
    const id = await insertProfile(world.db, email);
    await world.db.query(
      "insert into push_subscriptions (profile_id, endpoint, p256dh, auth_secret) values ($1, $2, 'p256', 'auth')",
      [id, endpoint],
    );
    await world.db.query('insert into alert_preferences (profile_id, push_enabled) values ($1, $2)', [id, pushEnabled]);
    return id;
  }

  async function schedule(): Promise<void> {
    const admin = await insertProfile(world.db, 'alerts-admin@example.com', { admin: true });
    const productId = await createProduct(world.deps, admin, adminInput());
    const sessionId = await createSession(world.deps, admin, {
      name: 'Alerts',
      opensAt: new Date(world.clock.now().getTime() - MIN),
      closesAt: new Date(world.clock.now().getTime() + 120 * MIN),
    });
    await setSessionStatus(world.deps, admin, sessionId, 'publish');
    releaseAt = new Date(world.clock.now().getTime() + 5 * MIN);
    dropId = await createDrop(world.deps, admin, sessionId, {
      productId,
      salePaise: 149_900,
      quantity: 1,
      position: 1,
      releaseAt,
      closesAt: new Date(releaseAt.getTime() + 5 * MIN),
    });
    await scheduleDrop(world.deps, admin, dropId);
  }

  beforeEach(async () => {
    world = await createWorld(new Date());
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('queues one alert at release minus 30 seconds, and a second queueing changes nothing', async () => {
    await schedule();
    const [job] = await world.db.query<{ run_at: Date; deadline_at: Date }>(
      "select run_at, deadline_at from notification_jobs where dedupe_key = $1",
      [`push_alert:${dropId}`],
    );
    assert.equal(job.run_at.getTime(), releaseAt.getTime() - 30_000);
    assert.equal(job.deadline_at.getTime(), releaseAt.getTime());
    await queueDropAlert(world.db, world.deps, dropId, releaseAt);
    const [{ count }] = await world.db.query<{ count: number }>('select count(*)::int as count from notification_jobs where drop_id = $1', [dropId]);
    assert.equal(count, 1, 'one alert per drop');
  });

  it('sends nothing before the alert time, then sends once to opted-in browsers only', async () => {
    await schedule();
    await subscribe('opted-in@example.com', 'https://push.example/one');
    await subscribe('not-opted@example.com', 'https://push.example/two', false);

    assert.equal((await dispatchDueJobs(world.deps)).claimed, 0);

    world.clock.advance(4.5 * MIN);
    const first = await dispatchDueJobs(world.deps);
    assert.equal(first.claimed, 1);
    assert.equal(world.push.sent.length, 1);
    assert.equal(world.push.sent[0].target.endpoint, 'https://push.example/one');
    assert.equal(world.push.sent[0].message.title, 'Next drop incoming');

    await dispatchDueJobs(world.deps);
    assert.equal(world.push.sent.length, 1, 'a second run does not resend');
  });

  it('expires an alert that is only reached after its drop has released', async () => {
    await schedule();
    await subscribe('late@example.com', 'https://push.example/late');
    world.clock.advance(6 * MIN);
    const summary = await dispatchDueJobs(world.deps);
    assert.equal(summary.expired, 1);
    assert.equal(world.push.sent.length, 0, 'a late alert is never sent');
    const [job] = await world.db.query<{ status: string; last_error: string }>('select status, last_error from notification_jobs where drop_id = $1', [dropId]);
    assert.equal(job.status, 'expired');
    assert.equal(job.last_error, 'deadline_passed');
  });

  it('revokes a browser subscription the push service says is gone, and does not retry it', async () => {
    world = await createWorld(new Date(), (target: PushTarget): PushOutcome => {
      if (target.endpoint.endsWith('/gone')) return { ok: false, statusCode: 410, gone: true, retryable: false, message: 'gone' };
      return { ok: true };
    });
    await schedule();
    await subscribe('gone@example.com', 'https://push.example/gone');
    world.clock.advance(4.5 * MIN);
    await dispatchDueJobs(world.deps);
    const [sub] = await world.db.query<{ revoked_at: Date | null }>("select revoked_at from push_subscriptions where endpoint like '%/gone'");
    assert.ok(sub.revoked_at, 'the dead subscription is revoked');
  });

  it('retries a transient push failure only for the browser that failed, and never resends to one that succeeded', async () => {
    let attemptsForBad = 0;
    world = await createWorld(new Date(), (target: PushTarget): PushOutcome => {
      if (target.endpoint.endsWith('/flaky')) {
        attemptsForBad += 1;
        if (attemptsForBad === 1) return { ok: false, statusCode: 503, gone: false, retryable: true, message: 'try later' };
      }
      return { ok: true };
    });
    await schedule();
    await subscribe('steady@example.com', 'https://push.example/steady');
    await subscribe('flaky@example.com', 'https://push.example/flaky');
    world.clock.advance(4.5 * MIN);
    await dispatchDueJobs(world.deps);
    assert.deepEqual(world.push.sent.map((s) => s.target.endpoint), ['https://push.example/steady']);

    // The retry backoff is 20 seconds, and it must land before the 30 second deadline window closes.
    world.clock.advance(25_000);
    await dispatchDueJobs(world.deps);
    const endpoints = world.push.sent.map((s) => s.target.endpoint).sort();
    assert.deepEqual(endpoints, ['https://push.example/flaky', 'https://push.example/steady'], 'the failed recipient gets it once, the other is not resent');
  });

  it('defers a paused drop rather than sending, and cancels the alert when the drop is cancelled', async () => {
    await schedule();
    await subscribe('paused-alerts@example.com', 'https://push.example/paused');
    await setDropPaused(world.deps, await insertProfile(world.db, 'pauser@example.com', { admin: true }), dropId, true);
    world.clock.advance(4.5 * MIN);
    const deferred = await dispatchDueJobs(world.deps);
    assert.equal(deferred.deferred, 1);
    assert.equal(world.push.sent.length, 0);

    const admin = await insertProfile(world.db, 'canceller@example.com', { admin: true });
    await cancelDrop(world.deps, admin, dropId, { reason: 'Test cancel', paidOrdersAction: 'keep' });
    const [job] = await world.db.query<{ status: string }>('select status from notification_jobs where drop_id = $1', [dropId]);
    assert.equal(job.status, 'cancelled', 'cancelling the drop takes its queued alert off the schedule');
    assert.equal((await dispatchDueJobs(world.deps)).claimed, 0);
    assert.equal(world.push.sent.length, 0);
  });

  it('records outcomes as counts without exposing subscriber details', async () => {
    await schedule();
    await subscribe('private@example.com', 'https://push.example/private-endpoint-123');
    world.clock.advance(4.5 * MIN);
    await dispatchDueJobs(world.deps);
    const [job] = await world.db.query<Record<string, unknown>>('select * from notification_jobs where drop_id = $1', [dropId]);
    const serialised = JSON.stringify(job);
    assert.equal(serialised.includes('private@example.com'), false);
    assert.equal(serialised.includes('private-endpoint-123'), false);
    assert.equal(job.sent_count, 1);
  });

  it('runs the scheduler sweep safely more than once', async () => {
    await schedule();
    const first = await sweep(world.deps);
    const second = await sweep(world.deps);
    assert.equal(first.holdsExpired, 0);
    assert.equal(second.holdsExpired, 0);
  });
});
