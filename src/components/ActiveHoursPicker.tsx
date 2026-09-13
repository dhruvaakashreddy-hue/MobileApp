import { formatTimeLabel, minutesToTimeString, timeStringToMinutes } from '../lib/scheduling';

/**
 * Uses the platform's native time picker (spinner on iOS, clock dial on
 * Android) — a custom one would only be worse than the control people
 * already know.
 */
export function ActiveHoursPicker({
  activeStart,
  activeEnd,
  onChange,
}: {
  activeStart: number;
  activeEnd: number;
  onChange: (next: { activeStart?: number; activeEnd?: number }) => void;
}) {
  const wrapsMidnight = activeEnd < activeStart;
  const allDay = activeStart === activeEnd;

  return (
    <div>
      <div className="flex gap-3">
        <TimeField
          label="From"
          value={activeStart}
          onChange={(m) => onChange({ activeStart: m })}
        />
        <TimeField
          label="Until"
          value={activeEnd}
          onChange={(m) => onChange({ activeEnd: m })}
        />
      </div>

      <p className="mt-3 px-1 text-[13px] leading-snug text-white/50">
        {allDay ? (
          <>Nudges can arrive at <strong className="text-white/75">any hour</strong>. Brave.</>
        ) : wrapsMidnight ? (
          <>
            Overnight window — nudges run from{' '}
            <strong className="text-white/75">{formatTimeLabel(activeStart)}</strong> through
            midnight until{' '}
            <strong className="text-white/75">{formatTimeLabel(activeEnd)}</strong>.
          </>
        ) : (
          <>
            You'll never be woken up — nothing fires between{' '}
            <strong className="text-white/75">{formatTimeLabel(activeEnd)}</strong> and{' '}
            <strong className="text-white/75">{formatTimeLabel(activeStart)}</strong>.
          </>
        )}
      </p>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    // min-w-0 matters: a native time input has an intrinsic minimum width that
    // flex-1 alone will not shrink below, which overflows a 360px-wide phone.
    <label className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <span className="block text-xs font-semibold uppercase tracking-wider text-white/40">
        {label}
      </span>
      <input
        type="time"
        value={minutesToTimeString(value)}
        onChange={(e) => onChange(timeStringToMinutes(e.target.value))}
        className="mt-1 w-full min-w-0 max-w-full bg-transparent text-base font-bold outline-none"
      />
    </label>
  );
}
