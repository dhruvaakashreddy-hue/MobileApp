import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AddressView } from '../../shared/api-types.ts';
import { api, messageFor } from '../lib/api.ts';
import { useSession } from '../lib/auth.tsx';
import { money } from '../lib/format.ts';
import { useReservation, usePreviewScenario } from '../lib/useDrop.ts';
import { loadRazorpayCheckout, type RazorpayResponse } from '../lib/razorpay.ts';
import { Countdown } from '../components/Countdown.tsx';
import { ProductArt } from '../components/ProductArt.tsx';
import { Notice, PreviewBanner } from '../components/Notice.tsx';
import { CONDITION_LABEL } from '../components/FeaturedDrop.tsx';

interface CheckoutOrder {
  orderId: string;
  paymentStatus: string;
  providerOrderId: string;
  keyId: string | null;
  amountPaise: number;
  currency: string;
  brand: string;
  prefill: { name: string; email: string; contact: string };
}

export function Checkout() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const preview = usePreviewScenario();
  const { me, loading, config } = useSession();
  const { reservation, error, refresh } = useReservation(reservationId);
  const [addresses, setAddresses] = useState<AddressView[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [holdEnded, setHoldEnded] = useState(false);
  const [newAddress, setNewAddress] = useState(false);
  const [draft, setDraft] = useState({ fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' });

  useEffect(() => {
    if (!loading && !me && !preview) navigate(`/login?next=${encodeURIComponent(`/checkout/${reservationId}`)}`, { replace: true });
  }, [loading, me, preview, navigate, reservationId]);

  useEffect(() => {
    if (preview || !me) return;
    api<{ addresses: AddressView[] }>('/me/addresses')
      .then((response) => {
        setAddresses(response.addresses);
        setAddressId((current) => current ?? response.addresses[0]?.id ?? null);
        setNewAddress(response.addresses.length === 0);
      })
      .catch((caught) => setMessage(messageFor(caught)));
  }, [me, preview]);

  if (loading) return <div className="shell py-12"><div className="card h-80 animate-pulse" /></div>;

  if (error && !reservation) {
    return (
      <div className="shell py-12">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!reservation) return <div className="shell py-12"><div className="card h-80 animate-pulse" /></div>;

  const isHeld = reservation.status === 'held';
  const endedMessage: Record<string, string> = {
    expired: 'Your hold ended, so the unit went back on sale. If you already paid, we confirm the order or refund it automatically.',
    released: 'You released this hold.',
    cancelled: 'This drop was cancelled. Nothing has been charged for this hold.',
  };

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api<AddressView>('/me/addresses', { body: { ...draft, countryCode: 'IN', label: 'Home' } });
      setAddresses((list) => [...list, saved]);
      setAddressId(saved.id);
      setNewAddress(false);
    } catch (caught) {
      setMessage(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!addressId) {
      setMessage('Choose a delivery address first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const order = await api<CheckoutOrder>(`/reservations/${reservation.id}/checkout`, { body: { addressId } });
      await loadRazorpayCheckout();
      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout || !order.keyId) throw new Error('Checkout did not load');
      const widget = new RazorpayCheckout({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: order.brand,
        description: reservation.product.name,
        order_id: order.providerOrderId,
        prefill: order.prefill,
        theme: { color: '#d9ff43' },
        handler: async (response: RazorpayResponse) => {
          // The browser only passes the provider's answer along. The server checks it with the provider.
          try {
            const result = await api<{ orderId: string; paymentStatus: string }>('/checkout/verify', {
              body: {
                providerOrderId: response.razorpay_order_id,
                providerPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
            });
            navigate(`/orders/${result.orderId}`);
          } catch (caught) {
            setMessage(messageFor(caught));
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      widget.open();
    } catch (caught) {
      setMessage(messageFor(caught));
      setBusy(false);
    }
  };

  const paymentsReady = Boolean(config?.paymentsConfigured);

  return (
    <div className="shell py-8 md:py-12">
      {preview && <PreviewBanner />}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="flex flex-col gap-6" aria-labelledby="reserved-title">
          <div>
            <p className="eyebrow text-amber">{isHeld ? 'Hold in progress' : 'Your reservation'}</p>
            <h1 id="reserved-title" className="mt-3 text-5xl uppercase sm:text-6xl">
              {isHeld ? 'Reserved for you' : 'Reservation closed'}
            </h1>
          </div>

          {isHeld && !holdEnded && (
            <div className="card flex flex-col gap-3 p-6">
              <Countdown
                size="sm"
                label="Hold ends in"
                to={reservation.expiresAt}
                onZero={() => {
                  if (!holdEnded) {
                    setHoldEnded(true);
                    void refresh();
                  }
                }}
              />
              <p className="text-sm text-muted">The unit is held for you for two minutes. Check the total, then pay.</p>
            </div>
          )}

          {(!isHeld || holdEnded) && <Notice tone="warn">{endedMessage[reservation.status] ?? 'This hold is no longer active.'}</Notice>}

          {reservation.status === 'paid' || reservation.orderId ? (
            <Notice tone="success">
              Payment received.{' '}
              {reservation.orderId && (
                <Link className="font-semibold underline underline-offset-4" to={`/orders/${reservation.orderId}`}>
                  View your order
                </Link>
              )}
            </Notice>
          ) : null}

          <div className="card flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="sm:w-48">
              <ProductArt src={reservation.product.imageUrl} alt={reservation.product.name} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm text-muted">{CONDITION_LABEL[reservation.product.condition]} · quantity 1</p>
              <p className="font-display text-4xl leading-none font-black uppercase">{reservation.product.name}</p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-2xl uppercase">Delivery address</h2>
            {addresses.length > 0 && !newAddress && (
              <fieldset className="mt-4 flex flex-col gap-3">
                <legend className="sr-only">Choose a delivery address</legend>
                {addresses.map((address) => (
                  <label key={address.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-line bg-bg p-4 text-sm has-[:checked]:border-lime">
                    <input
                      type="radio"
                      name="address"
                      className="mt-1 size-4 accent-[#d9ff43]"
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                    />
                    <span>
                      <span className="font-semibold">{address.fullName}</span>
                      <br />
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                    </span>
                  </label>
                ))}
                <button type="button" className="btn-ghost justify-start px-0" onClick={() => setNewAddress(true)}>
                  Use a new address
                </button>
              </fieldset>
            )}
            {preview && (
              <div className="mt-4 rounded-[14px] border border-line bg-bg p-4 text-sm">
                <p className="font-semibold">Asha Rao</p>
                <p className="text-muted">12 MG Road, Bengaluru, Karnataka 560001</p>
                <p className="mt-2 text-xs text-amber">Sample address for the concept preview. Addresses you save are kept on your account.</p>
              </div>
            )}
            {(newAddress || addresses.length === 0) && !preview && (
              <form onSubmit={saveAddress} className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="New delivery address">
                {(['fullName', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'] as const).map((key) => (
                  <label key={key} className={`flex flex-col gap-2 text-sm ${key === 'line1' || key === 'line2' ? 'sm:col-span-2' : ''}`}>
                    <span className="font-medium">
                      {({ fullName: 'Full name', phone: 'Mobile number', line1: 'Address line 1', line2: 'Address line 2 (optional)', city: 'City', state: 'State', pincode: 'Pincode' } as const)[key]}
                    </span>
                    <input
                      className="field"
                      required={key !== 'line2'}
                      value={draft[key]}
                      inputMode={key === 'pincode' ? 'numeric' : key === 'phone' ? 'tel' : undefined}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    />
                  </label>
                ))}
                <button type="submit" className="btn-secondary sm:col-span-2 sm:justify-self-start" disabled={busy}>
                  Save and use this address
                </button>
              </form>
            )}
          </div>
        </section>

        <aside className="card sticky top-24 flex flex-col gap-5 p-6" aria-labelledby="summary-title">
          <h2 id="summary-title" className="text-2xl uppercase">
            Order summary
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Item</dt>
            <dd className="num text-right">{money(reservation.pricing.itemPaise)}</dd>
            <dt className="text-muted">Delivery</dt>
            <dd className="num text-right">{reservation.pricing.shippingPaise === 0 ? 'Free' : money(reservation.pricing.shippingPaise)}</dd>
            <dt className="text-base font-semibold">Total</dt>
            <dd className="num text-right text-2xl font-bold">{money(reservation.pricing.totalPaise)}</dd>
          </dl>
          <p className="text-xs leading-relaxed text-muted">
            The total is calculated by the server. Payment is handled by Razorpay. We never see your card details.
          </p>

          {message && <Notice tone="error">{message}</Notice>}
          {!paymentsReady && !preview && (
            <Notice tone="warn">Payments are not configured on this server yet. Your hold stays until it ends.</Notice>
          )}
          {preview && <Notice tone="warn">Preview only. No payment is taken in the concept preview.</Notice>}

          <button
            type="button"
            className="btn-primary w-full"
            onClick={pay}
            disabled={busy || !isHeld || holdEnded || !paymentsReady || preview !== null || !addressId}
          >
            {busy ? 'Opening payment…' : `Pay ${money(reservation.pricing.totalPaise)} securely`}
          </button>
          <p className="text-xs text-muted">
            Warranty and returns are set out on the <Link to="/returns" className="underline underline-offset-4">returns policy</Link> page.
          </p>
        </aside>
      </div>
    </div>
  );
}
