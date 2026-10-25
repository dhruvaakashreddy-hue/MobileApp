import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AddressView } from '../../shared/api-types.ts';
import { api, messageFor } from '../lib/api.ts';
import { useSession } from '../lib/auth.tsx';
import { Notice } from '../components/Notice.tsx';

const EMPTY_ADDRESS = { label: 'Home', fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

export function Account() {
  const { me, loading, refresh, signOut } = useSession();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<AddressView[]>([]);
  const [name, setName] = useState('');
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) navigate('/login?next=/account', { replace: true });
  }, [loading, me, navigate]);

  useEffect(() => {
    if (!me) return;
    setName(me.profile.displayName ?? '');
    api<{ addresses: AddressView[] }>('/me/addresses')
      .then((response) => setAddresses(response.addresses))
      .catch((error) => setMessage({ tone: 'error', text: messageFor(error) }));
  }, [me]);

  if (loading || !me) return <div className="shell py-12"><div className="card h-64 animate-pulse" /></div>;

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/me', { method: 'PATCH', body: { displayName: name.trim() || null } });
      await refresh();
      setMessage({ tone: 'success', text: 'Saved your name.' });
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  const addAddress = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api<AddressView>('/me/addresses', { body: { ...form, countryCode: 'IN' } });
      setAddresses((list) => [...list, saved]);
      setForm(EMPTY_ADDRESS);
      setMessage({ tone: 'success', text: 'Address saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  const removeAddress = async (id: string) => {
    setBusy(true);
    try {
      await api(`/me/addresses/${id}`, { method: 'DELETE' });
      setAddresses((list) => list.filter((address) => address.id !== id));
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof EMPTY_ADDRESS, label: string, props: { required?: boolean; inputMode?: 'numeric' | 'tel' | 'text' } = {}) => (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="field"
        value={form[key]}
        required={props.required}
        inputMode={props.inputMode}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <div className="shell py-10 md:py-14">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <div>
            <p className="eyebrow text-lime">Account</p>
            <h1 className="mt-3 text-5xl uppercase sm:text-6xl">Hello{me.profile.displayName ? `, ${me.profile.displayName}` : ''}</h1>
            <p className="mt-2 text-muted">{me.profile.email}</p>
          </div>

          {message && <Notice tone={message.tone}>{message.text}</Notice>}

          <form onSubmit={saveName} className="card flex flex-col gap-4 p-6">
            <label htmlFor="display-name" className="text-sm font-medium">
              Your name
            </label>
            <input id="display-name" className="field" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            <button type="submit" className="btn-secondary self-start" disabled={busy}>
              Save name
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/orders" className="card flex min-h-14 items-center justify-between p-5 font-semibold no-underline">
              Your orders <span aria-hidden="true">→</span>
            </Link>
            <Link to="/alerts" className="card flex min-h-14 items-center justify-between p-5 font-semibold no-underline">
              Drop alerts <span aria-hidden="true">→</span>
            </Link>
          </div>

          <button
            type="button"
            className="btn-ghost self-start"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Sign out
          </button>
        </div>

        <section className="flex flex-col gap-6" aria-labelledby="addresses-title">
          <div className="card flex flex-col gap-4 p-6">
            <h2 id="addresses-title" className="text-3xl uppercase">
              Delivery addresses
            </h2>
            {addresses.length === 0 && <p className="text-sm text-muted">No saved addresses yet. Add one below to check out.</p>}
            <ul className="flex flex-col gap-3">
              {addresses.map((address) => (
                <li key={address.id} className="flex items-start justify-between gap-4 rounded-[14px] border border-line bg-bg p-4">
                  <div className="text-sm">
                    <p className="font-semibold">
                      {address.label} · {address.fullName}
                    </p>
                    <p className="text-muted">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                    </p>
                    <p className="text-muted">{address.phone}</p>
                  </div>
                  <button type="button" className="btn-ghost min-h-10 px-2 text-danger" onClick={() => removeAddress(address.id)} disabled={busy}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={addAddress} className="card grid gap-4 p-6 sm:grid-cols-2" aria-label="Add a delivery address">
            <h3 className="text-2xl uppercase sm:col-span-2">Add an address</h3>
            {field('fullName', 'Full name', { required: true })}
            {field('phone', 'Mobile number', { required: true, inputMode: 'tel' })}
            <div className="sm:col-span-2">{field('line1', 'Address line 1', { required: true })}</div>
            <div className="sm:col-span-2">{field('line2', 'Address line 2 (optional)')}</div>
            {field('city', 'City', { required: true })}
            {field('state', 'State', { required: true })}
            {field('pincode', 'Pincode', { required: true, inputMode: 'numeric' })}
            <p className="text-xs text-muted sm:col-span-2">We deliver within India only.</p>
            <button type="submit" className="btn-primary sm:col-span-2 sm:justify-self-start" disabled={busy}>
              Save address
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
