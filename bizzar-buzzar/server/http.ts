import { AppError, fail } from './errors.ts';

export const SESSION_COOKIE = 'bb_session';

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error: AppError): Response {
  const headers: Record<string, string> = {};
  const retryAfter = error.details?.retryAfterSeconds;
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter);
  return json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    error.status,
    headers,
  );
}

/** Reads a JSON body. Requires the JSON content type, which a cross-site HTML form cannot send. */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 32_768): Promise<T> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new AppError(415, 'unsupported_media_type', 'Send the request as JSON.');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new AppError(413, 'payload_too_large', 'That request is too large.');
  if (text.trim() === '') return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw fail.badRequest('invalid_json', 'The request body is not valid JSON.');
  }
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'local';
}

/** Rejects cross-site writes. A browser always sends Origin on cross-origin POST requests. */
export function assertSameOrigin(request: Request, publicOrigin: string): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== publicOrigin) {
    throw fail.forbidden('This request came from another site.');
  }
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter. Counts per process only, so it is best effort on a multi-instance host.
 * Shared limits need a shared store, and that is listed in the remaining setup.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw fail.tooMany('Too many requests. Wait a moment and try again.', Math.ceil((bucket.resetAt - now) / 1000));
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
