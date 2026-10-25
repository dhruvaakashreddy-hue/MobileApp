import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations', import.meta.url));

/**
 * Applies pending .sql files in name order, one transaction each. A transaction-scoped
 * advisory lock stops two deploys from migrating at the same time.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(
    'create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())',
  );
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    const ran = await db.tx(async (q) => {
      await q.query("select pg_advisory_xact_lock(hashtext('bizzar-buzzar-migrations'))");
      const [existing] = await q.query('select version from schema_migrations where version = $1', [file]);
      if (existing) return false;
      await q.query(sql);
      await q.query('insert into schema_migrations (version) values ($1)', [file]);
      return true;
    });
    if (ran) applied.push(file);
  }
  return applied;
}
