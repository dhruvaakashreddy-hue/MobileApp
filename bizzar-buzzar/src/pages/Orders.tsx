import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { OrderSummary } from '../../shared/api-types.ts';
import { api, messageFor } from '../lib/api.ts';
import { useSession } from '../lib/auth.tsx';
import { formatDateTime, money } from '../lib/format.ts';
import { FulfilmentChip, PaymentChip } from '../components/StatusChip.tsx';
import { Notice } from '../components/Notice.tsx';

export function Orders() {
  const { me, loading } = useSession();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !me) navigate('/login?next=/orders', { replace: true });
  }, [loading, me, navigate]);

  useEffect(() => {
    if (!me) return;
    api<{ orders: OrderSummary[] }>('/orders')
      .then((response) => setOrders(response.orders))
      .catch((caught) => setError(messageFor(caught)));
  }, [me]);

  return (
    <div className="shell py-10 md:py-14">
      <p className="eyebrow text-lime">Orders</p>
      <h1 className="mt-3 text-5xl uppercase sm:text-6xl">Your orders</h1>
      {error && <div className="mt-6"><Notice tone="error">{error}</Notice></div>}
      {!orders && !error && <div className="card mt-8 h-40 animate-pulse" />}
      {orders && orders.length === 0 && (
        <div className="card mt-8 p-6">
          <p className="text-muted">No orders yet. When you buy a drop, it appears here.</p>
        </div>
      )}
      <ul className="mt-8 grid gap-4">
        {orders?.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`} className="card flex flex-col gap-4 p-5 no-underline transition-colors hover:border-muted sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Order #{order.orderNo}</span>
                <span className="text-xl font-semibold">{order.productName}</span>
                <span className="num text-sm text-muted">{money(order.totalPaise)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <PaymentChip status={order.paymentStatus} />
                <FulfilmentChip status={order.fulfilmentStatus} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type OrderDetailView = OrderSummary & {
  address: { fullName: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string };
};

const TIMELINE = ['Payment confirmed', 'Being prepared', 'Shipped', 'Delivered'] as const;

export function OrderDetail() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { me, loading } = useSession();
  const [order, setOrder] = useState<OrderDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!loading && !me) navigate(`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`, { replace: true });
  }, [loading, me, navigate, orderId]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = () =>
      api<OrderDetailView>(`/orders/${orderId}`)
        .then((value) => {
          if (!cancelled) setOrder(value);
        })
        .catch((caught) => {
          if (!cancelled) setError(messageFor(caught));
        });
    void load();
    // Payment confirmation can arrive a little after the browser returns. Re-read until it is settled.
    const id = window.setInterval(() => {
      if (!settled.current) void load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [me, orderId]);

  useEffect(() => {
    settled.current = order !== null && order.paymentStatus !== 'awaiting_payment';
  }, [order]);

  if (error) return <div className="shell py-12"><Notice tone="error">{error}</Notice></div>;
  if (!order) return <div className="shell py-12"><div className="card h-80 animate-pulse" /></div>;

  const stage = order.fulfilmentStatus === 'delivered' ? 3 : order.fulfilmentStatus === 'shipped' ? 2 : order.fulfilmentStatus === 'preparing' ? 1 : 0;
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded' || order.paymentStatus === 'refunded';

  return (
    <div className="shell py-10 md:py-14">
      <Link to="/orders" className="text-sm text-muted underline underline-offset-4 hover:text-text">
        All orders
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <section className="flex flex-col gap-6">
          <div>
            <p className="eyebrow text-lime">Order #{order.orderNo}</p>
            <h1 className="mt-3 text-5xl uppercase sm:text-6xl">{order.productName}</h1>
            {order.paidAt && <p className="mt-2 text-sm text-muted">Paid {formatDateTime(order.paidAt)}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <PaymentChip status={order.paymentStatus} />
            <FulfilmentChip status={order.fulfilmentStatus} />
          </div>

          {order.paymentStatus === 'awaiting_payment' && (
            <Notice>We are waiting for the payment provider to confirm. This page updates on its own.</Notice>
          )}
          {order.paymentStatus === 'refund_pending' && (
            <Notice tone="warn">A refund is on its way to your original payment method.</Notice>
          )}

          {paid && (
            <ol className="card grid gap-4 p-6" aria-label="Delivery progress">
              {TIMELINE.map((label, index) => (
                <li key={label} className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`grid size-8 place-items-center rounded-full border text-sm font-bold ${index <= stage ? 'border-lime bg-lime text-[#090b0a]' : 'border-line text-muted'}`}
                  >
                    {index + 1}
                  </span>
                  <span className={index <= stage ? 'font-semibold text-text' : 'text-muted'}>{label}</span>
                </li>
              ))}
            </ol>
          )}

          {order.trackingNumber && (
            <div className="card p-6">
              <h2 className="text-2xl uppercase">Tracking</h2>
              <p className="mt-2 text-sm text-muted">
                {order.carrier ? `${order.carrier}: ` : ''}
                <span className="num font-semibold text-text">{order.trackingNumber}</span>
              </p>
            </div>
          )}
        </section>

        <aside className="card flex flex-col gap-5 p-6">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-base font-semibold">Total paid</dt>
            <dd className="num text-right text-2xl font-bold">{money(order.totalPaise)}</dd>
            {order.refundedPaise > 0 && (
              <>
                <dt className="text-muted">Refunded</dt>
                <dd className="num text-right">{money(order.refundedPaise)}</dd>
              </>
            )}
          </dl>
          <div className="border-t border-line pt-5 text-sm">
            <h2 className="mb-2 text-lg uppercase">Delivering to</h2>
            <p className="font-semibold">{order.address.fullName}</p>
            <p className="text-muted">
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city}, {order.address.state} {order.address.pincode}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Returns and warranty: <Link to="/returns" className="underline underline-offset-4">read the policy</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
