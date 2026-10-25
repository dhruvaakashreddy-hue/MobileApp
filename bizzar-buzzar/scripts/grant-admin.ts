/**
 * Grants administrator access to an email address. Run by the operator with database access.
 * There is deliberately no API for this. A buyer cannot reach it, and the API never writes is_admin.
 *
 *   npm run admin:grant -- ops@example.com
 */
import { loadConfig } from '../server/config.ts';
import { createDb } from '../server/db/client.ts';
import { audit } from '../server/services/audit.ts';
import { normaliseEmail } from '../server/services/auth.ts';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: npm run admin:grant -- <email>');
  process.exit(1);
}

const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = normaliseEmail(raw);
const db = createDb(config.databaseUrl, 2);
try {
  await db.tx(async (q) => {
    const [profile] = await q.query<{ id: string; is_admin: boolean }>(
      `insert into profiles (email, is_admin) values ($1, true)
       on conflict (email) do update set is_admin = true, updated_at = now()
       returning id, is_admin`,
      [email],
    );
    await audit(q, {
      actorId: null,
      actorKind: 'system',
      action: 'admin.granted',
      entityType: 'profile',
      entityId: profile.id,
      after: { granted: true },
    });
  });
  console.log(`Administrator access granted to ${email}. They must sign in again to see it.`);
} finally {
  await db.end();
}
