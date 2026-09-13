import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PERSONAS } from '../data/personas';
import { useApp } from '../state/AppContext';
import { Button, IconButton, Screen } from '../components/ui';
import { PRICE_LABEL, PRICE_PERIOD, activeProvider } from '../lib/billing';

export function Paywall() {
  const { buyPremium, restore, selectPersona, buzz } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wanted = params.get('persona');
  const locked = PERSONAS.filter((p) => p.isPremium);
  const hero = locked.find((p) => p.id === wanted) ?? locked[0];

  const onBuy = async () => {
    buzz();
    setBusy(true);
    setError(null);
    const ok = await buyPremium();
    setBusy(false);
    if (!ok) {
      setError("That didn't go through. No charge was made — try again?");
      return;
    }
    // Drop them straight into the persona they came here for.
    if (wanted) await selectPersona(wanted);
    navigate('/', { replace: true });
  };

  const onRestore = async () => {
    buzz();
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    if (ok) navigate('/', { replace: true });
    else setError('No active subscription found on this device.');
  };

  return (
    <Screen>
      <div className="flex justify-end pt-3">
        <IconButton label="Close" onClick={() => navigate(-1)}>
          ✕
        </IconButton>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="pb-8"
      >
        <div
          className={`mx-auto grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br ${hero.theme.gradient} text-5xl`}
          aria-hidden
        >
          {hero.emoji}
        </div>

        <h1 className="mt-5 text-center font-display text-3xl leading-tight tracking-tight">
          Let the others in
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-[15px] leading-snug text-white/55">
          One voice gets predictable. Premium unlocks every persona, so you never
          quite know who's coming for you.
        </p>

        {/* Sample lines from each locked persona */}
        <div className="mt-7 flex flex-col gap-3">
          {locked.map((p) => (
            <div
              key={p.id}
              className={`rounded-3xl bg-gradient-to-br ${p.theme.gradient} p-[1px]`}
            >
              <div className="rounded-[calc(1.5rem-1px)] bg-ink-card/90 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>{p.emoji}</span>
                  <h2 className="font-display text-lg">{p.name}</h2>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {p.lines.slice(0, 2).map((l) => (
                    <li
                      key={l.id}
                      className="rounded-xl bg-white/5 px-3 py-2 text-[14px] leading-snug"
                    >
                      “{l.text}”
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <ul className="mt-6 flex flex-col gap-2.5">
          {[
            'All 3 personas — 90 lines in rotation',
            'Every nudge category unlocked',
            'Custom persona sounds',
            'New line packs as they land, included',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px]">
              <span className="mt-0.5 text-emerald-400" aria-hidden>✓</span>
              <span className="text-white/75">{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 rounded-3xl border-2 border-white/15 bg-white/5 p-5 text-center">
          <p className="font-display text-4xl leading-none">{PRICE_LABEL}</p>
          <p className="mt-1 text-sm text-white/50">per {PRICE_PERIOD}, cancel anytime</p>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}

        <Button
          full
          disabled={busy}
          accent={hero.theme.accent}
          onAccent={hero.theme.onAccent}
          className="mt-5 h-14"
          onClick={onBuy}
        >
          {busy ? 'One moment…' : `Unlock everything`}
        </Button>

        <button
          onClick={onRestore}
          disabled={busy}
          className="tap mt-2 w-full rounded-2xl px-4 text-sm font-semibold text-white/55 transition active:bg-white/5"
        >
          Restore purchases
        </button>

        {activeProvider.id === 'stub' && (
          // Visible only while billing is stubbed, so nobody mistakes the
          // sandbox unlock for a real transaction. Remove with the stub.
          <p className="mt-4 rounded-2xl border border-dashed border-amber-400/30 bg-amber-400/5 px-4 py-3 text-center text-[12px] leading-snug text-amber-200/70">
            Developer build — billing is not connected yet. This button unlocks
            premium locally and charges nothing.
          </p>
        )}

        <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-white/30">
          Subscription renews automatically until cancelled. Everything Nudge
          stores stays on this device.
        </p>
      </motion.div>
    </Screen>
  );
}
