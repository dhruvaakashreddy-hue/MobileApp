import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/client.ts';
import { PG, pgErrorCode } from '../db/client.ts';
import { fail } from '../errors.ts';
import type { Condition, FulfilmentStatus, OrderPaymentStatus } from '../../shared/api-types.ts';
import { marginFor } from '../../shared/pricing.ts';
import { validateSessionSchedule, type PlannedDrop, type ScheduleIssue } from '../../shared/schedule.ts';
import { REVEAL_LEAD_MS } from '../../shared/constants.ts';
import { audit } from './audit.ts';
import { cancelDropJobs, queueDropAlert, queueSessionReminder } from './jobs.ts';
import { executeRefund, insertRefund } from './payments.ts';
import { lockDrop } from './reservations.ts';
import type { SignedInProfile } from './auth.ts';

export function requireAdmin(profile: SignedInProfile | null): SignedInProfile {
  if (!profile) throw fail.unauthorized();
  if (!profile.is_admin) throw fail.forbidden('Administrator access is required.');
  return profile;
}

export interface ProductInput {
  sku: string;
  name: string;
  description: string;
  category: string;
  condition: Condition;
  specs: { label: string; value: string }[];
  warrantyText: string;
  returnPolicyText: string;
  shippingEligible: boolean;
  shippingFeePaise: number;
  procurementCostPaise: number | null;
  shippingCostPaise: number | null;
  otherCostPaise: number | null;
  isSample: boolean;
}

function assertPaise(value: number | null, field: string): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw fail.badRequest('invalid_amount', `${field} must be a whole number of paise, zero or more.`);
  }
}

function validateProduct(input: ProductInput): void {
  if (!input.sku.trim() || !input.name.trim()) throw fail.badRequest('invalid_product', 'SKU and name are required.');
  if (!input.warrantyText.trim() || !input.returnPolicyText.trim()) {
    throw fail.badRequest('invalid_product', 'Warranty and return terms are required before a product can be sold.');
  }
  assertPaise(input.shippingFeePaise, 'Delivery fee');
  assertPaise(input.procurementCostPaise, 'Procurement cost');
  assertPaise(input.shippingCostPaise, 'Shipping cost');
  assertPaise(input.otherCostPaise, 'Other cost');
}

export async function listProducts(deps: Deps): Promise<unknown[]> {
  return deps.db.query(
    `select p.id, p.sku, p.name, p.category, p.condition, p.shipping_eligible, p.shipping_fee_paise,
            p.procurement_cost_paise, p.shipping_cost_paise, p.other_cost_paise, p.is_sample,
            (select count(*)::int from drops d where d.product_id = p.id) as drop_count,
            (select count(*)::int from price_references r where r.product_id = p.id) as reference_count
       from products p order by p.created_at desc limit 200`,
  );
}

export async function createProduct(deps: Deps, adminId: string, input: ProductInput): Promise<string> {
  validateProduct(input);
  return deps.db.tx(async (q) => {
    try {
      const [row] = await q.query<{ id: string }>(
        `insert into products (sku, name, description, category, condition, specs, warranty_text, return_policy_text,
                               shipping_eligible, shipping_fee_paise, procurement_cost_paise, shipping_cost_paise,
                               other_cost_paise, is_sample)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning id`,
        [
          input.sku.trim(),
          input.name.trim(),
          input.description,
          input.category,
          input.condition,
          JSON.stringify(input.specs),
          input.warrantyText,
          input.returnPolicyText,
          input.shippingEligible,
          input.shippingFeePaise,
          input.procurementCostPaise,
          input.shippingCostPaise,
          input.otherCostPaise,
          input.isSample,
        ],
      );
      await audit(q, { actorId: adminId, actorKind: 'admin', action: 'product.created', entityType: 'product', entityId: row.id, after: { sku: input.sku, name: input.name } });
      return row.id;
    } catch (error) {
      if (pgErrorCode(error) === PG.uniqueViolation) throw fail.conflict('sku_taken', 'Another product already uses that SKU.');
      throw error;
    }
  });
}

/** Costs are recorded as given. Clearing one (null) makes the order's margin report "incomplete" again. */
export async function updateProduct(deps: Deps, adminId: string, productId: string, input: ProductInput): Promise<void> {
  validateProduct(input);
  await deps.db.tx(async (q) => {
    const [before] = await q.query('select * from products where id = $1 for update', [productId]);
    if (!before) throw fail.notFound('That product was not found.');
    await q.query(
      `update products set name = $2, description = $3, category = $4, condition = $5, specs = $6,
              warranty_text = $7, return_policy_text = $8, shipping_eligible = $9, shipping_fee_paise = $10,
              procurement_cost_paise = $11, shipping_cost_paise = $12, other_cost_paise = $13, is_sample = $14,
              updated_at = $15
        where id = $1`,
      [
        productId,
        input.name.trim(),
        input.description,
        input.category,
        input.condition,
        JSON.stringify(input.specs),
        input.warrantyText,
        input.returnPolicyText,
        input.shippingEligible,
        input.shippingFeePaise,
        input.procurementCostPaise,
        input.shippingCostPaise,
        input.otherCostPaise,
        input.isSample,
        deps.clock.now(),
      ],
    );
    await audit(q, {
      actorId: adminId,
      actorKind: 'admin',
      action: 'product.updated',
      entityType: 'product',
      entityId: productId,
      before: { name: before.name, shippingFeePaise: before.shipping_fee_paise },
      after: { name: input.name, shippingFeePaise: input.shippingFeePaise },
    });
  });
}

export async function addProductImage(
  deps: Deps,
  adminId: string,
  productId: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
  bytes: Buffer,
): Promise<string> {
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    throw fail.badRequest('image_size', 'Images must be between 1 byte and 2 MB.');
  }
  return deps.db.tx(async (q) => {
    const [{ count }] = await q.query<{ count: number }>('select count(*)::int as count from product_media where product_id = $1', [productId]);
    if (count >= 6) throw fail.conflict('too_many_images', 'A product can have up to 6 images.');
    const [row] = await q.query<{ id: string }>(
      'insert into product_media (product_id, content_type, bytes, sort_order) values ($1, $2, $3, $4) returning id',
      [productId, contentType, bytes, count],
    );
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'product.image_added', entityType: 'product', entityId: productId, after: { mediaId: row.id } });
    return row.id;
  });
}

export async function addPriceReference(
  deps: Deps,
  adminId: string,
  productId: string,
  input: { condition: Condition; amountPaise: number; sourceLabel: string; sourceUrl: string | null; evidenceNote: string; capturedAt: Date },
): Promise<void> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw fail.badRequest('invalid_amount', 'The reference price must be above zero.');
  if (!input.evidenceNote.trim() || !input.sourceLabel.trim()) {
    throw fail.badRequest('evidence_required', 'A reference price needs a source and a note on how it was checked.');
  }
  await deps.db.tx(async (q) => {
    const [row] = await q.query<{ id: string }>(
      `insert into price_references (product_id, condition, amount_paise, source_label, source_url, evidence_note, captured_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [productId, input.condition, input.amountPaise, input.sourceLabel, input.sourceUrl, input.evidenceNote, input.capturedAt],
    );
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'price_reference.added', entityType: 'product', entityId: productId, after: { referenceId: row.id, amountPaise: input.amountPaise } });
  });
}

export async function listSessions(deps: Deps): Promise<unknown[]> {
  return deps.db.query(
    `select s.id, s.name, s.status, s.window_opens_at, s.window_closes_at,
            (select count(*)::int from drops d where d.session_id = s.id) as drop_count
       from sessions s order by s.window_opens_at desc limit 100`,
  );
}

export async function createSession(
  deps: Deps,
  adminId: string,
  input: { name: string; opensAt: Date; closesAt: Date },
): Promise<string> {
  if (input.closesAt.getTime() <= input.opensAt.getTime()) throw fail.badRequest('invalid_window', 'The session must close after it opens.');
  return deps.db.tx(async (q) => {
    const [row] = await q.query<{ id: string }>(
      'insert into sessions (name, window_opens_at, window_closes_at) values ($1, $2, $3) returning id',
      [input.name, input.opensAt, input.closesAt],
    );
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'session.created', entityType: 'session', entityId: row.id, after: input });
    return row.id;
  });
}

/** Publishes a draft session, pauses or resumes it, or closes its window. Pausing a session pauses all of its drops. */
export async function setSessionStatus(
  deps: Deps,
  adminId: string,
  sessionId: string,
  action: 'publish' | 'pause' | 'resume',
): Promise<void> {
  await deps.db.tx(async (q) => {
    const [session] = await q.query<{ status: string; window_opens_at: Date }>(
      'select status, window_opens_at from sessions where id = $1 for update',
      [sessionId],
    );
    if (!session) throw fail.notFound('That session was not found.');
    const next = action === 'publish' ? 'scheduled' : action === 'pause' ? 'paused' : 'scheduled';
    const allowed = action === 'publish' ? session.status === 'draft' : action === 'pause' ? session.status === 'scheduled' : session.status === 'paused';
    if (!allowed) throw fail.conflict('invalid_transition', `A ${session.status} session cannot be ${action}d.`);
    await q.query('update sessions set status = $2, updated_at = $3 where id = $1', [sessionId, next, deps.clock.now()]);
    if (action === 'publish') await queueSessionReminder(q, deps, sessionId, session.window_opens_at);
    await audit(q, { actorId: adminId, actorKind: 'admin', action: `session.${action}`, entityType: 'session', entityId: sessionId, before: { status: session.status }, after: { status: next } });
  });
}

interface DropInput {
  productId: string;
  salePaise: number;
  quantity: number;
  position: number;
  releaseAt: Date | null;
  closesAt: Date | null;
}

function validateDropInput(input: DropInput): void {
  if (!Number.isInteger(input.salePaise) || input.salePaise <= 0) throw fail.badRequest('invalid_price', 'The sale price must be above zero.');
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    throw fail.badRequest('invalid_quantity', 'Quantity must be between 1 and 100. The default is one unit.');
  }
  if (!Number.isInteger(input.position) || input.position < 1) throw fail.badRequest('invalid_position', 'Position must be 1 or more.');
  if ((input.releaseAt === null) !== (input.closesAt === null)) {
    throw fail.badRequest('incomplete_window', 'Set both the release time and the close time, or neither.');
  }
  if (input.releaseAt && input.closesAt && input.closesAt.getTime() <= input.releaseAt.getTime()) {
    throw fail.badRequest('invalid_window', 'The sale must close after it releases.');
  }
}

export async function createDrop(deps: Deps, adminId: string, sessionId: string, input: DropInput): Promise<string> {
  validateDropInput(input);
  return deps.db.tx(async (q) => {
    const [session] = await q.query<{ id: string }>('select id from sessions where id = $1', [sessionId]);
    if (!session) throw fail.notFound('That session was not found.');
    try {
      const [row] = await q.query<{ id: string }>(
        `insert into drops (session_id, product_id, position, status, sale_price_paise, quantity, release_at, closes_at)
         values ($1, $2, $3, 'draft', $4, $5, $6, $7) returning id`,
        [sessionId, input.productId, input.position, input.salePaise, input.quantity, input.releaseAt, input.closesAt],
      );
      await audit(q, { actorId: adminId, actorKind: 'admin', action: 'drop.created', entityType: 'drop', entityId: row.id, after: { sessionId, ...input } });
      return row.id;
    } catch (error) {
      if (pgErrorCode(error) === PG.uniqueViolation) throw fail.conflict('position_taken', 'Another drop in this session already uses that position.');
      throw error;
    }
  });
}

/** Drops in a session as they would stand if the given drop were scheduled. Used for validation and for the preview. */
async function plannedSchedule(
  q: Queryable,
  sessionId: string,
  dropId: string,
  candidate: { releaseAt: Date; closesAt: Date },
): Promise<PlannedDrop[]> {
  const others = await q.query<{ id: string; release_at: Date; closes_at: Date }>(
    `select id, release_at, closes_at from drops
      where session_id = $1 and id <> $2 and status in ('scheduled', 'paused')`,
    [sessionId, dropId],
  );
  return [
    { id: dropId, releaseMs: candidate.releaseAt.getTime(), closesMs: candidate.closesAt.getTime() },
    ...others.map((d) => ({ id: d.id, releaseMs: d.release_at.getTime(), closesMs: d.closes_at.getTime() })),
  ];
}

export async function updateDrop(deps: Deps, adminId: string, dropId: string, input: DropInput): Promise<void> {
  validateDropInput(input);
  await deps.db.tx(async (q) => {
    const drop = await lockDrop(q, dropId);
    if (!drop) throw fail.notFound('That drop was not found.');
    const now = deps.clock.now();
    const editable = drop.status === 'draft' || (drop.status === 'scheduled' && drop.release_at !== null && now.getTime() < drop.release_at.getTime() - REVEAL_LEAD_MS);
    if (!editable) throw fail.conflict('locked', 'This drop is in its reveal or live window, so it cannot be changed.');
    await q.query(
      `update drops set product_id = $2, position = $3, sale_price_paise = $4, quantity = $5,
              release_at = $6, closes_at = $7, updated_at = $8 where id = $1`,
      [dropId, input.productId, input.position, input.salePaise, input.quantity, input.releaseAt, input.closesAt, now],
    );
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'drop.updated', entityType: 'drop', entityId: dropId, after: input });
  });
}

/**
 * Activates a drop. Checks the session's schedule rules first: 5 to 30 minutes between
 * releases, no sale running into the next drop, and everything inside the session window.
 * Overlaps with other sessions are rejected by the database constraint.
 */
export async function scheduleDrop(deps: Deps, adminId: string, dropId: string): Promise<{ alertQueued: boolean }> {
  return deps.db.tx(async (q) => {
    const drop = await lockDrop(q, dropId);
    if (!drop) throw fail.notFound('That drop was not found.');
    if (drop.status !== 'draft') throw fail.conflict('invalid_transition', `A ${drop.status} drop cannot be scheduled.`);
    if (!drop.release_at || !drop.closes_at) throw fail.badRequest('incomplete_window', 'Set the release and close times first.');
    const [session] = await q.query<{ id: string; status: string; window_opens_at: Date; window_closes_at: Date }>(
      'select id, status, window_opens_at, window_closes_at from sessions where id = $1 for update',
      [drop.session_id],
    );
    if (session.status === 'draft' || session.status === 'cancelled') {
      throw fail.conflict('session_not_published', 'Publish the session before scheduling its drops.');
    }
    const planned = await plannedSchedule(q, session.id, dropId, { releaseAt: drop.release_at, closesAt: drop.closes_at });
    const issues: ScheduleIssue[] = validateSessionSchedule(
      { opensMs: session.window_opens_at.getTime(), closesMs: session.window_closes_at.getTime() },
      planned,
    );
    if (issues.length > 0) {
      throw fail.conflict('schedule_invalid', issues[0].message, { issues });
    }

    const now = deps.clock.now();
    try {
      await q.query("update drops set status = 'scheduled', updated_at = $2 where id = $1", [dropId, now]);
    } catch (error) {
      if (pgErrorCode(error) === PG.exclusionViolation) {
        throw fail.conflict('sale_overlaps', 'This sale overlaps another drop that is already scheduled.');
      }
      throw error;
    }
    const alertQueued = await queueDropAlert(q, deps, dropId, drop.release_at);
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'drop.scheduled', entityType: 'drop', entityId: dropId, before: { status: 'draft' }, after: { status: 'scheduled', releaseAt: drop.release_at, closesAt: drop.closes_at } });
    return { alertQueued };
  });
}

export async function setDropPaused(deps: Deps, adminId: string, dropId: string, pause: boolean): Promise<void> {
  await deps.db.tx(async (q) => {
    const drop = await lockDrop(q, dropId);
    if (!drop) throw fail.notFound('That drop was not found.');
    const from = pause ? 'scheduled' : 'paused';
    if (drop.status !== from) throw fail.conflict('invalid_transition', `A ${drop.status} drop cannot be ${pause ? 'paused' : 'resumed'}.`);
    const now = deps.clock.now();
    await q.query(
      'update drops set status = $2, paused_at = $3, updated_at = $4 where id = $1',
      [dropId, pause ? 'paused' : 'scheduled', pause ? now : null, now],
    );
    if (!pause && drop.release_at) await queueDropAlert(q, deps, dropId, drop.release_at);
    await audit(q, { actorId: adminId, actorKind: 'admin', action: pause ? 'drop.paused' : 'drop.resumed', entityType: 'drop', entityId: dropId, before: { status: from }, after: { status: pause ? 'paused' : 'scheduled' } });
  });
}

/**
 * Cancels a drop. Holds are released now. Payments still in flight are refunded if they
 * arrive later. Paid orders are never cancelled automatically: the admin must choose
 * 'refund' or 'keep' for them.
 */
export async function cancelDrop(
  deps: Deps,
  adminId: string,
  dropId: string,
  input: { reason: string; paidOrdersAction: 'refund' | 'keep' },
): Promise<{ refundsRequested: number; paidOrdersKept: number }> {
  if (!input.reason.trim()) throw fail.badRequest('reason_required', 'Give a reason for cancelling this drop.');
  const { refundIds, kept } = await deps.db.tx(async (q) => {
    const drop = await lockDrop(q, dropId);
    if (!drop) throw fail.notFound('That drop was not found.');
    if (drop.status === 'cancelled' || drop.status === 'draft') {
      throw fail.conflict('invalid_transition', `A ${drop.status} drop cannot be cancelled.`);
    }
    const now = deps.clock.now();
    await q.query(
      `update drops set status = 'cancelled', cancelled_at = $2, cancel_reason = $3, updated_at = $2 where id = $1`,
      [dropId, now, input.reason],
    );
    await q.query(
      `update reservations set status = 'cancelled', status_reason = 'drop_cancelled', updated_at = $2
        where drop_id = $1 and status in ('held', 'paying')`,
      [dropId, now],
    );
    await q.query(
      `update orders set payment_status = 'abandoned', updated_at = $2
        where drop_id = $1 and payment_status = 'awaiting_payment'`,
      [dropId, now],
    );
    await cancelDropJobs(q, dropId, now);

    const paid = await q.query<{ id: string; provider_payment_id: string | null; total_paise: number; refunded_paise: number }>(
      `select id, provider_payment_id, total_paise, refunded_paise from orders
        where drop_id = $1 and provider_payment_id is not null and payment_status in ('paid', 'partially_refunded')
        for update`,
      [dropId],
    );
    const refundIds: string[] = [];
    if (input.paidOrdersAction === 'refund') {
      for (const order of paid) {
        const amount = order.total_paise - order.refunded_paise;
        if (amount <= 0) continue;
        const refundId = await insertRefund(q, {
          orderId: order.id,
          providerPaymentId: order.provider_payment_id as string,
          kind: 'order',
          amountPaise: amount,
          reason: `Drop cancelled: ${input.reason}`,
          requestedBy: adminId,
        });
        await q.query("update orders set payment_status = 'refund_pending', updated_at = $2 where id = $1", [order.id, now]);
        refundIds.push(refundId);
      }
    }
    await audit(q, {
      actorId: adminId,
      actorKind: 'admin',
      action: 'drop.cancelled',
      entityType: 'drop',
      entityId: dropId,
      before: { status: drop.status },
      after: { status: 'cancelled', reason: input.reason, paidOrders: paid.length, paidOrdersAction: input.paidOrdersAction },
    });
    return { refundIds, kept: input.paidOrdersAction === 'keep' ? paid.length : 0 };
  });
  for (const refundId of refundIds) await executeRefund(deps, refundId);
  return { refundsRequested: refundIds.length, paidOrdersKept: kept };
}

export async function inspectDrop(deps: Deps, dropId: string): Promise<Record<string, unknown>> {
  const [drop] = await deps.db.query(
    `select d.*, p.name as product_name, p.sku, p.condition, s.name as session_name, s.status as session_status
       from drops d join products p on p.id = d.product_id join sessions s on s.id = d.session_id
      where d.id = $1`,
    [dropId],
  );
  if (!drop) throw fail.notFound('That drop was not found.');
  const reservations = await deps.db.query(
    'select status, count(*)::int as count from reservations where drop_id = $1 group by status order by status',
    [dropId],
  );
  const orders = await deps.db.query(
    `select o.id, o.order_no, o.payment_status, o.fulfilment_status, o.total_paise, o.refunded_paise, p.email as buyer_email
       from orders o join profiles p on p.id = o.profile_id where o.drop_id = $1 order by o.created_at`,
    [dropId],
  );
  const jobs = await deps.db.query(
    `select id, kind, status, run_at, deadline_at, attempts, sent_count, failed_count, last_error
       from notification_jobs where drop_id = $1 order by run_at`,
    [dropId],
  );
  const history = await deps.db.query(
    'select action, actor_kind, created_at, after_state from audit_log where entity_type = $1 and entity_id = $2 order by created_at desc limit 50',
    ['drop', dropId],
  );
  return { drop, reservations, orders, jobs, history };
}

export async function getSessionAdmin(deps: Deps, sessionId: string): Promise<Record<string, unknown>> {
  const [session] = await deps.db.query(
    'select id, name, status, window_opens_at, window_closes_at from sessions where id = $1',
    [sessionId],
  );
  if (!session) throw fail.notFound('That session was not found.');
  const drops = await deps.db.query(
    `select d.id, d.position, d.status, d.sale_price_paise, d.quantity, d.release_at, d.closes_at,
            p.id as product_id, p.name as product_name, p.condition
       from drops d join products p on p.id = d.product_id
      where d.session_id = $1 order by d.position`,
    [sessionId],
  );
  return { session, drops };
}

export async function listOrders(deps: Deps, filter: { paymentStatus?: string | null }): Promise<unknown[]> {
  return deps.db.query(
    `select o.id, o.order_no, o.payment_status, o.fulfilment_status, o.total_paise, o.refunded_paise, o.paid_at,
            o.created_at, o.product_snapshot->>'name' as product_name, p.email as buyer_email
       from orders o join profiles p on p.id = o.profile_id
      where ($1::text is null or o.payment_status = $1)
      order by o.created_at desc limit 200`,
    [filter.paymentStatus ?? null],
  );
}

export async function getOrderDetail(deps: Deps, orderId: string): Promise<Record<string, unknown>> {
  const [order] = await deps.db.query(
    `select o.*, p.email as buyer_email from orders o join profiles p on p.id = o.profile_id where o.id = $1`,
    [orderId],
  );
  if (!order) throw fail.notFound('That order was not found.');
  const [notes, refunds, events, cases] = await Promise.all([
    deps.db.query(
      'select n.id, n.body, n.created_at, p.email as author from order_notes n left join profiles p on p.id = n.author_id where n.order_id = $1 order by n.created_at desc',
      [orderId],
    ),
    deps.db.query('select id, kind, amount_paise, status, reason, provider_refund_id, error, created_at from refunds where order_id = $1 order by created_at', [orderId]),
    deps.db.query(
      'select e.event_type, e.outcome, e.amount_paise, e.received_at from payment_events e where e.provider_order_id = $1 order by e.received_at',
      [order.provider_order_id],
    ),
    deps.db.query("select id, kind, status, details, created_at from reconciliation_cases where order_id = $1 order by created_at desc", [orderId]),
  ]);
  const margin = marginFor({
    totalPaise: order.total_paise,
    refundedPaise: order.refunded_paise,
    procurementPaise: order.cost_procurement_paise,
    shippingCostPaise: order.cost_shipping_paise,
    otherCostPaise: order.cost_other_paise,
    paymentFeePaise: order.payment_fee_paise,
  });
  return { order, notes, refunds, events, cases, margin };
}

export async function addOrderNote(deps: Deps, adminId: string, orderId: string, body: string): Promise<void> {
  if (!body.trim() || body.length > 2000) throw fail.badRequest('invalid_note', 'Notes must be 1 to 2000 characters.');
  await deps.db.tx(async (q) => {
    await q.query('select 1 from orders where id = $1', [orderId]);
    await q.query('insert into order_notes (order_id, author_id, body) values ($1, $2, $3)', [orderId, adminId, body.trim()]);
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'order.note_added', entityType: 'order', entityId: orderId });
  });
}

export async function setFulfilment(
  deps: Deps,
  adminId: string,
  orderId: string,
  input: { status: FulfilmentStatus; carrier: string | null; trackingNumber: string | null },
): Promise<void> {
  if ((input.status === 'shipped' || input.status === 'delivered') && !input.trackingNumber?.trim()) {
    throw fail.badRequest('tracking_required', 'Add a tracking number before marking an order shipped or delivered.');
  }
  await deps.db.tx(async (q) => {
    const [order] = await q.query<{ payment_status: OrderPaymentStatus; fulfilment_status: string }>(
      'select payment_status, fulfilment_status from orders where id = $1 for update',
      [orderId],
    );
    if (!order) throw fail.notFound('That order was not found.');
    if (!['paid', 'partially_refunded'].includes(order.payment_status) && input.status !== 'cancelled') {
      throw fail.conflict('not_paid', 'Only paid orders can be fulfilled.');
    }
    await q.query(
      'update orders set fulfilment_status = $2, carrier = $3, tracking_number = $4, updated_at = $5 where id = $1',
      [orderId, input.status, input.carrier, input.trackingNumber?.trim() || null, deps.clock.now()],
    );
    await audit(q, {
      actorId: adminId,
      actorKind: 'admin',
      action: 'order.fulfilment_updated',
      entityType: 'order',
      entityId: orderId,
      before: { fulfilment: order.fulfilment_status },
      after: { fulfilment: input.status, carrier: input.carrier },
    });
  });
}

export async function listCases(deps: Deps): Promise<unknown[]> {
  return deps.db.query(
    `select id, kind, status, order_id, reservation_id, provider_payment_id, amount_paise, details, resolution_note, created_at
       from reconciliation_cases order by status = 'open' desc, created_at desc limit 200`,
  );
}

export async function resolveCase(deps: Deps, adminId: string, caseId: string, note: string): Promise<void> {
  if (!note.trim()) throw fail.badRequest('note_required', 'Say how the case was resolved.');
  await deps.db.tx(async (q) => {
    const rows = await q.query(
      "update reconciliation_cases set status = 'resolved', resolution_note = $2, resolved_at = $3 where id = $1 and status = 'open' returning id",
      [caseId, note.trim(), deps.clock.now()],
    );
    if (rows.length === 0) throw fail.conflict('not_open', 'That case is already resolved or does not exist.');
    await audit(q, { actorId: adminId, actorKind: 'admin', action: 'case.resolved', entityType: 'reconciliation_case', entityId: caseId, after: { note: note.trim() } });
  });
}

export async function listJobs(deps: Deps): Promise<unknown[]> {
  return deps.db.query(
    `select j.id, j.kind, j.status, j.run_at, j.deadline_at, j.attempts, j.max_attempts,
            j.sent_count, j.failed_count, j.last_error, j.completed_at, d.name as drop_session
       from notification_jobs j
       left join lateral (select s.name from drops dr join sessions s on s.id = dr.session_id where dr.id = j.drop_id) d on true
      order by j.run_at desc limit 100`,
  );
}

export async function listAudit(deps: Deps): Promise<unknown[]> {
  return deps.db.query(
    'select id, actor_kind, action, entity_type, entity_id, after_state, created_at from audit_log order by id desc limit 200',
  );
}

export interface AnalyticsSummary {
  windowDays: number;
  visits: number;
  pushOptIns: number;
  emailOptIns: number;
  reservationsCreated: number;
  paidOrders: number;
  grossPaise: number;
  refundedPaise: number;
  netPaise: number;
  marginPaise: number;
  ordersWithCompleteCosts: number;
  ordersWithMissingCosts: number;
}

/** Real counts from recorded rows. Orders with a missing cost are counted separately, never as zero. */
export async function analyticsSummary(deps: Deps, windowDays = 30): Promise<AnalyticsSummary> {
  const since = new Date(deps.clock.now().getTime() - windowDays * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  const [visits] = await deps.db.query<{ visits: number }>(
    'select coalesce(sum(views), 0)::int as visits from visit_counts where day >= $1',
    [sinceDay],
  );
  const [optIns] = await deps.db.query<{ push: number; email: number }>(
    'select count(*) filter (where push_enabled)::int as push, count(*) filter (where email_reminders)::int as email from alert_preferences',
  );
  const [reservations] = await deps.db.query<{ count: number }>(
    'select count(*)::int as count from reservations where created_at >= $1',
    [since],
  );
  const paid = await deps.db.query<{
    total_paise: number;
    refunded_paise: number;
    cost_procurement_paise: number | null;
    cost_shipping_paise: number | null;
    cost_other_paise: number | null;
    payment_fee_paise: number | null;
  }>(
    `select total_paise, refunded_paise, cost_procurement_paise, cost_shipping_paise, cost_other_paise, payment_fee_paise
       from orders where paid_at is not null and paid_at >= $1`,
    [since],
  );

  let grossPaise = 0;
  let refundedPaise = 0;
  let marginPaise = 0;
  let complete = 0;
  let missing = 0;
  for (const order of paid) {
    grossPaise += order.total_paise;
    refundedPaise += order.refunded_paise;
    const margin = marginFor({
      totalPaise: order.total_paise,
      refundedPaise: order.refunded_paise,
      procurementPaise: order.cost_procurement_paise,
      shippingCostPaise: order.cost_shipping_paise,
      otherCostPaise: order.cost_other_paise,
      paymentFeePaise: order.payment_fee_paise,
    });
    if (margin.status === 'complete') {
      complete += 1;
      marginPaise += margin.marginPaise;
    } else {
      missing += 1;
    }
  }

  return {
    windowDays,
    visits: visits.visits,
    pushOptIns: optIns.push,
    emailOptIns: optIns.email,
    reservationsCreated: reservations.count,
    paidOrders: paid.length,
    grossPaise,
    refundedPaise,
    netPaise: grossPaise - refundedPaise,
    marginPaise,
    ordersWithCompleteCosts: complete,
    ordersWithMissingCosts: missing,
  };
}
