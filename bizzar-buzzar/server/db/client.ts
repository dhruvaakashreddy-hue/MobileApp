import pg from 'pg';

export type Row = Record<string, any>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Restricted roles that read paths switch into. Defined in db/migrations/0002_access.sql. */
export type RestrictedRole = 'bb_anon' | 'bb_user';

export interface Db extends Queryable {
  /** Runs `fn` in one transaction as the owner role. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /**
   * Runs `fn` in one transaction as a restricted role. For `bb_user`, `app.user_id` is
   * set so row-level security limits rows to that buyer.
   */
  asRole<T>(role: RestrictedRole, userId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

const ROLES: readonly RestrictedRole[] = ['bb_anon', 'bb_user'];

export function createDb(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 10_000 });

  function queryable(client: pg.PoolClient | pg.Pool): Queryable {
    return {
      async query<T = Row>(text: string, params?: unknown[]): Promise<T[]> {
        const result = await client.query(text, params);
        return result.rows as T[];
      },
    };
  }

  async function inTransaction<T>(
    prepare: (client: pg.PoolClient) => Promise<void>,
    fn: (q: Queryable) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await prepare(client);
      const result = await fn(queryable(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const db = queryable(pool) as Db;
  db.tx = (fn) => inTransaction(async () => undefined, fn);
  db.asRole = (role, userId, fn) => {
    if (!ROLES.includes(role)) throw new Error(`Unknown restricted role: ${String(role)}`);
    return inTransaction(async (client) => {
      // `role` is a closed union checked above, so it is safe to interpolate.
      await client.query(`set local role ${role}`);
      await client.query("select set_config('app.user_id', $1, true)", [userId ?? '']);
    }, fn);
  };
  db.end = () => pool.end();
  return db;
}

/** Postgres error codes this codebase reacts to. */
export const PG = {
  uniqueViolation: '23505',
  exclusionViolation: '23P01',
  permissionDenied: '42501',
} as const;

export function pgErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
