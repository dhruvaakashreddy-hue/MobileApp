import { formatCountdown, MINUTE } from '../lib/scheduling';

/**
 * Two labelled sliders rather than one overlapping dual-thumb track: on a phone
 * two thumbs sitting on the same rail are genuinely hard to grab apart, and the
 * plain-English summary above them is what people actually read.
 */

const MIN_BOUND = 15;
const MAX_BOUND = 240;

export function IntervalPicker({
  minMinutes,
  maxMinutes,
  onChange,
  accentHex,
}: {
  minMinutes: number;
  maxMinutes: number;
  onChange: (next: { minMinutes: number; maxMinutes: number }) => void;
  accentHex: string;
}) {
  const setMin = (value: number) => {
    const min = Math.min(value, MAX_BOUND);
    // Keep at least a 5-minute spread so the randomness has somewhere to live.
    onChange({ minMinutes: min, maxMinutes: Math.max(maxMinutes, min + 5) });
  };

  const setMax = (value: number) => {
    const max = Math.max(value, MIN_BOUND);
    onChange({ maxMinutes: max, minMinutes: Math.min(minMinutes, max - 5) });
  };

  const label = (mins: number) =>
    formatCountdown(mins * MINUTE).replace('~', '');

  return (
    <div style={{ ['--thumb-color' as string]: accentHex }}>
      <div className="mb-4 rounded-2xl bg-white/5 px-4 py-3 text-center">
        <p className="text-sm text-white/55">A nudge every</p>
        <p className="font-display text-2xl">
          {label(minMinutes)} – {label(maxMinutes)}
        </p>
        <p className="mt-1 text-xs text-white/40">
          Randomised inside that range, so it stays a surprise
        </p>
      </div>

      <SliderRow
        label="No sooner than"
        value={minMinutes}
        display={label(minMinutes)}
        min={MIN_BOUND}
        max={MAX_BOUND}
        onChange={setMin}
      />
      <SliderRow
        label="No later than"
        value={maxMinutes}
        display={label(maxMinutes)}
        min={MIN_BOUND}
        max={MAX_BOUND}
        onChange={setMax}
      />
    </div>
  );
}

function SliderRow({
  label,
  display,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium text-white/60">{label}</span>
        <span className="text-[13px] font-bold tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        aria-label={`${label}, currently ${display}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
