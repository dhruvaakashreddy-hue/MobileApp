import { useEffect, useRef } from 'react';

/**
 * Six single-character boxes that behave the way people expect an OTP field to:
 * typing advances, backspace on an empty box steps back, and pasting the whole
 * code from the SMS fills every box at once.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  accentHex,
  length = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  accentHex: string;
  length?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first empty box when the step opens.
  useEffect(() => {
    refs.current[Math.min(value.length, length - 1)]?.focus();
    // Only on mount — re-focusing on every keystroke would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDigits = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const handleChange = (index: number, raw: string) => {
    // A paste or an SMS autofill lands as several characters at once.
    if (raw.length > 1) {
      const clean = setDigits(raw);
      refs.current[Math.min(clean.length, length - 1)]?.focus();
      return;
    }
    const digit = raw.replace(/\D/g, '');
    if (!digit) return;

    const chars = value.padEnd(length, ' ').split('');
    chars[index] = digit;
    const clean = setDigits(chars.join('').trimEnd());
    if (index < length - 1) refs.current[index + 1]?.focus();
    else if (clean.length === length) refs.current[index]?.blur();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        // Clear this box but stay put, so a single correction is one keypress.
        const chars = value.split('');
        chars[index] = '';
        onChange(chars.join('').replace(/\s/g, ''));
      } else if (index > 0) {
        const chars = value.split('');
        chars[index - 1] = '';
        onChange(chars.join('').replace(/\s/g, ''));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div
      className="flex justify-center gap-1.5 xs:gap-2"
      role="group"
      aria-label={`${length}-digit verification code`}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          // Lets iOS and Android offer the code straight from the SMS.
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={value[i] ?? ''}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          // Flexible rather than fixed-width: six 48px boxes plus gaps overflow
          // a 320px screen, so they shrink to fit and cap at their ideal size.
          className="h-14 min-w-0 max-w-12 flex-1 rounded-2xl border-2 bg-white/5 text-center font-display text-2xl outline-none transition disabled:opacity-40"
          style={{
            borderColor: invalid
              ? '#F43F5E'
              : value[i]
                ? accentHex
                : 'rgba(255,255,255,0.14)',
          }}
        />
      ))}
    </div>
  );
}
