import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImpactStyle } from '@capacitor/haptics';
import { useApp } from '../state/AppContext';
import { Card, Screen } from '../components/ui';
import { Avatar } from '../components/Avatar';
import {
  formatCountdown,
  formatInterval,
  formatTimeLabel,
} from '../lib/scheduling';

export function Home() {
  const {
    settings, stats, persona, nextFireAt, permission, session,
    setEnabled, buzz, requeueNext, nudgeMeNow,
  } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [queued, setQueued] = useState(false);

  // A minute is plenty — the countdown is deliberately approximate.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const blocked = permission === 'denied';
  const picks = stats.healthyPicks + stats.chaosPicks;

  const handleToggle = async () => {
    buzz(ImpactStyle.Medium);
    await setEnabled(!settings.enabled);
  };

  /**
   * Queues the next nudge one interval out, rather than firing instantly.
   * A nudge that arrives the moment you ask for it isn't a nudge — it's a
   * button press. This resets the countdown so the next one lands on time.
   */
  const handleQueueNext = async () => {
    buzz();
    await requeueNext();
    setQueued(true);
    setTimeout(() => setQueued(false), 4000);
  };

  return (
    <Screen>
      <header className="flex items-center justify-between pt-3 pb-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-white/40">
            {session?.user.displayName
              ? `Hey, ${session.user.displayName.split(' ')[0]}`
              : 'Nudge'}
          </p>
          <h1 className="font-display text-3xl tracking-tight">
            {settings.enabled ? 'Armed & annoying' : 'Currently silent'}
          </h1>
        </div>
        <button
          onClick={() => {
            buzz();
            navigate('/settings');
          }}
          aria-label="Settings and profile"
          className="shrink-0 rounded-full transition active:scale-95"
        >
          <Avatar
            photo={session?.user.photoUrl ?? null}
            name={session?.user.displayName ?? null}
            size={44}
          />
        </button>
      </header>

      {blocked && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            Notifications are switched off for Nudge
          </p>
          <p className="mt-1 text-[13px] leading-snug text-amber-100/70">
            Nudge can't reach you until you allow notifications in your phone's
            Settings → Nudge → Notifications.
          </p>
        </div>
      )}

      {/* The main event: one big, unmissable switch. */}
      <button
        onClick={handleToggle}
        aria-pressed={settings.enabled}
        aria-label={settings.enabled ? 'Turn nudges off' : 'Turn nudges on'}
        className="relative w-full overflow-hidden rounded-[2rem] p-[2px] text-left transition active:scale-[0.985]"
      >
        <div
          className={`rounded-[2rem] bg-gradient-to-br p-6 ${
            settings.enabled
              ? persona.theme.gradient
              : 'from-white/10 via-white/5 to-white/10'
          }`}
        >
          <div className="flex items-center gap-4">
            <motion.span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-black/25 text-3xl"
              aria-hidden
              animate={settings.enabled ? { rotate: [-6, 6, -6] } : { rotate: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {persona.emoji}
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="font-display whitespace-nowrap text-[22px] leading-none">
                {settings.enabled ? 'NUDGES ON' : 'NUDGES OFF'}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-white/70">
                {settings.enabled
                  ? `${persona.name} is on duty`
                  : 'Tap to let the chaos back in'}
              </p>
            </div>
            <span
              className="relative h-[34px] w-[58px] shrink-0 rounded-full bg-black/30"
              aria-hidden
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className="absolute top-[4px] h-[26px] w-[26px] rounded-full bg-white shadow"
                style={{ left: settings.enabled ? 28 : 4 }}
              />
            </span>
          </div>
        </div>
      </button>

      {/* Next nudge */}
      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">
              Next nudge
            </p>
            <p className="mt-1 font-display text-xl">
              {!settings.enabled
                ? 'Nothing scheduled'
                : nextFireAt
                  ? formatCountdown(nextFireAt - now)
                  : 'Working it out…'}
            </p>
            {settings.enabled && nextFireAt && (
              <p className="mt-0.5 text-[13px] text-white/45">
                around {formatTimeLabel(
                  new Date(nextFireAt).getHours() * 60 +
                    new Date(nextFireAt).getMinutes(),
                )}
              </p>
            )}
          </div>
          <span className="text-3xl" aria-hidden>
            {settings.enabled ? '⏳' : '😴'}
          </span>
        </div>
        {settings.enabled && (
          <p className="mt-3 border-t border-white/10 pt-3 text-[13px] leading-snug text-white/45">
            Every {formatInterval(settings.intervalMinutes)} between{' '}
            {formatTimeLabel(settings.activeStart)} and{' '}
            {formatTimeLabel(settings.activeEnd)}.
          </p>
        )}
      </Card>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat value={stats.todayCount} label="nudges today" emoji="📬" />
        <Stat value={stats.streak} label="day streak" emoji="🔥" />
      </div>

      {picks > 0 && (
        <Card className="mt-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">
              This or that
            </p>
            <p className="text-[13px] font-semibold text-white/55">
              {picks} answered
            </p>
          </div>
          <div
            className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`${stats.healthyPicks} sensible, ${stats.chaosPicks} chaotic`}
          >
            <span
              className="bg-emerald-400"
              style={{ width: `${(stats.healthyPicks / picks) * 100}%` }}
            />
            <span
              className="bg-fuchsia-400"
              style={{ width: `${(stats.chaosPicks / picks) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[13px]">
            <span className="text-emerald-300">💪 {stats.healthyPicks} sensible</span>
            <span className="text-fuchsia-300">{stats.chaosPicks} chaotic 🌀</span>
          </div>
        </Card>
      )}

      {/* Persona */}
      <button
        onClick={() => {
          buzz();
          navigate('/personas');
        }}
        className="mt-4 flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-ink-card/70 p-4 text-left transition active:scale-[0.985] active:bg-white/5"
      >
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${persona.theme.gradient} text-3xl`}
          aria-hidden
        >
          {persona.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/40">
            Your persona
          </span>
          <span className="mt-0.5 block text-lg font-bold">{persona.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-white/45">
            Tap to switch
          </span>
        </span>
        <span className="text-white/30" aria-hidden>›</span>
      </button>

      <div className="mt-4 mb-6 grid grid-cols-2 gap-3">
        <button
          onClick={handleQueueNext}
          disabled={!settings.enabled}
          className="tap rounded-2xl border-2 border-dashed border-white/15 px-3 text-[13px] font-bold leading-tight text-white/70 transition active:scale-[0.98] disabled:opacity-40"
        >
          {queued
            ? `✅ Queued for ${formatInterval(settings.intervalMinutes)}`
            : `🔔 Send me one in ${formatInterval(settings.intervalMinutes)}`}
        </button>
        <button
          onClick={() => {
            buzz();
            void nudgeMeNow();
          }}
          className={`tap rounded-2xl bg-gradient-to-br ${persona.theme.gradient} px-3 text-[13px] font-bold leading-tight text-white shadow-lg shadow-black/30 transition active:scale-[0.98]`}
        >
          ⚡ Send me one right now
        </button>
      </div>
    </Screen>
  );
}

function Stat({
  value,
  label,
  emoji,
}: {
  value: number;
  label: string;
  emoji: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-ink-card/70 p-4">
      <span className="text-2xl" aria-hidden>{emoji}</span>
      <p className="mt-1 font-display text-3xl tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[13px] text-white/45">{label}</p>
    </div>
  );
}
