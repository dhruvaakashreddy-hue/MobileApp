import { createEmailAdapter, type EmailAdapter } from './adapters/email.ts';
import { unconfiguredPayments, type PaymentAdapter } from './adapters/payments.ts';
import { createRazorpayAdapter } from './adapters/razorpay.ts';
import { createWebPushAdapter, unconfiguredPush, type PushAdapter } from './adapters/push.ts';
import { loadConfig, type Config } from './config.ts';
import { createDb, type Db } from './db/client.ts';

/** The server clock. Every availability decision reads time from here, never from a browser. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface Deps {
  config: Config;
  db: Db;
  clock: Clock;
  payments: PaymentAdapter;
  email: EmailAdapter;
  push: PushAdapter;
}

type Overridable = Partial<Pick<Deps, 'db' | 'clock' | 'payments' | 'email' | 'push'>>;

export function createDeps(config: Config, overrides: Overridable = {}): Deps {
  if (!config.databaseUrl && !overrides.db) throw new Error('DATABASE_URL is not set.');
  return {
    config,
    db: overrides.db ?? createDb(config.databaseUrl as string),
    clock: overrides.clock ?? systemClock,
    payments:
      overrides.payments ??
      (config.razorpay
        ? createRazorpayAdapter({ ...config.razorpay, mode: config.paymentMode })
        : unconfiguredPayments()),
    email: overrides.email ?? createEmailAdapter(config.email),
    push: overrides.push ?? (config.vapid ? createWebPushAdapter(config.vapid) : unconfiguredPush()),
  };
}

let shared: Deps | null = null;

/** The process-wide dependencies, created on first use from environment variables. */
export function getDeps(): Deps {
  shared ??= createDeps(loadConfig());
  return shared;
}
