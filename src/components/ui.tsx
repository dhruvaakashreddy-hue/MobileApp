import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Shared primitives. Every tappable thing here clears a 48px hit target. */

export function Screen({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-h-full w-full overflow-y-auto overflow-x-hidden no-scrollbar ${className}`}
    >
      <div className="mx-auto w-full max-w-md px-5 pt-safe pb-safe">{children}</div>
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-3 pt-3 pb-6">
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-white/55">{subtitle}</p>
        )}
      </div>
      {right}
    </header>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline';
  full?: boolean;
  accent?: string;
  onAccent?: string;
};

export function Button({
  variant = 'primary',
  full,
  accent = 'bg-violet-600',
  onAccent = 'text-white',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base =
    'tap inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100';
  const styles =
    variant === 'primary'
      ? `${accent} ${onAccent} shadow-lg shadow-black/30`
      : variant === 'outline'
        ? 'border-2 border-white/15 text-white'
        : 'text-white/70';
  return (
    <button
      className={`${base} ${styles} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      className={`tap grid place-items-center rounded-2xl border border-white/10 bg-white/5 text-xl transition active:scale-95 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-ink-card/70 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40">
      {children}
    </h2>
  );
}

/** A switch row: whole row is tappable, state announced to screen readers. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  accentHex = '#7C3AED',
  emoji,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accentHex?: string;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="tap flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-white/5 disabled:opacity-40"
    >
      {emoji && <span className="text-xl" aria-hidden>{emoji}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-snug text-white/45">
            {description}
          </span>
        )}
      </span>
      <span
        className="relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? accentHex : 'rgba(255,255,255,0.16)' }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow"
          style={{ left: checked ? 25 : 3 }}
        />
      </span>
    </button>
  );
}

export function Pill({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

export function LockBadge() {
  return (
    <Pill className="bg-amber-400/15 text-amber-300">
      <span aria-hidden>🔒</span> Premium
    </Pill>
  );
}
