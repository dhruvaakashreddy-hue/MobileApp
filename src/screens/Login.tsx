import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../state/AppContext';
import { Button, Screen } from '../components/ui';
import { OtpInput } from '../components/OtpInput';
import {
  AuthError,
  COUNTRIES,
  DEFAULT_COUNTRY,
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
  const { signInWithPhone, sendPhoneCode, signInWithGoogle, continueAsGuest, buzz } =
    useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const phoneValid = isValidNationalNumber(country, national);

  // Resend cooldown — stops people hammering the SMS endpoint.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const requestCode = async () => {
    if (!phoneValid || busy) return;
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

  const google = async () => {
    buzz();
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageFor(err));
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
                  Sign in so your personas and streak follow you to a new phone.
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
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={country.code === 'IN' ? '98765 43210' : 'Phone number'}
                    value={formatNationalNumber(country, national)}
                    onChange={(e) => {
                      setError(null);
                      setNational(normalizeNationalNumber(e.target.value));
                    }}
                    className="tap min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-lg font-bold outline-none placeholder:font-medium placeholder:text-white/25 focus:border-white/30"
                  />
                </div>

                {error && (
                  <p className="mt-3 px-1 text-sm text-rose-300" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  full
                  type="submit"
                  disabled={!phoneValid || busy}
                  className="mt-5 h-14"
                >
                  {busy ? 'Sending…' : 'Send me a code'}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-bold uppercase tracking-wider text-white/30">
                  or
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <button
                onClick={google}
                disabled={busy}
                className="tap flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-white/15 px-5 text-base font-bold transition active:scale-[0.97] disabled:opacity-40"
              >
                <GoogleMark />
                Continue with Google
              </button>
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

/** Google's mark, inline so the page pulls nothing from a CDN. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2C29.1 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}
