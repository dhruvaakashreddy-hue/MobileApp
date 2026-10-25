import { formatCountdown } from '../lib/format.ts';
import { serverNowMs, useServerNow } from '../lib/clock.ts';

/** Counts down to a server time. Display only: the server decides when anything happens. */
export function Countdown({
  to,
  size = 'lg',
  label,
  onZero,
}: {
  to: string;
  size?: 'lg' | 'sm';
  label: string;
  onZero?: () => void;
}) {
  const now = useServerNow(250);
  const remaining = Date.parse(to) - now;
  const text = formatCountdown(remaining);

  if (remaining <= 0 && onZero) onZero();

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="eyebrow">{label}</span>
      <time
        dateTime={`PT${Math.max(0, Math.round(remaining / 1000))}S`}
        aria-label={`${Math.max(0, Math.ceil(remaining / 1000))} seconds`}
        className={
          size === 'lg'
            ? 'num font-display text-[88px] leading-[0.9] font-black text-lime sm:text-[120px]'
            : 'num font-display text-4xl leading-none font-black text-lime'
        }
      >
        {text}
      </time>
    </div>
  );
}

/** Shows the remaining time until a server instant. Renders nothing once the instant has passed. */
export function RemainingTime({ to, prefix }: { to: string; prefix: string }) {
  const now = serverNowMs();
  const remaining = Date.parse(to) - now;
  if (remaining <= 0) return null;
  return (
    <span className="num font-semibold text-text">
      {prefix} {formatCountdown(remaining)}
    </span>
  );
}
