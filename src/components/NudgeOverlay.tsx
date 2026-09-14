import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { getPersona } from '../data/personas';
import { playPersonaSound } from '../lib/sound';
import { useApp } from '../state/AppContext';

/**
 * The this-or-that card.
 *
 * Every nudge offers two things to do: the one that's good for you, and the one
 * that's ridiculous. Making the user pick turns a notification they'd swipe
 * away into a five-second decision they'll actually act on — and either answer
 * gets them off the chair.
 */
export function NudgeOverlay() {
  const { activeNudge, dismissNudge, chooseNudge, buzz, settings } = useApp();
  const reduceMotion = useReducedMotion();
  const [picked, setPicked] = useState<'healthy' | 'chaos' | null>(null);

  useEffect(() => {
    if (!activeNudge) {
      setPicked(null);
      return;
    }
    buzz(ImpactStyle.Medium);
    playPersonaSound(getPersona(activeNudge.personaId), settings.soundEnabled);
  }, [activeNudge, buzz, settings.soundEnabled]);

  useEffect(() => {
    if (!activeNudge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissNudge();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNudge, dismissNudge]);

  const persona = activeNudge ? getPersona(activeNudge.personaId) : null;

  const pick = async (choice: 'healthy' | 'chaos') => {
    if (picked) return;
    buzz(ImpactStyle.Heavy);
    setPicked(choice);
    // Let the chosen card's confirmation land before the overlay closes.
    await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 420));
    await chooseNudge(choice);
  };

  return (
    <AnimatePresence>
      {activeNudge && persona && (
        <motion.div
          key="nudge-overlay"
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="alertdialog"
          aria-modal="true"
          aria-label={`${persona.name} says: pick one`}
        >
          <button
            aria-label="Dismiss"
            tabIndex={-1}
            onClick={dismissNudge}
            className="absolute inset-0 h-full w-full cursor-default bg-black/75 backdrop-blur-md"
          />

          <motion.div
            className={`relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br ${persona.theme.gradient} p-[2px] shadow-2xl`}
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 460, damping: 26, mass: 0.7 }}
          >
            <div className="rounded-[calc(2rem-2px)] bg-ink/95 px-4 pt-6 pb-5">
              <div className="flex flex-col items-center text-center">
                <motion.span
                  className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-white/10 text-3xl"
                  aria-hidden
                  animate={
                    reduceMotion ? undefined : { rotate: [-7, 7, -7], scale: [1, 1.05, 1] }
                  }
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {persona.emoji}
                </motion.span>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                  {persona.name}
                </p>
                <h2 className="mt-1 font-display text-2xl leading-none tracking-tight">
                  This or that?
                </h2>
                <p className="mt-1 text-[13px] text-white/45">
                  Pick one. Either counts.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <ChoiceCard
                  label="The good one"
                  emoji="💪"
                  text={activeNudge.healthy.text}
                  accent="ring-emerald-400/70"
                  glow="bg-emerald-500/10"
                  chosen={picked === 'healthy'}
                  dimmed={picked === 'chaos'}
                  onClick={() => void pick('healthy')}
                />

                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="font-display text-xs tracking-widest text-white/30">
                    OR
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <ChoiceCard
                  label="The unhinged one"
                  emoji="🌀"
                  text={activeNudge.chaos.text}
                  accent="ring-fuchsia-400/70"
                  glow="bg-fuchsia-500/10"
                  chosen={picked === 'chaos'}
                  dimmed={picked === 'healthy'}
                  onClick={() => void pick('chaos')}
                />
              </div>

              <button
                onClick={dismissNudge}
                disabled={!!picked}
                className="tap mt-3 w-full rounded-2xl text-sm font-semibold text-white/35 transition active:bg-white/5 disabled:opacity-0"
              >
                Neither, leave me alone
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChoiceCard({
  label,
  emoji,
  text,
  accent,
  glow,
  chosen,
  dimmed,
  onClick,
}: {
  label: string;
  emoji: string;
  text: string;
  accent: string;
  glow: string;
  chosen: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      animate={{ scale: chosen ? 1.02 : 1, opacity: dimmed ? 0.35 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={`w-full rounded-3xl border border-white/10 ${glow} px-4 py-4 text-left transition active:scale-[0.98] ${
        chosen ? `ring-2 ${accent}` : ''
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-base" aria-hidden>{emoji}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
          {label}
        </span>
        {chosen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-auto text-sm font-bold text-emerald-300"
          >
            ✓ picked
          </motion.span>
        )}
      </span>
      <span className="mt-2 block font-display text-[17px] leading-snug">
        {text}
      </span>
    </motion.button>
  );
}
