import { loadConfig } from '../server/config.ts';
import { createDb } from '../server/db/client.ts';
import { migrate } from '../server/db/migrate.ts';

const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const db = createDb(config.databaseUrl, 2);
try {
  const applied = await migrate(db);
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is already up to date.');
} finally {
  await db.end();
}
