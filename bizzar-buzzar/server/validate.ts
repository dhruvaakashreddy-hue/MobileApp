import { fail } from './errors.ts';

/** Small validators. Each throws a 400 that names the field, so the form can say what to fix. */

export function requireString(value: unknown, field: string, { min = 1, max = 500 } = {}): string {
  if (typeof value !== 'string') throw fail.badRequest('invalid_field', `${field} is required.`, { field });
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw fail.badRequest('invalid_field', `${field} must be ${min} to ${max} characters.`, { field });
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, { max = 500 } = {}): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, { min: 1, max });
}

export function requireInt(value: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw fail.badRequest('invalid_field', `${field} must be a whole number from ${min} to ${max}.`, { field });
  }
  return value;
}

export function optionalInt(value: unknown, field: string, bounds?: { min?: number; max?: number }): number | null {
  if (value === undefined || value === null) return null;
  return requireInt(value, field, bounds);
}

export function requireBool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw fail.badRequest('invalid_field', `${field} must be true or false.`, { field });
  return value;
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw fail.badRequest('invalid_field', `${field} is not a valid ID.`, { field });
  }
  return value;
}

/** Parses an ISO 8601 instant. Date-only or offset-free strings are rejected so no zone is guessed. */
export function requireInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw fail.badRequest('invalid_field', `${field} must be a full date and time with a timezone offset.`, { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw fail.badRequest('invalid_field', `${field} is not a real date.`, { field });
  return date;
}

export function optionalInstant(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return requireInstant(value, field);
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw fail.badRequest('invalid_field', `${field} must be one of: ${allowed.join(', ')}.`, { field });
  }
  return value as T;
}
