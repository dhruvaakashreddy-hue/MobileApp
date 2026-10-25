import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function sha256Hex(message: string): string {
  return createHash('sha256').update(message).digest('hex');
}

/** Compares two strings in constant time. Unequal lengths return false without leaking which part differed. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** An unguessable URL-safe token, for session cookies. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
