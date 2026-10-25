import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFor } from '../lib/api.ts';
import { useSession } from '../lib/auth.tsx';
import { disableBrowserAlerts, enableBrowserAlerts, pushState } from '../lib/alerts.ts';
import { Notice } from '../components/Notice.tsx';

/**
 * Alert settings. Browser permission is asked only after the buyer presses the button
 * that says so, and every outcome has a plain-language message.
 */
export function Alerts() {
  const { me, config, loading, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const permission = pushState();

  if (loading) return <div className="shell py-12"><div className="card h-64 animate-pulse" /></div>;

  if (!me) {
    return (
      <div className="shell py-12 md:py-16">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <h1 className="text-5xl uppercase">Drop alerts</h1>
          <Notice>Sign in to turn on alerts. We use your account so your settings follow you to any device.</Notice>
          <Link to="/login?next=/alerts" className="btn-primary self-start">
            Sign in to get alerts
          </Link>
        </div>
      </div>
    );
  }

  const pushOn = me.alerts.pushEnabled && me.pushSubscribed;

  const turnOnBrowser = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await enableBrowserAlerts(config?.vapidPublicKey ?? null);
      if (result === 'enabled') setMessage({ tone: 'success', text: 'Browser alerts are on. We will alert you 30 seconds before each drop.' });
      if (result === 'denied') setMessage({ tone: 'warn', text: 'Notifications are blocked for this site. Allow them in your browser settings, then try again. You can still get email reminders.' });
      if (result === 'unsupported') setMessage({ tone: 'warn', text: 'This browser cannot receive push alerts. Email reminders still work.' });
      if (result === 'not_configured') setMessage({ tone: 'warn', text: 'Browser alerts are not configured on this server yet.' });
      await refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  const turnOffEverything = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disableBrowserAlerts();
      await refresh();
      setMessage({ tone: 'success', text: 'All alerts are off. You can turn them back on at any time.' });
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  const toggleEmail = async (checked: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await api('/me/alert-preferences', { method: 'PUT', body: { emailReminders: checked } });
      await refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: messageFor(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell py-10 md:py-14">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <p className="eyebrow text-lime">Alerts</p>
          <h1 className="mt-3 text-5xl uppercase sm:text-6xl">Drop alerts</h1>
          <p className="mt-3 text-muted">
            Alerts are free and optional. Browser alerts arrive about 30 seconds before each drop, when your device and network allow. Delivery is not guaranteed to the second.
          </p>
        </div>

        {message && <Notice tone={message.tone === 'error' ? 'error' : message.tone === 'warn' ? 'warn' : 'success'}>{message.text}</Notice>}

        <section className="card flex flex-col gap-5 p-6" aria-labelledby="browser-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="browser-title" className="text-3xl uppercase">
                Browser alerts
              </h2>
              <p className="mt-2 text-sm text-muted">A notification from this site, 30 seconds before each drop.</p>
            </div>
            <span className={`chip ${pushOn ? 'border-lime/50 bg-lime/10 text-lime' : 'border-line bg-elevated text-muted'}`}>
              {pushOn ? 'On' : 'Off'}
            </span>
          </div>

          {permission === 'unsupported' && <Notice tone="warn">This browser cannot receive push alerts. Email reminders still work.</Notice>}
          {permission === 'denied' && (
            <Notice tone="warn">Notifications are blocked for this site. Allow them in your browser settings to turn alerts on.</Notice>
          )}

          {pushOn ? (
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={turnOffEverything} disabled={busy}>
              Turn off browser alerts
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              onClick={turnOnBrowser}
              disabled={busy || permission === 'unsupported'}
            >
              Turn on browser alerts
            </button>
          )}
          <p className="text-xs text-muted">We ask your browser for permission only when you press that button.</p>
        </section>

        <section className="card flex flex-col gap-5 p-6" aria-labelledby="email-title">
          <div>
            <h2 id="email-title" className="text-3xl uppercase">
              Email reminders
            </h2>
            <p className="mt-2 text-sm text-muted">
              A reminder when a session is about to open, sent to {me.profile.email}. Email is not a reliable 30-second signal, so use browser alerts for that.
            </p>
          </div>
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-[14px] border border-line bg-bg px-4">
            <span className="font-medium">Email me session reminders</span>
            <input
              type="checkbox"
              className="size-6 accent-[#d9ff43]"
              checked={me.alerts.emailReminders}
              disabled={busy}
              onChange={(event) => toggleEmail(event.target.checked)}
            />
          </label>
        </section>

        <div className="flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Unsubscribing removes every alert and forgets this browser. Your account stays.</p>
          <button type="button" className="btn-ghost text-danger" onClick={turnOffEverything} disabled={busy}>
            Unsubscribe from all alerts
          </button>
        </div>
      </div>
    </div>
  );
}
