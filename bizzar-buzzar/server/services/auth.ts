import { randomInt } from 'node:crypto';
import type { Deps } from '../deps.ts';
import { fail } from '../errors.ts';
import { constantTimeEqual, hmacSha256Hex, randomToken, sha256Hex } from '../crypto.ts';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export interface SignedInProfile {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
}

export function normaliseEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw fail.badRequest('invalid_email', 'Enter a valid email address.');
  }
  return email;
}

function codeHash(deps: Deps, email: string, code: string): string {
  return hmacSha256Hex(deps.config.appSecret, `login:${email}:${code}`);
}

/**
 * Emails a six-digit sign-in code. The response is the same whether or not an account exists,
 * so the form cannot be used to find out which addresses have accounts.
 */
export async function requestLoginCode(deps: Deps, rawEmail: string): Promise<{ cooldownSeconds: number }> {
  const email = normaliseEmail(rawEmail);
  const now = deps.clock.now();

  const [recent] = await deps.db.query<{ created_at: Date }>(
    'select created_at from login_codes where email = $1 order by created_at desc limit 1',
    [email],
  );
  if (recent && now.getTime() - recent.created_at.getTime() < RESEND_COOLDOWN_MS) {
    const wait = RESEND_COOLDOWN_MS - (now.getTime() - recent.created_at.getTime());
    throw fail.tooMany('Wait a minute before requesting another code.', Math.ceil(wait / 1000));
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const [row] = await deps.db.query<{ id: string }>(
    'insert into login_codes (email, code_hash, expires_at) values ($1, $2, $3) returning id',
    [email, codeHash(deps, email, code), new Date(now.getTime() + CODE_TTL_MS)],
  );

  try {
    await deps.email.send({
      to: email,
      subject: 'Your Bizzar Buzzar sign-in code',
      text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not ask for this code, you can ignore this email.`,
    });
  } catch (error) {
    // A code nobody received must not block the next attempt.
    await deps.db.query('delete from login_codes where id = $1', [row.id]);
    throw error;
  }
  return { cooldownSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export interface VerifiedSignIn {
  token: string;
  expiresAt: Date;
  profile: SignedInProfile;
}

/** Checks a code and, if it matches, opens a session. Attempts are counted and capped. */
export async function verifyLoginCode(deps: Deps, rawEmail: string, rawCode: string): Promise<VerifiedSignIn> {
  const email = normaliseEmail(rawEmail);
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) throw fail.badRequest('invalid_code', 'Enter the 6-digit code from your email.');
  const now = deps.clock.now();

  // The failed-attempt counter is committed before any error is thrown. Throwing inside the
  // transaction would roll it back, and a guesser could retry forever.
  const outcome = await deps.db.tx(async (q) => {
    const [row] = await q.query<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts from login_codes
        where email = $1 and consumed_at is null and expires_at > $2
        order by created_at desc limit 1 for update`,
      [email, now],
    );
    if (!row) return { status: 'expired' as const };
    if (row.attempts >= MAX_ATTEMPTS) return { status: 'too_many' as const };

    await q.query('update login_codes set attempts = attempts + 1 where id = $1', [row.id]);
    if (!constantTimeEqual(row.code_hash, codeHash(deps, email, code))) return { status: 'wrong' as const };

    await q.query('update login_codes set consumed_at = $2 where id = $1', [row.id, now]);
    const [profile] = await q.query<SignedInProfile>(
      `insert into profiles (email) values ($1)
       on conflict (email) do update set email = excluded.email
       returning id, email, display_name, is_admin`,
      [email],
    );
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await q.query('insert into login_sessions (profile_id, token_hash, expires_at) values ($1, $2, $3)', [
      profile.id,
      sha256Hex(token),
      expiresAt,
    ]);
    return { status: 'ok' as const, token, expiresAt, profile };
  });

  if (outcome.status === 'expired') throw fail.badRequest('code_expired', 'That code has expired. Request a new one.');
  if (outcome.status === 'too_many') throw fail.tooMany('Too many attempts. Request a new code.');
  if (outcome.status === 'wrong') throw fail.badRequest('code_invalid', 'That code is not right.');
  return { token: outcome.token, expiresAt: outcome.expiresAt, profile: outcome.profile };
}

/** Looks up the signed-in buyer for a session token. Returns null for unknown, expired or revoked tokens. */
export async function resolveSession(deps: Deps, token: string | null): Promise<SignedInProfile | null> {
  if (!token) return null;
  const [row] = await deps.db.query<SignedInProfile>(
    `select p.id, p.email, p.display_name, p.is_admin
       from login_sessions s
       join profiles p on p.id = s.profile_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > $2`,
    [sha256Hex(token), deps.clock.now()],
  );
  return row ?? null;
}

export async function revokeSession(deps: Deps, token: string): Promise<void> {
  await deps.db.query(
    'update login_sessions set revoked_at = $2 where token_hash = $1 and revoked_at is null',
    [sha256Hex(token), deps.clock.now()],
  );
}
