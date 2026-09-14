import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PERSONAS, NUDGES_PER_PERSONA } from '../data/personas';
import { useApp } from '../state/AppContext';
import { Button, Screen } from '../components/ui';
import { PRICE_LABEL, PRICE_PERIOD, activeProvider } from '../lib/billing';

/**
 * The subscription gate.
 *
 * Nudge is a paid app, so this is not an upsell that can be dismissed — it is
 * the last step before the app opens. The only ways past it are paying,
 * restoring an existing subscription, or signing out.
 */
export function Paywall() {
  const { buyPremium, restore, signOut, session, buzz } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onBuy = async () => {
    buzz();
    setBusy('buy');
    setError(null);
    const ok = await buyPremium();
    setBusy(null);
    if (!ok) {
      setError("That didn't go through. You haven't been charged — try again?");
      return;
    }
    navigate('/', { replace: true });
  };

  const onRestore = async () => {
    buzz();
    setBusy('restore');
    setError(null);
    const ok = await restore();
    setBusy(null);
    if (ok) navigate('/', { replace: true });
    else setError('No active subscription found for this account.');
  };

  return (
    <Screen>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="pt-10 pb-8"
      >
        <div
          className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 text-4xl"
          aria-hidden
        >
          🫡
        </div>

        <h1 className="mt-5 text-center font-display text-3xl leading-tight tracking-tight">
          Nudge is {PRICE_LABEL} a {PRICE_PERIOD}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-[15px] leading-snug text-white/55">
          One subscription, everything included. Cancel whenever you like.
        </p>

        <ul className="mt-7 flex flex-col gap-2.5">
          {[
            `All ${PERSONAS.length} personas — swap whenever you fancy`,
            `${NUDGES_PER_PERSONA.toLocaleString()} nudges each, none repeated until you've seen them all`,
            'This-or-that: a real drill or something daft, your call',
            'Your own schedule and active hours',
            'Works offline — nothing about your day leaves your phone',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px]">
              <span className="mt-0.5 text-emerald-400" aria-hidden>✓</span>
              <span className="text-white/75">{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex gap-3">
          {PERSONAS.map((p) => (
            <div
              key={p.id}
              className={`flex-1 rounded-2xl bg-gradient-to-br ${p.theme.gradient} p-[1px]`}
            >
              <div className="flex h-full flex-col items-center justify-center rounded-[calc(1rem-1px)] bg-ink-card/90 px-2 py-3 text-center">
                <span className="text-2xl" aria-hidden>{p.emoji}</span>
                <span className="mt-1 text-[11px] font-bold leading-tight text-white/60">
                  {p.name}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 rounded-3xl border-2 border-white/15 bg-white/5 p-5 text-center">
          <p className="font-display text-4xl leading-none">{PRICE_LABEL}</p>
          <p className="mt-1 text-sm text-white/50">
            per {PRICE_PERIOD}, cancel anytime
          </p>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}

        <Button
          full
          disabled={busy !== null}
          className="mt-5 h-14"
          onClick={onBuy}
        >
          {busy === 'buy' ? 'One moment…' : `Subscribe — ${PRICE_LABEL}/${PRICE_PERIOD}`}
        </Button>

        <button
          onClick={onRestore}
          disabled={busy !== null}
          className="tap mt-2 w-full rounded-2xl px-4 text-sm font-semibold text-white/55 transition active:bg-white/5 disabled:opacity-40"
        >
          {busy === 'restore' ? 'Checking…' : 'I already subscribed — restore'}
        </button>

        {activeProvider.id === 'stub' && (
          // Visible only while billing is stubbed, so nobody mistakes the
          // sandbox unlock for a real transaction. Remove with the stub.
          <p className="mt-4 rounded-2xl border border-dashed border-amber-400/30 bg-amber-400/5 px-4 py-3 text-center text-[12px] leading-snug text-amber-200/70">
            Developer build — billing is not connected yet. This button
            subscribes locally and charges nothing.
          </p>
        )}

        {/* The gate cannot be dismissed, but the account is not a trap: signing
            out returns to the login screen so a different number can be used. */}
        <button
          onClick={() => {
            buzz();
            void signOut();
          }}
          disabled={busy !== null}
          className="tap mt-6 w-full rounded-2xl px-4 text-[13px] font-semibold text-white/35 transition active:bg-white/5"
        >
          {session?.user.phoneNumber
            ? 'Sign out and use a different number'
            : 'Sign out'}
        </button>

        <p className="mt-3 px-2 text-center text-[11px] leading-relaxed text-white/30">
          Renews automatically until cancelled.
        </p>
      </motion.div>
    </Screen>
  );
}
