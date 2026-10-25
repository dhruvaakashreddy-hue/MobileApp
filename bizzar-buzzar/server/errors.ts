/** An error with an HTTP status and a stable machine-readable code. Messages are safe to show buyers. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = {
  badRequest: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(400, code, message, details),
  unauthorized: (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have access to this.') => new AppError(403, 'forbidden', message),
  notFound: (message = 'Not found.') => new AppError(404, 'not_found', message),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(409, code, message, details),
  tooMany: (message: string, retryAfterSeconds?: number) =>
    new AppError(429, 'rate_limited', message, retryAfterSeconds ? { retryAfterSeconds } : undefined),
  unavailable: (code: string, message: string) => new AppError(503, code, message),
  upstream: (message: string) => new AppError(502, 'payment_provider_error', message),
};
