/**
 * Development sample data. Refuses to run in production.
 *
 * Creates clearly labelled sample products, price evidence and a session whose drops
 * release a few minutes from now, so the waiting, reveal and live states can all be seen locally.
 * Every row it creates is flagged is_sample, and every write goes through the same services as the admin UI.
 *
 *   npm run db:seed
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../server/config.ts';
import { createDeps, systemClock } from '../server/deps.ts';
import { createDb } from '../server/db/client.ts';
import { migrate } from '../server/db/migrate.ts';
import { addPriceReference, createDrop, createProduct, createSession, scheduleDrop, setSessionStatus } from '../server/services/admin.ts';
import { createEmailAdapter } from '../server/adapters/email.ts';
import { unconfiguredPush } from '../server/adapters/push.ts';
import { unconfiguredPayments } from '../server/adapters/payments.ts';

const config = loadConfig();
if (config.env === 'production') {
  console.error('db:seed refuses to run with NODE_ENV=production.');
  process.exit(1);
}
if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const db = createDb(config.databaseUrl, 2);
await migrate(db);
const deps = createDeps(config, {
  db,
  clock: systemClock,
  payments: unconfiguredPayments(),
  email: createEmailAdapter(config.email),
  push: unconfiguredPush(),
});

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const [admin] = await db.query<{ id: string }>(
  'insert into profiles (email, is_admin) values ($1, true) on conflict (email) do update set is_admin = true returning id',
  [adminEmail.toLowerCase()],
);
const adminId = admin.id;

const existing = await db.query('select id from sessions where name = $1', ['Evening Drop (sample)']);
if (existing.length > 0) {
  console.log('Sample session already exists. Nothing changed. Drop the schema (npm run db:reset) to start again.');
  await db.end();
  process.exit(0);
}

const svg = (file: string) => readFile(path.resolve('public/preview', file));
const samples = [
  {
    sku: 'SAMPLE-HP-001',
    name: 'Studio Wireless Headphones',
    description: 'Over-ear wireless headphones with soft dark ear cushions and a folding headband. Sample product for local development.',
    category: 'Audio',
    condition: 'new' as const,
    specs: [
      { label: 'Type', value: 'Over-ear, wireless' },
      { label: 'Battery', value: 'Up to 40 hours' },
      { label: 'Connection', value: 'Bluetooth 5.3' },
      { label: 'Weight', value: '265 g' },
    ],
    shippingFeePaise: 0,
    procurementCostPaise: 62_000,
    shippingCostPaise: 3_000,
    otherCostPaise: 500,
    image: 'studio-headphones.svg',
    salePaise: 149_900,
    reference: { paise: 499_900, label: 'Sample reference listing', note: 'Sample evidence for local development only. Replace with a checked listing.' },
    minutesToRelease: 3,
  },
  {
    sku: 'SAMPLE-SP-002',
    name: 'Compact Speaker',
    description: 'Pocket Bluetooth speaker with a fabric grille. Sample product for local development.',
    category: 'Audio',
    condition: 'open_box' as const,
    specs: [
      { label: 'Type', value: 'Portable' },
      { label: 'Battery', value: 'Up to 12 hours' },
      { label: 'Water rating', value: 'IP67' },
    ],
    shippingFeePaise: 4_900,
    procurementCostPaise: 38_000,
    shippingCostPaise: 2_500,
    otherCostPaise: null,
    image: 'compact-speaker.svg',
    salePaise: 89_900,
    reference: null,
    minutesToRelease: 12,
  },
  {
    sku: 'SAMPLE-KB-003',
    name: 'Mechanical Keyboard',
    description: 'Compact tenkeyless mechanical keyboard with a lime accent key. Sample product for local development.',
    category: 'Peripherals',
    condition: 'refurbished' as const,
    specs: [
      { label: 'Layout', value: 'TKL, 87 keys' },
      { label: 'Switches', value: 'Linear' },
      { label: 'Connection', value: 'USB-C' },
    ],
    shippingFeePaise: 4_900,
    procurementCostPaise: 105_000,
    shippingCostPaise: 4_000,
    otherCostPaise: 1_000,
    image: 'mechanical-keyboard.svg',
    salePaise: 219_900,
    reference: null,
    minutesToRelease: 25,
  },
];

const now = Date.now();
const sessionId = await createSession(deps, adminId, {
  name: 'Evening Drop (sample)',
  opensAt: new Date(now - 5 * 60_000),
  closesAt: new Date(now + 3 * 60 * 60_000),
});
await setSessionStatus(deps, adminId, sessionId, 'publish');

for (const [index, sample] of samples.entries()) {
  const productId = await createProduct(deps, adminId, {
    sku: sample.sku,
    name: sample.name,
    description: sample.description,
    category: sample.category,
    condition: sample.condition,
    specs: sample.specs,
    warrantyText: '1 year brand warranty (sample text, to be replaced)',
    returnPolicyText: '7 day returns on unused items (sample text, to be replaced)',
    shippingEligible: true,
    shippingFeePaise: sample.shippingFeePaise,
    procurementCostPaise: sample.procurementCostPaise,
    shippingCostPaise: sample.shippingCostPaise,
    otherCostPaise: sample.otherCostPaise,
    isSample: true,
  });

  // Sample artwork goes into the database, as an uploaded product image would.
  await db.query('insert into product_media (product_id, content_type, bytes, sort_order) values ($1, $2, $3, 0)', [
    productId,
    'image/svg+xml',
    await svg(sample.image),
  ]);

  if (sample.reference) {
    await addPriceReference(deps, adminId, productId, {
      condition: sample.condition,
      amountPaise: sample.reference.paise,
      sourceLabel: sample.reference.label,
      sourceUrl: null,
      evidenceNote: sample.reference.note,
      capturedAt: new Date(now),
    });
  }

  const release = new Date(now + sample.minutesToRelease * 60_000);
  const dropId = await createDrop(deps, adminId, sessionId, {
    productId,
    salePaise: sample.salePaise,
    quantity: 1,
    position: index + 1,
    releaseAt: release,
    closesAt: new Date(release.getTime() + 5 * 60_000),
  });
  await scheduleDrop(deps, adminId, dropId);
  console.log(`Scheduled "${sample.name}" to release at ${release.toISOString()}`);
}

console.log(`Sample data ready. Admin account: ${adminEmail}. Sign in with the code written to ${config.email.outboxDir}.`);
await db.end();
