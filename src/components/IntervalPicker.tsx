import {
  INTERVAL_STEP_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  clampInterval,
  formatInterval,
} from '../lib/scheduling';

/**
 * One slider for one value, with quick-pick chips for the common choices.
 *
 * The chips carry most of the traffic — dragging a slider to exactly 45 on a
 * phone is fiddly — while the slider stays for anything in between.
 */

/** Labels are explicit durations — a bare "10" reads as ambiguous on a chip. */
const PRESETS: { minutes: number; label: string }[] = [
  { minutes: 10, label: '10m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 45, label: '45m' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1.5h' },
];

export function IntervalPicker({
  value,
  onChange,
  accentHex,
}: {
  value: number;
  onChange: (minutes: number) => void;
  accentHex: string;
}) {
  const current = clampInterval(value);

  return (
    <div style={{ ['--thumb-color' as string]: accentHex }}>
      <div className="mb-4 rounded-2xl bg-white/5 px-4 py-3 text-center">
        <p className="text-sm text-white/55">A nudge every</p>
        <p className="font-display text-3xl">{formatInterval(current)}</p>
        <p className="mt-1 text-xs text-white/40">
          Inside your active hours only
        </p>
      </div>

      {/* A fixed 3-column grid: six flex chips wrap unevenly on a narrow
          phone, leaving the last one stranded on its own full-width row. */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {PRESETS.map(({ minutes, label }) => {
          const active = current === minutes;
          return (
            <button
              key={minutes}
              type="button"
              onClick={() => onChange(minutes)}
              aria-pressed={active}
              aria-label={`Every ${formatInterval(minutes)}`}
              className={`tap min-w-0 rounded-2xl border-2 px-1 text-sm font-bold transition active:scale-95 ${
                active ? 'text-white' : 'border-white/10 text-white/60'
              }`}
              style={active ? { borderColor: accentHex } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      <input
        type="range"
        min={MIN_INTERVAL_MINUTES}
        max={MAX_INTERVAL_MINUTES}
        step={INTERVAL_STEP_MINUTES}
        value={current}
        aria-label={`Nudge interval, currently ${formatInterval(current)}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between px-1 text-[12px] font-semibold text-white/35">
        <span>{formatInterval(MIN_INTERVAL_MINUTES)}</span>
        <span>{formatInterval(MAX_INTERVAL_MINUTES)}</span>
      </div>
    </div>
  );
}
