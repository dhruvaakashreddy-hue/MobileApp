import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NUDGES_PER_PERSONA, PERSONAS, previewLine } from '../data/personas';
import { useApp } from '../state/AppContext';
import { IconButton, Screen, ScreenHeader } from '../components/ui';
import type { Persona } from '../types';

export function Personas() {
  const { settings, selectPersona, buzz } = useApp();
  const navigate = useNavigate();

  const onPick = async (persona: Persona) => {
    buzz();
    await selectPersona(persona.id);
    navigate('/');
  };

  return (
    <Screen>
      <ScreenHeader
        title="Pick your voice"
        subtitle="Who do you want yelling at you today?"
        left={
          <IconButton label="Back" onClick={() => navigate(-1)} className="mt-1">
            ‹
          </IconButton>
        }
      />

      <div className="flex flex-col gap-4 pb-8">
        {PERSONAS.map((persona, i) => {
          const active = settings.personaId === persona.id;
          return (
            <motion.button
              key={persona.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.28 }}
              onClick={() => onPick(persona)}
              aria-label={`Use ${persona.name}`}
              className={`relative w-full overflow-hidden rounded-3xl p-[2px] text-left transition active:scale-[0.985] ${
                active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-ink' : ''
              }`}
            >
              <div className={`rounded-3xl bg-gradient-to-br ${persona.theme.gradient} p-[1px]`}>
                <div className="rounded-[calc(1.5rem-1px)] bg-ink-card/90 p-5">
                  <div className="flex items-start gap-4">
                    <span
                      className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${persona.theme.gradient} text-4xl`}
                      aria-hidden
                    >
                      {persona.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl leading-none">
                          {persona.name}
                        </h2>
                        {active && (
                          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-snug text-white/50">
                        {persona.description}
                      </p>
                    </div>
                  </div>

                  <blockquote className="mt-4 rounded-2xl bg-white/5 px-4 py-3">
                    <p
                      className="text-[15px] font-semibold leading-snug"
                    >
                      “{previewLine(persona)}”
                    </p>
                    <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/35">
                      {`${NUDGES_PER_PERSONA.toLocaleString()} nudges, never repeated`}
                    </p>
                  </blockquote>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </Screen>
  );
}
