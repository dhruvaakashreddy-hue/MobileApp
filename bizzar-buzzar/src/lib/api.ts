import type { ApiErrorBody } from '../../shared/api-types.ts';
import { noteServerTime } from './clock.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Calls the API. The server's `serverNow`, when present, corrects the local clock used for
 * countdowns. Errors come back as ApiError, carrying the message the buyer should see.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const started = Date.now();
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const ended = Date.now();

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, 'bad_response', 'The server sent an unexpected reply. Try again.');
    }
  }

  const serverNow = (data as { serverNow?: unknown } | null)?.serverNow;
  if (typeof serverNow === 'string') noteServerTime(serverNow, started, ended);

  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? 'error', error?.message ?? 'Something went wrong. Try again.', error?.details);
  }
  return data as T;
}

/** What to show a buyer when a request fails. Network failures get a plain explanation. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'We could not reach the server. Check your connection and try again.';
}
