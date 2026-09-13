import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { getPersona } from '../data/personas';
import { playPersonaSound } from '../lib/sound';
import { useApp } from '../state/AppContext';

/**
 * The in-app card that replaces the plain OS banner whenever the app is open —
 * and that a tapped notification reopens the app straight into, reconstructed
 * from the notification's `extra` payload.
 */
export function NudgeOverlay() {
  const { activeNudge, dismissNudge, buzz, settings } = useApp();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!activeNudge) return;
    buzz(ImpactStyle.Medium);
    // The OS suppresses its own banner and sound while the app is open, so the
    // card plays the persona's sound itself. Honours the Settings toggle.
    playPersonaSound(getPersona(activeNudge.personaId), settings.soundEnabled);
  }, [activeNudge, buzz, settings.soundEnabled]);

  // Hardware back / Escape should dismiss, like any other modal.
  useEffect(() => {
    if (!activeNudge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissNudge();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNudge, dismissNudge]);

  const persona = activeNudge ? getPersona(activeNudge.personaId) : null;

  return (
    <AnimatePresence>
      {activeNudge && persona && (
        <motion.div
          key="nudge-overlay"
          className="fixed inset-0 z-50 grid place-items-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="alertdialog"
          aria-modal="true"
          aria-label={`${persona.name} says`}
        >
          <button
            aria-label="Dismiss"
            tabIndex={-1}
            onClick={dismissNudge}
            className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-md"
          />

          <motion.div
            className={`relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br ${persona.theme.gradient} p-[2px] shadow-2xl`}
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0, y: 12 }}
            // Snappy spring: settles in well under 400ms.
            transition={{ type: 'spring', stiffness: 460, damping: 26, mass: 0.7 }}
          >
            <div className="rounded-[calc(2rem-2px)] bg-ink/92 px-6 pt-8 pb-6 text-center">
              <motion.div
                className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-white/10 text-5xl"
                aria-hidden
                animate={
                  reduceMotion
                    ? undefined
                    : { rotate: [-7, 7, -7], scale: [1, 1.06, 1] }
                }
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {persona.emoji}
              </motion.div>

              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">
                {persona.name}
              </p>

              <p className="mt-3 font-display text-2xl leading-snug tracking-tight">
                {activeNudge.text}
              </p>

              <button
                onClick={dismissNudge}
                autoFocus
                className={`tap mt-7 w-full rounded-2xl ${persona.theme.accent} ${persona.theme.onAccent} px-5 text-base font-bold shadow-lg shadow-black/30 transition active:scale-[0.97]`}
              >
                {persona.dismissLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
