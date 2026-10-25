import { loadConfig } from '../server/config.ts';
import { createDb, type Db } from '../server/db/client.ts';
import { migrate } from '../server/db/migrate.ts';
import { createDeps, type Clock, type Deps } from '../server/deps.ts';
import { createFakePaymentAdapter, type FakePaymentAdapter } from '../server/adapters/fake-payments.ts';
import { createMemoryEmail, type EmailAdapter } from '../server/adapters/email.ts';
import { createMemoryPush, type PushAdapter } from '../server/adapters/push.ts';
import { resetRateLimits } from '../server/http.ts';
import { randomUUID } from 'node:crypto';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const TEST_ORIGIN = 'http://localhost:5173';
export const MIN = 60_000;

/** Skip reason for DB tests when no test database is configured. Printed by node --test. */
export const SKIP_WITHOUT_DB = TEST_DATABASE_URL
  ? false
  : 'set TEST_DATABASE_URL to run database tests (see README, "Running tests")';

export interface ManualClock extends Clock {
  set(date: Date): void;
  advance(ms: number): void;
}

export function manualClock(start: Date): ManualClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    set: (date) => {
      current = date.getTime();
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

export interface World {
  db: Db;
  deps: Deps;
  clock: ManualClock;
  payments: FakePaymentAdapter;
  email: EmailAdapter & { sent: { to: string; subject: string; text: string }[]; failNext: boolean };
  push: PushAdapter & { sent: { target: { endpoint: string }; message: { title: string } }[] };
}

/** Recreates the schema from the migrations, so each test file starts from a known state. */
export async function resetDatabase(): Promise<Db> {
  const db = createDb(TEST_DATABASE_URL, 8);
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public');
  await migrate(db);
  return db;
}

export async function createWorld(start = new Date('2026-10-25T13:30:00Z'), pushOutcome?: Parameters<typeof createMemoryPush>[0]): Promise<World> {
  resetRateLimits();
  const db = await resetDatabase();
  const clock = manualClock(start);
  const payments = createFakePaymentAdapter({ keySecret: 'test-key-secret', webhookSecret: 'test-webhook-secret' });
  const email = createMemoryEmail();
  const push = createMemoryPush(pushOutcome);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    BB_APP_SECRET: 'test-app-secret-that-is-long-enough-to-sign-things',
    BB_PUBLIC_ORIGIN: TEST_ORIGIN,
    BB_HOLD_SECONDS: '120',
    BB_PAYMENT_GRACE_SECONDS: '600',
  });
  const deps = createDeps(config, { db, clock, payments, email, push });
  return { db, deps, clock, payments, email, push };
}

export async function insertProfile(db: Db, email: string, options: { admin?: boolean } = {}): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'insert into profiles (email, is_admin) values ($1, $2) returning id',
    [email.toLowerCase(), options.admin ?? false],
  );
  return row.id;
}

export async function insertProduct(
  db: Db,
  overrides: Partial<{
    name: string;
    condition: 'new' | 'open_box' | 'refurbished';
    shippingFeePaise: number;
    shippingEligible: boolean;
    procurementCostPaise: number | null;
    shippingCostPaise: number | null;
    otherCostPaise: number | null;
  }> = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into products (sku, name, description, category, condition, specs, warranty_text, return_policy_text,
                           shipping_eligible, shipping_fee_paise, procurement_cost_paise, shipping_cost_paise,
                           other_cost_paise, is_sample)
     values ($1, $2, 'Sample description', 'Audio', $3, '[{"label":"Type","value":"Over-ear"}]', '1 year warranty',
             '7 day returns on unused items', $4, $5, $6, $7, $8, true)
     returning id`,
    [
      `SKU-${randomUUID().slice(0, 8)}`,
      overrides.name ?? 'Studio Wireless Headphones',
      overrides.condition ?? 'new',
      overrides.shippingEligible ?? true,
      overrides.shippingFeePaise ?? 4900,
      overrides.procurementCostPaise === undefined ? 90_000 : overrides.procurementCostPaise,
      overrides.shippingCostPaise === undefined ? 4_000 : overrides.shippingCostPaise,
      overrides.otherCostPaise === undefined ? 0 : overrides.otherCostPaise,
    ],
  );
  return row.id;
}

export async function insertSession(
  db: Db,
  opensAt: Date,
  closesAt: Date,
  status: 'scheduled' | 'paused' | 'draft' = 'scheduled',
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'insert into sessions (name, status, window_opens_at, window_closes_at) values ($1, $2, $3, $4) returning id',
    ['Evening Drop', status, opensAt, closesAt],
  );
  return row.id;
}

export async function insertDrop(
  db: Db,
  input: {
    sessionId: string;
    productId: string;
    releaseAt: Date;
    closesAt: Date;
    salePaise?: number;
    quantity?: number;
    position?: number;
    status?: 'scheduled' | 'paused' | 'cancelled' | 'draft';
  },
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into drops (session_id, product_id, position, status, sale_price_paise, quantity, release_at, closes_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.sessionId,
      input.productId,
      input.position ?? 1,
      input.status ?? 'scheduled',
      input.salePaise ?? 149_900,
      input.quantity ?? 1,
      input.releaseAt,
      input.closesAt,
    ],
  );
  return row.id;
}

export async function insertAddress(db: Db, profileId: string, pincode = '560001'): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into addresses (profile_id, full_name, phone, line1, city, state, pincode, country_code)
     values ($1, 'Asha Rao', '+91 98450 00000', '12 MG Road', 'Bengaluru', 'Karnataka', $2, 'IN') returning id`,
    [profileId, pincode],
  );
  return row.id;
}

/** Signs a user in through the real code flow, and returns a cookie header for later requests. */
export async function signIn(world: World, email: string): Promise<string> {
  const { requestLoginCode, verifyLoginCode } = await import('../server/services/auth.ts');
  await requestLoginCode(world.deps, email);
  const sent = world.email.sent.at(-1);
  const code = /code is (\d{6})/.exec(sent?.text ?? '')?.[1];
  if (!code) throw new Error('No sign-in code was emailed');
  const result = await verifyLoginCode(world.deps, email, code);
  // Let the cooldown pass for the next sign-in in the same test.
  world.clock.advance(61_000);
  return `bb_session=${result.token}`;
}

export function apiRequest(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: boolean } = {}): Request {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin !== false && (init.method ?? 'GET') !== 'GET') headers.origin = TEST_ORIGIN;
  return new Request(`${TEST_ORIGIN}/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
