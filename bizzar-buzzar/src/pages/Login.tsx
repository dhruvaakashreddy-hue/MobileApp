import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, messageFor } from '../lib/api.ts';
import { useSession } from '../lib/auth.tsx';
import { Notice } from '../components/Notice.tsx';

/** Only same-site paths are accepted as a destination after sign-in. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { me, refresh, config } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (me) navigate(next, { replace: true });
  }, [me, next, navigate]);

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/code', { body: { email: email.trim() } });
      setStep('code');
      setNotice(`We emailed a 6-digit code to ${email.trim()}. It expires in 10 minutes.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/verify', { body: { email: email.trim(), code: code.trim() } });
      await refresh();
      navigate(next, { replace: true });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell py-12 md:py-20">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div>
          <p className="eyebrow text-lime">Sign in</p>
          <h1 className="mt-3 text-5xl uppercase sm:text-6xl">
            {step === 'email' ? 'Email me a code' : 'Enter your code'}
          </h1>
          <p className="mt-3 text-muted">
            Sign in to reserve and buy drops. Browsing never needs an account.
          </p>
        </div>

        {config && !config.emailConfigured && (
          <Notice tone="warn">Email sign-in is not configured on this server yet.</Notice>
        )}
        {notice && <Notice tone="success">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {step === 'email' ? (
          <form onSubmit={requestCode} className="card flex flex-col gap-4 p-6">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
              placeholder="you@example.com"
            />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="card flex flex-col gap-4 p-6">
            <label htmlFor="code" className="text-sm font-medium">
              6-digit code
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="field num text-center text-2xl tracking-[0.4em]"
              aria-describedby="code-help"
            />
            <p id="code-help" className="text-xs text-muted">
              Five wrong attempts ends a code. You can request a new one after a minute.
            </p>
            <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn-ghost justify-center"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
