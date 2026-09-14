import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PERSONAS, previewLine } from '../data/personas';
import { useApp } from '../state/AppContext';
import { Button, LockBadge, Screen } from '../components/ui';
import { ActiveHoursPicker } from '../components/ActiveHoursPicker';
import { isNative } from '../lib/notifications';
import type { Persona } from '../types';

const STEPS = ['welcome', 'persona', 'hours', 'permission'] as const;
type Step = (typeof STEPS)[number];

export function Onboarding() {
  const {
    settings, persona, updateSettings, selectPersona, isPersonaLocked,
    askPermission, completeOnboarding, permission, buzz,
  } = useApp();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const step: Step = STEPS[index];

  const go = (delta: number) => {
    buzz();
    setDirection(delta);
    setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  };

  const onPickPersona = async (p: Persona) => {
    buzz();
    if (isPersonaLocked(p)) {
      navigate(`/paywall?persona=${p.id}`);
      return;
    }
    await selectPersona(p.id);
  };

  const finish = async () => {
    buzz();
    await askPermission();
    await completeOnboarding();
    navigate('/', { replace: true });
  };

  const skipPermission = async () => {
    await completeOnboarding();
    navigate('/', { replace: true });
  };

  return (
    <Screen>
      {/* Progress */}
      <div className="flex gap-1.5 pt-4" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= index ? 'bg-white/80' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
      <p className="sr-only" role="status">
        Step {index + 1} of {STEPS.length}
      </p>

      <div className="relative min-h-[calc(100vh-13rem)] pt-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -32 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {step === 'welcome' && (
              <div className="text-center">
                <motion.div
                  className="mx-auto mb-7 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 text-6xl"
                  aria-hidden
                  animate={{ rotate: [-8, 8, -8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  👋
                </motion.div>
                <h1 className="font-display text-4xl leading-tight tracking-tight">
                  Reminders,
                  <br />
                  but unhinged
                </h1>
                <p className="mx-auto mt-4 max-w-xs text-[15px] leading-relaxed text-white/60">
                  Nudge sends you random reminders to sit up, drink water and
                  move — written in the voice of a character you pick. You'll
                  never know exactly when.
                </p>
                <div className="mt-8 flex flex-col gap-2 text-left">
                  {[
                    ['🎭', 'Pick a persona', 'A drill sergeant, your mum, or a menace'],
                    ['⏱️', 'Every 30 minutes', 'Change it any time in Settings'],
                    ['🌙', 'Never at 3am', 'You set the hours it may speak'],
                  ].map(([emoji, title, sub]) => (
                    <div
                      key={title}
                      className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3"
                    >
                      <span className="text-2xl" aria-hidden>{emoji}</span>
                      <div>
                        <p className="text-[15px] font-semibold">{title}</p>
                        <p className="text-[13px] text-white/45">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 'persona' && (
              <div>
                <StepTitle
                  title="Who's in charge?"
                  sub="You can change this whenever you like."
                />
                <div className="flex flex-col gap-3">
                  {PERSONAS.map((p) => {
                    const locked = isPersonaLocked(p);
                    const active = settings.personaId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => void onPickPersona(p)}
                        aria-pressed={active}
                        className={`w-full rounded-3xl border-2 p-4 text-left transition active:scale-[0.985] ${
                          active
                            ? 'border-white/70 bg-white/10'
                            : 'border-white/10 bg-ink-card/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${p.theme.gradient} text-2xl ${
                              locked ? 'opacity-60 grayscale' : ''
                            }`}
                            aria-hidden
                          >
                            {p.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-lg leading-none">
                                {p.name}
                              </span>
                              {locked && <LockBadge />}
                            </div>
                            <p className="mt-1 text-[13px] text-white/45">
                              {p.description}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`mt-3 rounded-xl bg-white/5 px-3 py-2 text-[14px] leading-snug ${
                            locked ? 'blur-[3px] select-none' : ''
                          }`}
                        >
                          “{previewLine(p)}”
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'hours' && (
              <div>
                <StepTitle
                  title="When are you awake?"
                  sub="Nothing will fire outside these hours."
                />
                <ActiveHoursPicker
                  activeStart={settings.activeStart}
                  activeEnd={settings.activeEnd}
                  onChange={(next) => void updateSettings(next)}
                />
              </div>
            )}

            {step === 'permission' && (
              <div className="text-center">
                <motion.div
                  className="mx-auto mb-7 grid h-28 w-28 place-items-center rounded-full bg-white/10 text-6xl"
                  aria-hidden
                  animate={{ rotate: [-12, 12, -12] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                >
                  🔔
                </motion.div>
                <h1 className="font-display text-3xl leading-tight tracking-tight">
                  One last thing
                </h1>
                <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-white/60">
                  Nudge needs permission to send notifications — that's the whole
                  app. Nothing leaves your phone, and there's no account to make.
                </p>
                {permission === 'denied' && isNative() && (
                  <p className="mx-auto mt-4 max-w-xs rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-snug text-amber-100/80">
                    Notifications are currently blocked. You can turn them on in
                    your phone's Settings → Nudge → Notifications.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-ink via-ink to-transparent px-5 pt-6 nav-pb-safe">
        {step === 'permission' ? (
          <>
            <Button
              full
              className="h-14"
              accent={persona.theme.accent}
              onAccent={persona.theme.onAccent}
              onClick={finish}
            >
              Allow notifications & start
            </Button>
            <button
              onClick={skipPermission}
              className="tap mt-1 w-full rounded-2xl text-sm font-semibold text-white/40 transition active:bg-white/5"
            >
              Maybe later
            </button>
          </>
        ) : (
          <div className="flex gap-3">
            {index > 0 && (
              <Button variant="outline" onClick={() => go(-1)} className="px-6">
                Back
              </Button>
            )}
            <Button
              full
              className="h-14"
              accent={persona.theme.accent}
              onAccent={persona.theme.onAccent}
              onClick={() => go(1)}
            >
              {step === 'welcome' ? "Let's go" : 'Next'}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-snug text-white/55">{sub}</p>
    </div>
  );
}
