import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ImpactStyle } from '@capacitor/haptics';
import { useApp } from '../state/AppContext';
import { Button, Screen } from '../components/ui';
import { OtpInput } from '../components/OtpInput';
import {
  AuthError,
  COUNTRIES,
  DEFAULT_COUNTRY,
  INVALID_PHONE_MESSAGE,
  STUB_OTP_CODE,
  activeProvider,
  formatE164ForDisplay,
  formatNationalNumber,
  isValidNationalNumber,
  normalizeNationalNumber,
  toE164,
  type Country,
  type PhoneChallenge,
} from '../lib/auth';

const RESEND_SECONDS = 30;

export function Login() {
  const { signInWithPhone, sendPhoneCode, continueAsGuest, buzz } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const phoneRef = useRef<HTMLInputElement>(null);

  const phoneValid = isValidNationalNumber(country, national);

  // Resend cooldown — stops people hammering the SMS endpoint.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const requestCode = async () => {
    if (busy) return;
    if (!phoneValid) {
      // The button stays tappable on an invalid number so there is something
      // to explain — a disabled button tells the user nothing.
      setError(INVALID_PHONE_MESSAGE);
      buzz(ImpactStyle.Heavy);
      phoneRef.current?.focus();
      return;
    }
    buzz();
    setBusy(true);
    setError(null);
    try {
      const next = await sendPhoneCode(toE164(country, national));
      setChallenge(next);
      setCode('');
      setStep('code');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value: string) => {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPhone(challenge, value);
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageFor(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    buzz();
    await continueAsGuest();
    navigate('/', { replace: true });
  };

  return (
    <Screen>
      <div className="flex min-h-[calc(100vh-2rem)] flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {step === 'phone' ? (
            <motion.div
              key="phone"
              className="flex-1"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
            >
              <div className="pt-10 text-center">
                <motion.div
                  className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 text-5xl"
                  aria-hidden
                  animate={{ rotate: [-8, 8, -8] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  🫡
                </motion.div>
                <h1 className="font-display text-3xl leading-tight tracking-tight">
                  Welcome to Nudge
                </h1>
                <p className="mx-auto mt-2 max-w-xs text-[15px] leading-snug text-white/55">
                  Verify your phone number and your personas and streak follow
                  you to a new phone.
                </p>
              </div>

              <form
                className="mt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestCode();
                }}
              >
                <label
                  htmlFor="phone"
                  className="mb-2 block px-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40"
                >
                  Phone number
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country calling code"
                    value={country.code}
                    onChange={(e) =>
                      setCountry(
                        COUNTRIES.find((c) => c.code === e.target.value) ??
                          DEFAULT_COUNTRY,
                      )
                    }
                    className="tap shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-base font-semibold outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ink-card">
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={phoneRef}
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={country.example}
                    value={formatNationalNumber(country, national)}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'phone-error' : undefined}
                    onChange={(e) => {
                      setError(null);
                      setNational(normalizeNationalNumber(e.target.value));
                    }}
                    onBlur={() => {
                      // Catch it on leaving the field too, not only on submit.
                      if (national.length > 0 && !phoneValid) {
                        setError(INVALID_PHONE_MESSAGE);
                      }
                    }}
                    className="tap min-w-0 flex-1 rounded-2xl border bg-white/5 px-4 text-lg font-bold outline-none transition placeholder:font-medium placeholder:text-white/25 focus:border-white/30"
                    style={{
                      borderColor: error
                        ? '#F43F5E'
                        : 'rgba(255,255,255,0.10)',
                    }}
                  />
                </div>

                {error && (
                  <p
                    id="phone-error"
                    className="mt-3 flex items-start gap-1.5 px-1 text-sm text-rose-300"
                    role="alert"
                  >
                    <span aria-hidden>⚠️</span>
                    {error}
                  </p>
                )}

                <Button full type="submit" disabled={busy} className="mt-5 h-14">
                  {busy ? 'Sending the code…' : 'Send OTP to this number'}
                </Button>
                <p className="mt-2 px-1 text-center text-[13px] text-white/40">
                  We'll text you a 6-digit code to verify it's you.
                </p>
              </form>

            </motion.div>
          ) : (
            <motion.div
              key="code"
              className="flex-1"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22 }}
            >
              <button
                onClick={() => {
                  buzz();
                  setStep('phone');
                  setError(null);
                }}
                className="tap -ml-2 mt-3 rounded-2xl px-3 text-sm font-semibold text-white/55"
              >
                ‹ Change number
              </button>

              <div className="pt-6 text-center">
                <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-white/10 text-4xl" aria-hidden>
                  💬
                </div>
                <h1 className="font-display text-3xl leading-tight tracking-tight">
                  Enter the code
                </h1>
                <p className="mx-auto mt-2 max-w-xs text-[15px] leading-snug text-white/55">
                  We sent a 6-digit code to{' '}
                  <span className="font-semibold text-white/80">
                    {challenge ? formatE164ForDisplay(challenge.phoneNumber) : ''}
                  </span>
                </p>
              </div>

              <div className="mt-8">
                <OtpInput
                  value={code}
                  onChange={(v) => {
                    setError(null);
                    setCode(v);
                  }}
                  onComplete={(v) => void submitCode(v)}
                  disabled={busy}
                  invalid={!!error}
                  accentHex="#A855F7"
                />
              </div>

              {error && (
                <p className="mt-4 text-center text-sm text-rose-300" role="alert">
                  {error}
                </p>
              )}

              <Button
                full
                className="mt-6 h-14"
                disabled={code.length < 6 || busy}
                onClick={() => void submitCode(code)}
              >
                {busy ? 'Checking…' : 'Verify & continue'}
              </Button>

              <button
                onClick={() => void requestCode()}
                disabled={secondsLeft > 0 || busy}
                className="tap mt-2 w-full rounded-2xl text-sm font-semibold text-white/50 transition active:bg-white/5 disabled:text-white/25"
              >
                {secondsLeft > 0
                  ? `Resend code in ${secondsLeft}s`
                  : 'Resend code'}
              </button>

              {activeProvider.id === 'stub' && (
                <p className="mt-5 rounded-2xl border border-dashed border-amber-400/30 bg-amber-400/5 px-4 py-3 text-center text-[12px] leading-snug text-amber-200/70">
                  Developer build — no SMS is sent. Use code{' '}
                  <strong className="font-bold tracking-widest">{STUB_OTP_CODE}</strong>.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guest escape hatch. Nudge works fully offline without an account —
            see docs/AUTH_SETUP.md if you'd rather make sign-in mandatory. */}
        <div className="mt-8 nav-pb-safe">
          <button
            onClick={guest}
            disabled={busy}
            className="tap w-full rounded-2xl text-sm font-semibold text-white/40 transition active:bg-white/5"
          >
            Continue without an account
          </button>
          <p className="mt-2 px-4 text-center text-[11px] leading-relaxed text-white/25">
            Nudge works fully offline. An account only exists so your settings
            and streak can move to a new phone.
          </p>
        </div>
      </div>
    </Screen>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof AuthError) {
    switch (err.code) {
      case 'too-many-requests':
        return 'Too many attempts. Wait a few minutes and try again.';
      case 'network':
        return "Couldn't reach the network. Check your connection.";
      case 'cancelled':
        return 'Sign-in was cancelled.';
      default:
        return err.message;
    }
  }
  return 'Something went wrong. Try again?';
}
