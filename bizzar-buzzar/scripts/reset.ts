/**
 * Drops every table in the development database and re-applies the migrations.
 * Destroys data, so it refuses to run in production.
 *
 *   npm run db:reset
 */
import { loadConfig } from '../server/config.ts';
import { createDb } from '../server/db/client.ts';
import { migrate } from '../server/db/migrate.ts';

const config = loadConfig();
if (config.env === 'production') {
  console.error('db:reset refuses to run with NODE_ENV=production.');
  process.exit(1);
}
if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const db = createDb(config.databaseUrl, 2);
try {
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public');
  const applied = await migrate(db);
  console.log(`Reset complete. Applied: ${applied.join(', ')}`);
} finally {
  await db.end();
}
