import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/client.ts';
import { ALERT_LEAD_MS, SESSION_REMINDER_LEAD_MS } from '../../shared/constants.ts';
import { fail } from '../errors.ts';
import type { PushMessage } from '../adapters/push.ts';
import { audit } from './audit.ts';
import { executeRefund, openCase, settleCapturedPayment } from './payments.ts';
import { lockDrop } from './reservations.ts';

export interface JobRow {
  id: string;
  kind: 'push_alert' | 'session_reminder_email';
  drop_id: string | null;
  session_id: string | null;
  run_at: Date;
  deadline_at: Date;
  attempts: number;
  max_attempts: number;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  expired: number;
  cancelled: number;
  deferred: number;
}

const LOCK_MS = 120_000;
const RETRY_BASE_MS = 10_000;

/**
 * Queues the alerts for a scheduled drop: a push at release minus 30 seconds, expiring at release.
 * Idempotent by dedupe key, so scheduling twice produces one job.
 */
export async function queueDropAlert(q: Queryable, deps: Deps, dropId: string, releaseAt: Date): Promise<boolean> {
  const now = deps.clock.now();
  if (now.getTime() >= releaseAt.getTime()) return false;
  const runAt = new Date(Math.max(releaseAt.getTime() - ALERT_LEAD_MS, now.getTime()));
  await q.query(
    `insert into notification_jobs (kind, dedupe_key, drop_id, run_at, deadline_at)
     values ('push_alert', $1, $2, $3, $4)
     on conflict (dedupe_key) do update set status = 'queued', run_at = excluded.run_at, updated_at = $5
       where notification_jobs.status = 'cancelled'`,
    [`push_alert:${dropId}`, dropId, runAt, releaseAt, now],
  );
  return true;
}

export async function queueSessionReminder(
  q: Queryable,
  deps: Deps,
  sessionId: string,
  opensAt: Date,
): Promise<boolean> {
  const now = deps.clock.now();
  if (now.getTime() >= opensAt.getTime()) return false;
  const runAt = new Date(Math.max(opensAt.getTime() - SESSION_REMINDER_LEAD_MS, now.getTime()));
  await q.query(
    `insert into notification_jobs (kind, dedupe_key, session_id, run_at, deadline_at)
     values ('session_reminder_email', $1, $2, $3, $4)
     on conflict (dedupe_key) do nothing`,
    [`session_reminder:${sessionId}`, sessionId, runAt, opensAt],
  );
  return true;
}

export async function cancelDropJobs(q: Queryable, dropId: string, now: Date): Promise<void> {
  await q.query(
    "update notification_jobs set status = 'cancelled', updated_at = $2, completed_at = $2 where drop_id = $1 and status = 'queued'",
    [dropId, now],
  );
}

/** Claims due jobs. SKIP LOCKED lets several workers run without taking the same job twice. */
async function claimDueJobs(deps: Deps, limit: number): Promise<JobRow[]> {
  const now = deps.clock.now();
  return deps.db.tx((q) =>
    q.query<JobRow>(
      `update notification_jobs
          set status = 'running', attempts = attempts + 1, locked_until = $2, updated_at = $1
        where id in (
          select id from notification_jobs
           where (status = 'queued' and run_at <= $1)
              or (status = 'running' and locked_until < $1)
           order by run_at
           limit $3
           for update skip locked
        )
        returning id, kind, drop_id, session_id, run_at, deadline_at, attempts, max_attempts`,
      [now, new Date(now.getTime() + LOCK_MS), limit],
    ),
  );
}

async function settle(
  deps: Deps,
  job: JobRow,
  status: 'queued' | 'sent' | 'failed' | 'expired' | 'cancelled',
  details: { lastError?: string | null; runAt?: Date } = {},
): Promise<void> {
  const now = deps.clock.now();
  const counts = await deps.db.query<{ sent: number; failed: number }>(
    `select count(*) filter (where status = 'sent')::int as sent,
            count(*) filter (where status in ('failed', 'gone'))::int as failed
       from notification_deliveries where job_id = $1`,
    [job.id],
  );
  await deps.db.query(
    `update notification_jobs
        set status = $2, run_at = coalesce($3, run_at), last_error = $4, sent_count = $5, failed_count = $6,
            locked_until = null, updated_at = $7,
            completed_at = case when $2 in ('sent', 'failed', 'expired', 'cancelled') then $7::timestamptz else null end
      where id = $1`,
    [
      job.id,
      status,
      details.runAt ?? null,
      details.lastError ?? null,
      counts[0].sent,
      counts[0].failed,
      now,
    ],
  );
}

/** Retries are bounded by attempts and by the deadline. A late alert is worse than no alert. */
async function settleAfterFailures(deps: Deps, job: JobRow, lastError: string): Promise<void> {
  const now = deps.clock.now();
  const retryAt = new Date(now.getTime() + RETRY_BASE_MS * 2 ** job.attempts);
  if (job.attempts < job.max_attempts && retryAt.getTime() < job.deadline_at.getTime()) {
    await settle(deps, job, 'queued', { lastError, runAt: retryAt });
  } else {
    await settle(deps, job, 'failed', { lastError });
  }
}

/** Alerts never name the product. The reveal is the point of the drop. */
const PUSH_MESSAGE: PushMessage = {
  title: 'Next drop incoming',
  body: 'Product revealed when the timer reaches zero.',
  url: '/',
  tag: 'bizzar-drop',
};

async function runPushAlert(deps: Deps, job: JobRow): Promise<'sent' | 'retry' | 'deferred' | 'cancelled'> {
  const [drop] = await deps.db.query<{ status: string }>('select status from drops where id = $1', [job.drop_id]);
  if (!drop || drop.status === 'cancelled') return 'cancelled';
  if (drop.status === 'paused') return 'deferred';

  const targets = await deps.db.query<{ id: string; endpoint: string; p256dh: string; auth_secret: string }>(
    `select ps.id, ps.endpoint, ps.p256dh, ps.auth_secret
       from push_subscriptions ps
       join alert_preferences ap on ap.profile_id = ps.profile_id
      where ps.revoked_at is null and ap.push_enabled`,
  );

  const ttlSeconds = Math.max(1, Math.floor((job.deadline_at.getTime() - deps.clock.now().getTime()) / 1000));
  let anyRetryable = false;
  for (const target of targets) {
    // Each recipient is claimed once per job. A retry skips recipients who already got it.
    const claimed = await deps.db.query(
      `insert into notification_deliveries (job_id, recipient_ref, status)
       values ($1, $2, 'pending')
       on conflict (job_id, recipient_ref) do update set status = 'pending', attempted_at = now()
         where notification_deliveries.status <> 'sent'
       returning recipient_ref`,
      [job.id, target.id],
    );
    if (claimed.length === 0) continue;

    const outcome = await deps.push.send(
      { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth_secret },
      PUSH_MESSAGE,
      ttlSeconds,
    );
    if (outcome.ok) {
      await deps.db.query("update notification_deliveries set status = 'sent', error_code = null where job_id = $1 and recipient_ref = $2", [job.id, target.id]);
    } else if (outcome.gone) {
      await deps.db.tx(async (q) => {
        await q.query("update notification_deliveries set status = 'gone', error_code = $3 where job_id = $1 and recipient_ref = $2", [job.id, target.id, String(outcome.statusCode)]);
        await q.query('update push_subscriptions set revoked_at = $2, last_failure_code = $3 where id = $1', [target.id, deps.clock.now(), outcome.statusCode]);
      });
    } else {
      anyRetryable = anyRetryable || outcome.retryable;
      await deps.db.query("update notification_deliveries set status = 'failed', error_code = $3 where job_id = $1 and recipient_ref = $2", [job.id, target.id, String(outcome.statusCode ?? 'network')]);
    }
  }
  return anyRetryable ? 'retry' : 'sent';
}

async function runEmailReminder(deps: Deps, job: JobRow): Promise<'sent' | 'retry'> {
  const [session] = await deps.db.query<{ name: string; window_opens_at: Date }>(
    'select name, window_opens_at from sessions where id = $1',
    [job.session_id],
  );
  const recipients = await deps.db.query<{ id: string; email: string }>(
    `select p.id, p.email from profiles p join alert_preferences ap on ap.profile_id = p.id where ap.email_reminders`,
  );
  const when = session.window_opens_at.toLocaleString('en-IN', { timeZone: deps.config.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  let anyRetryable = false;
  for (const recipient of recipients) {
    const claimed = await deps.db.query(
      `insert into notification_deliveries (job_id, recipient_ref, status)
       values ($1, $2, 'pending')
       on conflict (job_id, recipient_ref) do update set status = 'pending', attempted_at = now()
         where notification_deliveries.status <> 'sent'
       returning recipient_ref`,
      [job.id, recipient.id],
    );
    if (claimed.length === 0) continue;
    try {
      await deps.email.send({
        to: recipient.email,
        subject: `${session.name} opens ${when} (IST)`,
        text: `${session.name} opens ${when} IST.\n\nYou will get a browser alert 30 seconds before each drop, if you have browser alerts on. Email is for session reminders only and is not a reliable 30-second signal.\n\nManage your alerts at any time from your account.`,
      });
      await deps.db.query("update notification_deliveries set status = 'sent' where job_id = $1 and recipient_ref = $2", [job.id, recipient.id]);
    } catch {
      anyRetryable = true;
      await deps.db.query("update notification_deliveries set status = 'failed', error_code = 'send_failed' where job_id = $1 and recipient_ref = $2", [job.id, recipient.id]);
    }
  }
  return anyRetryable ? 'retry' : 'sent';
}

async function runJob(deps: Deps, job: JobRow, summary: DispatchSummary): Promise<void> {
  const now = deps.clock.now();
  if (now.getTime() > job.deadline_at.getTime()) {
    await settle(deps, job, 'expired', { lastError: 'deadline_passed' });
    summary.expired += 1;
    return;
  }

  if (job.kind === 'push_alert') {
    if (!deps.push.configured) {
      await settleAfterFailures(deps, job, 'push_not_configured');
      summary.failed += 1;
      return;
    }
    const result = await runPushAlert(deps, job);
    if (result === 'cancelled') {
      await settle(deps, job, 'cancelled', { lastError: 'drop_cancelled' });
      summary.cancelled += 1;
    } else if (result === 'deferred') {
      await settle(deps, job, 'queued', { runAt: new Date(now.getTime() + 15_000) });
      summary.deferred += 1;
    } else if (result === 'retry') {
      await settleAfterFailures(deps, job, 'some_deliveries_failed');
      summary.failed += 1;
    } else {
      await settle(deps, job, 'sent');
      summary.sent += 1;
    }
    return;
  }

  const result = await runEmailReminder(deps, job);
  if (result === 'retry') {
    await settleAfterFailures(deps, job, 'some_emails_failed');
    summary.failed += 1;
  } else {
    await settle(deps, job, 'sent');
    summary.sent += 1;
  }
}

export async function dispatchDueJobs(deps: Deps, limit = 20): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, expired: 0, cancelled: 0, deferred: 0 };
  const jobs = await claimDueJobs(deps, limit);
  summary.claimed = jobs.length;
  for (const job of jobs) await runJob(deps, job, summary);
  return summary;
}

/** Re-queues a failed or expired job, if its drop still has time left. Admin action. */
export async function retryJob(deps: Deps, adminId: string, jobId: string): Promise<void> {
  await deps.db.tx(async (q) => {
    const [job] = await q.query<{ status: string; deadline_at: Date; kind: string }>(
      'select status, deadline_at, kind from notification_jobs where id = $1 for update',
      [jobId],
    );
    if (!job) throw fail.notFound('That job was not found.');
    const now = deps.clock.now();
    if (job.deadline_at.getTime() <= now.getTime()) {
      throw fail.conflict('deadline_passed', 'This alert is past its deadline and cannot be sent late.');
    }
    await q.query(
      "update notification_jobs set status = 'queued', run_at = $2, attempts = 0, last_error = null, updated_at = $2 where id = $1",
      [jobId, now],
    );
    await audit(q, {
      actorId: adminId,
      actorKind: 'admin',
      action: 'job.retried',
      entityType: 'notification_job',
      entityId: jobId,
      before: { status: job.status },
      after: { status: 'queued' },
    });
  });
}

export interface SweepSummary {
  holdsExpired: number;
  paymentsChecked: number;
  paymentsPaid: number;
  paymentsRecycled: number;
  paymentsDeferred: number;
  paymentsFailed: number;
  refundsRetried: number;
}

/** Expires unpaid holds, reconciles payments still in flight, and retries interrupted refunds. */
export async function sweep(deps: Deps): Promise<SweepSummary> {
  const now = deps.clock.now();
  const expired = await deps.db.query(
    `update reservations set status = 'expired', status_reason = 'hold_ended', updated_at = $1
      where status = 'held' and expires_at <= $1 returning id`,
    [now],
  );

  const summary: SweepSummary = {
    holdsExpired: expired.length,
    paymentsChecked: 0,
    paymentsPaid: 0,
    paymentsRecycled: 0,
    paymentsDeferred: 0,
    paymentsFailed: 0,
    refundsRetried: 0,
  };

  const graceMs = deps.config.paymentGraceSeconds * 1000;
  const stale = await deps.db.query<{
    reservation_id: string;
    drop_id: string;
    order_id: string;
    provider_order_id: string | null;
    expires_at: Date;
  }>(
    `select r.id as reservation_id, r.drop_id, r.expires_at, o.id as order_id, o.provider_order_id
       from reservations r
       join orders o on o.reservation_id = r.id
      where r.status = 'paying' and r.expires_at <= $1
      order by r.expires_at
      limit 100`,
    [now],
  );

  for (const row of stale) {
    summary.paymentsChecked += 1;
    try {
      if (!row.provider_order_id) {
        await recycleReservation(deps, row, 'checkout_never_started', false);
        summary.paymentsRecycled += 1;
        continue;
      }
      // Ask the provider before recycling. A capture that lands now is applied to this buyer, not a stranger.
      const payments = await deps.payments.fetchOrderPayments(row.provider_order_id);
      const captured = payments.find((p) => p.status === 'captured');
      if (captured) {
        await settleCapturedPayment(deps, `reconcile:${captured.id}`, 'reconcile.captured', captured);
        summary.paymentsPaid += 1;
        continue;
      }
      if (now.getTime() < row.expires_at.getTime() + graceMs) {
        summary.paymentsDeferred += 1;
        continue;
      }
      const inFlight = payments.some((p) => p.status === 'authorized' || p.status === 'created');
      await recycleReservation(deps, row, 'payment_not_completed', inFlight);
      summary.paymentsRecycled += 1;
    } catch {
      summary.paymentsFailed += 1;
    }
  }

  const refunds = await deps.db.query<{ id: string }>(
    "select id from refunds where status = 'requested' and created_at < $1::timestamptz - interval '1 minute' limit 20",
    [now],
  );
  for (const refund of refunds) {
    await executeRefund(deps, refund.id);
    summary.refundsRetried += 1;
  }

  await deps.db.tx(async (q) => {
    // A refund stuck 'pending' past the timeout may or may not have reached the provider. Ask a human.
    const stuck = await q.query<{ id: string; order_id: string; provider_payment_id: string; amount_paise: number }>(
      `select id, order_id, provider_payment_id, amount_paise from refunds
        where status = 'pending' and updated_at < $1::timestamptz - interval '10 minutes'
          and not exists (
            select 1 from reconciliation_cases c
             where c.kind = 'refund_failed' and c.status = 'open' and c.details->>'refundId' = refunds.id::text
          )`,
      [now],
    );
    for (const refund of stuck) {
      await openCase(q, {
        kind: 'refund_failed',
        orderId: refund.order_id,
        providerPaymentId: refund.provider_payment_id,
        amountPaise: refund.amount_paise,
        details: { refundId: refund.id, reason: 'Refund stayed pending past the timeout. Check the provider dashboard.' },
      });
    }
  });

  return summary;
}

async function recycleReservation(
  deps: Deps,
  row: { reservation_id: string; drop_id: string; order_id: string },
  reason: string,
  inFlight: boolean,
): Promise<void> {
  const now = deps.clock.now();
  await deps.db.tx(async (q) => {
    await lockDrop(q, row.drop_id);
    const [res] = await q.query<{ status: string }>('select status from reservations where id = $1 for update', [
      row.reservation_id,
    ]);
    if (!res || res.status !== 'paying') return;
    await q.query("update reservations set status = 'expired', status_reason = $2, updated_at = $3 where id = $1", [
      row.reservation_id,
      reason,
      now,
    ]);
    await q.query(
      "update orders set payment_status = 'abandoned', updated_at = $2 where id = $1 and payment_status = 'awaiting_payment'",
      [row.order_id, now],
    );
    if (inFlight) {
      await openCase(q, {
        kind: 'uncertain_payment',
        orderId: row.order_id,
        reservationId: row.reservation_id,
        details: { reason: 'A payment attempt was still in flight when its unit was recycled. Any late capture will be refunded.' },
      });
    }
  });
}

