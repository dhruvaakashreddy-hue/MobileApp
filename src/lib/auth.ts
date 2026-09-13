import { Preferences } from '@capacitor/preferences';
// The `/mobile` metadata validates against each country's real numbering plan
// AND checks the number can actually receive an SMS, so landlines are rejected
// too. Length checks alone are not validation: +91 1234567890 is ten digits and
// entirely fake — no Indian mobile number starts with 1.
import { isValidPhoneNumber } from 'libphonenumber-js/mobile';
import type { CountryCode } from 'libphonenumber-js';

/**
 * Authentication.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ v1 ships the STUB provider: it validates input and persists a session
 * locally, but sends no SMS and talks to no server. Any correctly-formatted
 * phone number is accepted with the code below. Do NOT ship this.
 *
 * Real phone OTP needs a backend — see docs/AUTH_SETUP.md for exactly what to
 * create and where each value goes.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Note on the app's privacy story: Nudge otherwise makes no network calls and
 * stores nothing off-device. Sign-in is the one exception, which is why the
 * login screen offers "continue without an account" — a guest session keeps
 * the app fully functional and fully offline.
 */

/** The code the stub provider accepts. Shown on-screen while the stub is live. */
export const STUB_OTP_CODE = '123456';

/** Shown whenever a number fails validation, wherever that check happens. */
export const INVALID_PHONE_MESSAGE = 'Please enter a valid phone number';

export type AuthMethod = 'phone' | 'guest';

export interface AuthUser {
  id: string;
  method: AuthMethod;
  phoneNumber: string | null;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

export interface AuthSession {
  user: AuthUser;
  /** Provider id token. Null for guest and stub sessions. */
  token: string | null;
  signedInAt: number;
}

export interface PhoneChallenge {
  /** Opaque handle the provider uses to tie a code back to a sent SMS. */
  verificationId: string;
  phoneNumber: string;
}

export type AuthErrorCode =
  | 'invalid-phone'
  | 'invalid-code'
  | 'expired-code'
  | 'too-many-requests'
  | 'cancelled'
  | 'network'
  | 'not-configured'
  | 'unknown';

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface AuthProvider {
  id: 'stub' | 'firebase';
  sendPhoneCode(phoneE164: string): Promise<PhoneChallenge>;
  confirmPhoneCode(challenge: PhoneChallenge, code: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

// ─── Phone number handling ────────────────────────────────────────────────

export interface Country {
  code: string;
  dial: string;
  name: string;
  flag: string;
  /** ISO region code libphonenumber validates against. */
  region: CountryCode;
  /** Longest national number, used only to cap typing — not to validate. */
  maxDigits: number;
  /** Shown as the input placeholder. */
  example: string;
}

/** India first: the app is priced in ₹ and aimed at that market initially. */
export const COUNTRIES: Country[] = [
  { code: 'IN', dial: '+91', name: 'India', flag: '🇮🇳', region: 'IN', maxDigits: 10, example: '98765 43210' },
  { code: 'US', dial: '+1', name: 'United States', flag: '🇺🇸', region: 'US', maxDigits: 10, example: '415 555 2671' },
  { code: 'GB', dial: '+44', name: 'United Kingdom', flag: '🇬🇧', region: 'GB', maxDigits: 10, example: '7911 123456' },
  { code: 'AE', dial: '+971', name: 'UAE', flag: '🇦🇪', region: 'AE', maxDigits: 9, example: '50 123 4567' },
  { code: 'SG', dial: '+65', name: 'Singapore', flag: '🇸🇬', region: 'SG', maxDigits: 8, example: '9123 4567' },
  { code: 'AU', dial: '+61', name: 'Australia', flag: '🇦🇺', region: 'AU', maxDigits: 9, example: '412 345 678' },
  { code: 'CA', dial: '+1', name: 'Canada', flag: '🇨🇦', region: 'CA', maxDigits: 10, example: '416 555 0123' },
  { code: 'DE', dial: '+49', name: 'Germany', flag: '🇩🇪', region: 'DE', maxDigits: 11, example: '1512 3456789' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

/** Strips everything that isn't a digit — users paste spaces, dashes, brackets. */
export function normalizeNationalNumber(input: string): string {
  return input.replace(/\D/g, '');
}

export function toE164(country: Country, national: string): string {
  return `${country.dial}${normalizeNationalNumber(national)}`;
}

/**
 * True only for a number that could actually receive an SMS in that country.
 *
 * This is a real numbering-plan check, not a digit count. It rejects numbers of
 * the right length with an impossible prefix (+91 1234567890), repeated-digit
 * placeholders (+91 0000000000), and landlines, which cannot receive the code.
 */
export function isValidNationalNumber(
  country: Country,
  national: string,
): boolean {
  const digits = normalizeNationalNumber(national);
  if (digits.length === 0) return false;
  if (isRepeatedDigits(digits)) return false;
  try {
    return isValidPhoneNumber(`${country.dial}${digits}`, country.region);
  } catch {
    return false;
  }
}

/**
 * Rejects 9999999999 and friends.
 *
 * libphonenumber calls these valid, and strictly it is right — they fit the
 * numbering plan, and only sending an SMS proves a number is live. But they are
 * what people type when they want to skip a form, so the trade is worth it: a
 * real subscriber on an all-identical number sees one error message, while
 * everyone else stops burning an SMS charge on an obvious placeholder.
 */
function isRepeatedDigits(digits: string): boolean {
  return digits.length > 1 && new Set(digits).size === 1;
}

/** Same check, for a number already in E.164 form. */
export function isValidE164(phone: string): boolean {
  const national = phone.replace(/^\+\d{1,3}/, '');
  if (isRepeatedDigits(normalizeNationalNumber(national))) return false;
  try {
    return isValidPhoneNumber(phone);
  } catch {
    return false;
  }
}

/** Groups digits for readability as the user types, e.g. `98765 43210`. */
export function formatNationalNumber(
  country: Country,
  national: string,
): string {
  const d = normalizeNationalNumber(national);
  if (country.code === 'IN') {
    return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5, 10)}` : d;
  }
  if (country.maxDigits === 10) {
    if (d.length > 6) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`;
    if (d.length > 3) return `${d.slice(0, 3)} ${d.slice(3)}`;
    return d;
  }
  return d;
}

/** `+91 98765 43210` — for confirming back to the user which number we texted. */
export function formatE164ForDisplay(e164: string): string {
  const country =
    COUNTRIES.find((c) => c.dial !== '+1' && e164.startsWith(c.dial)) ??
    COUNTRIES.find((c) => e164.startsWith(c.dial));
  if (!country) return e164;
  const national = e164.slice(country.dial.length);
  return `${country.dial} ${formatNationalNumber(country, national)}`;
}

// ─── Session persistence ──────────────────────────────────────────────────

const SESSION_KEY = 'nudge.session';

export const sessionStore = {
  async get(): Promise<AuthSession | null> {
    try {
      const { value } = await Preferences.get({ key: SESSION_KEY });
      return value ? (JSON.parse(value) as AuthSession) : null;
    } catch {
      return null;
    }
  },
  async set(session: AuthSession): Promise<void> {
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
  },
  async clear(): Promise<void> {
    await Preferences.remove({ key: SESSION_KEY });
  },
};

export function guestSession(): AuthSession {
  return {
    user: {
      id: `guest-${Date.now().toString(36)}`,
      method: 'guest',
      phoneNumber: null,
      email: null,
      displayName: null,
      photoUrl: null,
    },
    token: null,
    signedInAt: Date.now(),
  };
}

// ─── Stub provider (what ships today) ─────────────────────────────────────

const stubProvider: AuthProvider = {
  id: 'stub',

  async sendPhoneCode(phoneE164: string): Promise<PhoneChallenge> {
    // Validated here as well as in the UI. The screen's check is a courtesy to
    // the user; this one is the actual gate — no code is ever issued for a
    // number that could not receive it.
    if (!isValidE164(phoneE164)) {
      throw new AuthError(INVALID_PHONE_MESSAGE, 'invalid-phone');
    }
    // Simulated latency, so the loading state is real during development.
    await delay(600);
    return { verificationId: `stub-${Date.now()}`, phoneNumber: phoneE164 };
  },

  async confirmPhoneCode(
    challenge: PhoneChallenge,
    code: string,
  ): Promise<AuthUser> {
    await delay(600);
    if (code !== STUB_OTP_CODE) {
      throw new AuthError('That code is not right. Try again.', 'invalid-code');
    }
    return {
      id: `phone-${challenge.phoneNumber.replace(/\D/g, '')}`,
      method: 'phone',
      phoneNumber: challenge.phoneNumber,
      email: null,
      displayName: null,
      photoUrl: null,
    };
  },

  async signOut(): Promise<void> {
    await sessionStore.clear();
  },
};

// ─── Firebase provider (written, not active) ──────────────────────────────

/**
 * Firebase Auth via `@capacitor-firebase/authentication`.
 *
 * The plugin is deliberately NOT a dependency yet — installing it without
 * `google-services.json` / `GoogleService-Info.plist` breaks the native build.
 * So it is loaded through a dynamic import and this file compiles fine without
 * it. Follow docs/AUTH_SETUP.md, then flip `activeProvider` at the bottom.
 */

/** Minimal shape of the bits of the plugin we use — avoids a compile-time dep. */
interface FirebaseAuthPlugin {
  signInWithPhoneNumber(opts: {
    phoneNumber: string;
  }): Promise<{ verificationId?: string }>;
  confirmVerificationCode(opts: {
    verificationId: string;
    verificationCode: string;
  }): Promise<{ user?: FirebaseUserShape | null }>;
  signOut(): Promise<void>;
}

interface FirebaseUserShape {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  photoUrl?: string | null;
}

/**
 * Held in a variable so neither TypeScript nor Vite tries to resolve the
 * package at build time — it is not installed until you follow AUTH_SETUP.md.
 */
const FIREBASE_AUTH_MODULE = '@capacitor-firebase/authentication';

async function loadFirebaseAuth(): Promise<FirebaseAuthPlugin> {
  try {
    const mod = (await import(/* @vite-ignore */ FIREBASE_AUTH_MODULE)) as {
      FirebaseAuthentication: FirebaseAuthPlugin;
    };
    return mod.FirebaseAuthentication;
  } catch {
    throw new AuthError(
      'Firebase auth is not installed yet. See docs/AUTH_SETUP.md.',
      'not-configured',
    );
  }
}

function toAuthUser(
  user: FirebaseUserShape | null | undefined,
  method: AuthMethod,
): AuthUser {
  if (!user) {
    throw new AuthError('Sign-in returned no user.', 'unknown');
  }
  return {
    id: user.uid,
    method,
    phoneNumber: user.phoneNumber ?? null,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoUrl: user.photoUrl ?? null,
  };
}

const firebaseProvider: AuthProvider = {
  id: 'firebase',

  async sendPhoneCode(phoneE164: string): Promise<PhoneChallenge> {
    // Check before the network call: an invalid number would be a wasted SMS
    // charge and a slower error for the user.
    if (!isValidE164(phoneE164)) {
      throw new AuthError(INVALID_PHONE_MESSAGE, 'invalid-phone');
    }
    const auth = await loadFirebaseAuth();
    const res = await auth.signInWithPhoneNumber({ phoneNumber: phoneE164 });
    if (!res.verificationId) {
      throw new AuthError('Could not start verification.', 'unknown');
    }
    return { verificationId: res.verificationId, phoneNumber: phoneE164 };
  },

  async confirmPhoneCode(
    challenge: PhoneChallenge,
    code: string,
  ): Promise<AuthUser> {
    const auth = await loadFirebaseAuth();
    const res = await auth.confirmVerificationCode({
      verificationId: challenge.verificationId,
      verificationCode: code,
    });
    return toAuthUser(res.user, 'phone');
  },

  async signOut(): Promise<void> {
    try {
      const auth = await loadFirebaseAuth();
      await auth.signOut();
    } finally {
      await sessionStore.clear();
    }
  },
};

// TODO: switch to `firebaseProvider` once docs/AUTH_SETUP.md is done.
export const activeProvider: AuthProvider = stubProvider;

void firebaseProvider; // kept wired for the switch-over.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
