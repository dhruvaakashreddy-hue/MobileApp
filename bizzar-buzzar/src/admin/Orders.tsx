import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { formatDateTime, money } from '../lib/format.ts';
import { PaymentChip, FulfilmentChip } from '../components/StatusChip.tsx';
import { Notice } from '../components/Notice.tsx';
import { Button, Cell, Field, Flash, formData, inputClass, rupeesToPaise, Section, Table, useAction, useAsync } from './ui.tsx';
import type { OrderPaymentStatus, FulfilmentStatus } from '../../shared/api-types.ts';

interface OrderRow {
  id: string;
  order_no: number;
  payment_status: OrderPaymentStatus;
  fulfilment_status: FulfilmentStatus;
  total_paise: number;
  refunded_paise: number;
  paid_at: string | null;
  product_name: string;
  buyer_email: string;
}

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All orders' },
  { value: 'paid', label: 'Paid' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'refund_pending', label: 'Refund pending' },
  { value: 'needs_review', label: 'Needs review' },
];

export function Orders() {
  const [filter, setFilter] = useState('');
  const { data, error } = useAsync<{ orders: OrderRow[] }>(`/admin/orders${filter ? `?paymentStatus=${filter}` : ''}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-amber">Fulfilment</p>
        <h1 className="mt-2 text-5xl uppercase">Orders</h1>
      </div>
      <Section
        title="Orders"
        actions={
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted">Show</span>
            <select className="field min-h-10 py-1 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        {data && data.orders.length === 0 && <p className="text-sm text-muted">No orders match this filter.</p>}
        {data && data.orders.length > 0 && (
          <Table head={['Order', 'Product', 'Buyer', 'Total', 'Payment', 'Fulfilment', 'Paid']}>
            {data.orders.map((order) => (
              <tr key={order.id}>
                <Cell>
                  <Link to={`/admin/orders/${order.id}`} className="font-semibold underline underline-offset-4">
                    #{order.order_no}
                  </Link>
                </Cell>
                <Cell>{order.product_name}</Cell>
                <Cell className="text-muted">{order.buyer_email}</Cell>
                <Cell className="num">
                  {money(order.total_paise)}
                  {order.refunded_paise > 0 && <span className="block text-xs text-muted">refunded {money(order.refunded_paise)}</span>}
                </Cell>
                <Cell>
                  <PaymentChip status={order.payment_status} />
                </Cell>
                <Cell>
                  <FulfilmentChip status={order.fulfilment_status} />
                </Cell>
                <Cell className="text-muted">{order.paid_at ? formatDateTime(order.paid_at) : '—'}</Cell>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

interface OrderDetailData {
  order: Record<string, unknown> & {
    id: string;
    order_no: number;
    payment_status: OrderPaymentStatus;
    fulfilment_status: FulfilmentStatus;
    total_paise: number;
    refunded_paise: number;
    carrier: string | null;
    tracking_number: string | null;
    buyer_email: string;
    provider_payment_id: string | null;
    address: { fullName: string; line1: string; city: string; state: string; pincode: string };
    product_snapshot: { name: string; sku: string; condition: string };
  };
  notes: { id: string; body: string; created_at: string; author: string | null }[];
  refunds: { id: string; kind: string; amount_paise: number; status: string; reason: string; error: string | null }[];
  events: { event_type: string; outcome: string | null; amount_paise: number | null; received_at: string }[];
  cases: { id: string; kind: string; status: string; details: Record<string, unknown> }[];
  margin: { status: 'complete'; marginPaise: number } | { status: 'incomplete'; missing: string[] };
}

export function OrderDetail() {
  const { orderId = '' } = useParams();
  const { data, error, reload } = useAsync<OrderDetailData>(`/admin/orders/${orderId}`);
  const fulfil = useAction();
  const note = useAction();
  const refund = useAction();

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="card h-64 animate-pulse" />;
  const { order } = data;

  const onFulfil = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void fulfil.run(
      () =>
        api(`/admin/orders/${orderId}/fulfilment`, {
          method: 'PUT',
          body: { status: form.status, carrier: form.carrier || null, trackingNumber: form.trackingNumber || null },
        }),
      'Fulfilment updated.',
      reload,
    );
  };

  const onNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void note.run(() => api(`/admin/orders/${orderId}/notes`, { body: { body: form.body } }), 'Note added.', reload);
    (event.target as HTMLFormElement).reset();
  };

  const onRefund = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void refund.run(
      () =>
        api(`/admin/orders/${orderId}/refunds`, {
          body: { amountPaise: rupeesToPaise(form.amount) ?? undefined, reason: form.reason },
        }),
      'Refund requested. It completes when the provider confirms it.',
      reload,
    );
  };

  const refundable = order.total_paise - order.refunded_paise;
  const marginLine =
    data.margin.status === 'complete'
      ? money(data.margin.marginPaise)
      : `Incomplete. Missing: ${data.margin.missing.map((m) => m.replace('_', ' ')).join(', ')}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/admin/orders" className="text-sm text-muted underline underline-offset-4">
            All orders
          </Link>
          <h1 className="mt-2 text-5xl uppercase">Order #{order.order_no}</h1>
          <p className="mt-2 text-sm text-muted">
            {order.product_snapshot.name} · {order.buyer_email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PaymentChip status={order.payment_status} />
          <FulfilmentChip status={order.fulfilment_status} />
        </div>
      </div>

      {order.payment_status === 'needs_review' && <Notice tone="warn">The payment amount did not match. Check the case below before fulfilling.</Notice>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Money">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Total</dt>
            <dd className="num text-right">{money(order.total_paise)}</dd>
            <dt className="text-muted">Refunded</dt>
            <dd className="num text-right">{money(order.refunded_paise)}</dd>
            <dt className="text-muted">Margin</dt>
            <dd className="text-right">{marginLine}</dd>
            <dt className="text-muted">Provider payment</dt>
            <dd className="num text-right text-xs break-all">{order.provider_payment_id ?? '—'}</dd>
          </dl>
          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm font-semibold">Refund</p>
            <form onSubmit={onRefund} className="grid gap-3 sm:grid-cols-2">
              <Field label={`Amount (₹), up to ${money(refundable)}`} hint="Leave empty to refund the rest.">
                <input name="amount" inputMode="decimal" className={inputClass} disabled={refundable <= 0} />
              </Field>
              <Field label="Reason (buyer and audit log)">
                <input name="reason" required className={inputClass} disabled={refundable <= 0} />
              </Field>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                <Button tone="danger" type="submit" busy={refund.busy}>
                  Request refund
                </Button>
                <Flash message={refund.message} />
              </div>
            </form>
            {data.refunds.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {data.refunds.map((r) => (
                  <li key={r.id}>
                    {money(r.amount_paise)} · {r.kind} · <span className="text-muted">{r.status}</span> · {r.reason}
                    {r.error && <span className="block text-xs text-danger">{r.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Fulfilment">
          <form onSubmit={onFulfil} className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <select name="status" defaultValue={order.fulfilment_status} className={inputClass}>
                <option value="unfulfilled">Not yet dispatched</option>
                <option value="preparing">Being prepared</option>
                <option value="shipped">Shipped (needs tracking)</option>
                <option value="delivered">Delivered (needs tracking)</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Carrier">
              <input name="carrier" defaultValue={order.carrier ?? ''} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Tracking number">
                <input name="trackingNumber" defaultValue={order.tracking_number ?? ''} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <Button tone="primary" type="submit" busy={fulfil.busy}>
                Save fulfilment
              </Button>
              <Flash message={fulfil.message} />
            </div>
          </form>
          <div className="border-t border-line pt-4 text-sm">
            <p className="font-semibold">Ship to</p>
            <p className="text-muted">
              {order.address.fullName}, {order.address.line1}, {order.address.city}, {order.address.state} {order.address.pincode}
            </p>
          </div>
        </Section>

        <Section title="Payment events">
          {data.events.length === 0 && <p className="text-sm text-muted">No provider events yet.</p>}
          <ul className="space-y-2 text-sm">
            {data.events.map((event, index) => (
              <li key={`${event.event_type}-${index}`}>
                {event.event_type} · <span className="text-muted">{event.outcome ?? 'recorded'}</span> · {formatDateTime(event.received_at)}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Cases">
          {data.cases.length === 0 && <p className="text-sm text-muted">No reconciliation cases for this order.</p>}
          <ul className="space-y-3 text-sm">
            {data.cases.map((item) => (
              <li key={item.id} className="rounded-[12px] border border-line p-3">
                <p className="font-semibold">{item.kind.replace(/_/g, ' ')}</p>
                <p className="text-muted">{item.status}</p>
                <p className="mt-1 text-xs text-muted">{JSON.stringify(item.details)}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Support notes">
        <p className="text-sm text-muted">Notes are for staff only. Buyers never see them.</p>
        <ul className="space-y-3 text-sm">
          {data.notes.map((item) => (
            <li key={item.id} className="rounded-[12px] border border-line p-3">
              <p>{item.body}</p>
              <p className="mt-1 text-xs text-muted">
                {item.author ?? 'Staff'} · {formatDateTime(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
        <form onSubmit={onNote} className="grid gap-3">
          <Field label="Add a note">
            <textarea name="body" required rows={2} className="field py-3 text-sm" />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" busy={note.busy}>
              Add note
            </Button>
            <Flash message={note.message} />
          </div>
        </form>
      </Section>
    </div>
  );
}
