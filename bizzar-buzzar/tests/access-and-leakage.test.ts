import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleApiRequest } from '../server/handler.ts';
import { mediaUrl } from '../server/services/catalogue.ts';
import { getDropState } from '../server/services/catalogue.ts';
import {
  apiRequest,
  createWorld,
  insertAddress,
  insertDrop,
  insertProduct,
  insertProfile,
  insertSession,
  MIN,
  SKIP_WITHOUT_DB,
  signIn,
  type World,
} from './helpers.ts';

/**
 * These tests use real time. The public views read the database clock, so the reveal window
 * and the release boundary must be checked against the same clock the database uses.
 */
describe('database access policies', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld(new Date());
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('gives visitors no direct access to base tables', async () => {
    for (const table of ['products', 'drops', 'reservations', 'orders', 'profiles', 'audit_log']) {
      await assert.rejects(
        world.db.asRole('bb_anon', null, (q) => q.query(`select * from ${table}`)),
        (e: { code?: string }) => e.code === '42501',
        `visitors must not read ${table}`,
      );
    }
  });

  it('shows a drop 30 seconds before release, with the product and price still withheld', async () => {
    const productId = await insertProduct(world.db);
    const sessionId = await insertSession(world.db, new Date(Date.now() - 60 * MIN), new Date(Date.now() + 120 * MIN));
    await insertDrop(world.db, {
      sessionId,
      productId,
      releaseAt: new Date(Date.now() + 29_000),
      closesAt: new Date(Date.now() + 5 * MIN),
    });
    const [visible] = await world.db.asRole('bb_anon', null, (q) =>
      q.query<{ product_id: string | null; sale_price_paise: number | null }>(
        'select product_id, sale_price_paise from public_drops',
      ),
    );
    assert.ok(visible, 'inside the 30 second reveal window the drop row is visible');
    assert.equal(visible.product_id, null, 'the product is withheld until release');
    assert.equal(visible.sale_price_paise, null, 'the price is withheld until release');
  });

  it('does not show a drop 31 seconds before release', async () => {
    const productId = await insertProduct(world.db);
    const sessionId = await insertSession(world.db, new Date(Date.now() - 60 * MIN), new Date(Date.now() + 120 * MIN));
    await insertDrop(world.db, {
      sessionId,
      productId,
      releaseAt: new Date(Date.now() + 31_000),
      closesAt: new Date(Date.now() + 5 * MIN),
    });
    const rows = await world.db.asRole('bb_anon', null, (q) => q.query('select id from public_drops'));
    assert.equal(rows.length, 0);
    const products = await world.db.asRole('bb_anon', null, (q) => q.query('select id from public_products'));
    assert.equal(products.length, 0, 'an unreleased product is not visible at all');
  });

  it('releases the product and price at the release moment', async () => {
    const productId = await insertProduct(world.db);
    const sessionId = await insertSession(world.db, new Date(Date.now() - 60 * MIN), new Date(Date.now() + 120 * MIN));
    await insertDrop(world.db, {
      sessionId,
      productId,
      releaseAt: new Date(Date.now() - 1_000),
      closesAt: new Date(Date.now() + 5 * MIN),
      salePaise: 149_900,
    });
    const [row] = await world.db.asRole('bb_anon', null, (q) =>
      q.query<{ product_id: string; sale_price_paise: number }>('select product_id, sale_price_paise from public_drops'),
    );
    assert.equal(row.product_id, productId);
    assert.equal(row.sale_price_paise, 149_900);
    const products = await world.db.asRole('bb_anon', null, (q) => q.query<{ name: string }>('select name from public_products'));
    assert.equal(products.length, 1);
  });

  it('shows a buyer only their own orders, without cost or provider columns', async () => {
    const productId = await insertProduct(world.db);
    const sessionId = await insertSession(world.db, new Date(Date.now() - 60 * MIN), new Date(Date.now() + 120 * MIN));
    const dropId = await insertDrop(world.db, { sessionId, productId, releaseAt: new Date(Date.now() - MIN), closesAt: new Date(Date.now() + 5 * MIN) });
    const alice = await insertProfile(world.db, 'alice-orders@example.com');
    const bob = await insertProfile(world.db, 'bob-orders@example.com');
    for (const [profile, label] of [[alice, 'a'], [bob, 'b']] as const) {
      const [res] = await world.db.query<{ id: string }>(
        `insert into reservations (drop_id, profile_id, status, expires_at) values ($1, $2, 'paid', now()) returning id`,
        [dropId, profile],
      );
      await world.db.query(
        `insert into orders (reservation_id, profile_id, drop_id, product_id, quantity, item_paise, shipping_paise, total_paise,
                             address, product_snapshot, cost_procurement_paise, provider_order_id, payment_status, paid_at)
         values ($1, $2, $3, $4, 1, 149900, 4900, 154800, '{"fullName":"x"}', '{"name":"Studio Wireless Headphones","condition":"new"}',
                 90000, $5, 'paid', now())`,
        [res.id, profile, dropId, productId, `order_${label}_${randomUUID()}`],
      );
    }

    const visible = await world.db.asRole('bb_user', alice, (q) => q.query<{ profile_id: string }>('select profile_id from orders'));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].profile_id, alice);

    await assert.rejects(
      world.db.asRole('bb_user', alice, (q) => q.query('select cost_procurement_paise from orders')),
      (e: { code?: string }) => e.code === '42501',
      'cost snapshots are not readable by buyers',
    );
    await assert.rejects(
      world.db.asRole('bb_user', alice, (q) => q.query('select provider_order_id from orders')),
      (e: { code?: string }) => e.code === '42501',
      'provider identifiers are not readable by buyers',
    );
  });

  it('stops a buyer from granting themselves administrator access', async () => {
    const alice = await insertProfile(world.db, 'self-admin@example.com');
    await assert.rejects(
      world.db.asRole('bb_user', alice, (q) => q.query('update profiles set is_admin = true where id = $1', [alice])),
      (e: { code?: string }) => e.code === '42501',
    );
    const [row] = await world.db.query<{ is_admin: boolean }>('select is_admin from profiles where id = $1', [alice]);
    assert.equal(row.is_admin, false);
  });

  it('lets a buyer change their display name, and nothing else on their profile', async () => {
    const alice = await insertProfile(world.db, 'name-change@example.com');
    await world.db.asRole('bb_user', alice, (q) => q.query("update profiles set display_name = 'Alice' where id = $1", [alice]));
    await assert.rejects(
      world.db.asRole('bb_user', alice, (q) => q.query("update profiles set email = 'other@example.com' where id = $1", [alice])),
      (e: { code?: string }) => e.code === '42501',
    );
  });

  it('keeps one buyer addresses away from another buyer', async () => {
    const alice = await insertProfile(world.db, 'addr-a@example.com');
    const bob = await insertProfile(world.db, 'addr-b@example.com');
    await insertAddress(world.db, bob);
    const aliceSees = await world.db.asRole('bb_user', alice, (q) => q.query('select id from addresses'));
    assert.equal(aliceSees.length, 0);
    const bobSees = await world.db.asRole('bb_user', bob, (q) => q.query('select id from addresses'));
    assert.equal(bobSees.length, 1);
  });

  it('never exposes push endpoints or keys to a buyer', async () => {
    const alice = await insertProfile(world.db, 'push-keys@example.com');
    await world.db.query(
      "insert into push_subscriptions (profile_id, endpoint, p256dh, auth_secret) values ($1, 'https://push.example/abc', 'key', 'secret')",
      [alice],
    );
    await assert.rejects(
      world.db.asRole('bb_user', alice, (q) => q.query('select endpoint from push_subscriptions')),
      (e: { code?: string }) => e.code === '42501',
    );
  });
});

describe('what the public API reveals', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld(new Date());
  });
  afterEach(async () => {
    await world.db.end();
  });

  async function setup(releaseInMin: number) {
    const productId = await insertProduct(world.db, { name: 'Studio Wireless Headphones' });
    const sessionId = await insertSession(world.db, new Date(Date.now() - 30 * MIN), new Date(Date.now() + 120 * MIN));
    const dropId = await insertDrop(world.db, {
      sessionId,
      productId,
      salePaise: 149_900,
      releaseAt: new Date(Date.now() + releaseInMin * MIN),
      closesAt: new Date(Date.now() + (releaseInMin + 5) * MIN),
    });
    return { productId, dropId };
  }

  it('reveals nothing about a future product in the waiting state', async () => {
    const { productId, dropId } = await setup(10);
    const response = await handleApiRequest(apiRequest('/drop'), world.deps);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text.includes('Studio Wireless Headphones'), false);
    assert.equal(text.includes(productId), false);
    assert.equal(text.includes(dropId), false, 'the drop ID is not shown before the reveal');
    assert.equal(text.includes('149900'), false);
    const body = JSON.parse(text);
    assert.equal(body.phase, 'waiting');
    assert.equal(body.releaseAt, null, 'the precise release time is not shown before the reveal');
  });

  it('shows the countdown, but not the product, during the reveal', async () => {
    await setup(0.25); // 15 seconds to release, which is inside the 30 second reveal window
    const body = await getDropState(world.deps, null);
    assert.equal(body.phase, 'reveal');
    assert.ok(body.releaseAt, 'the countdown needs the release time');
    assert.equal(body.product, null);
    assert.equal(body.pricing, null);
    assert.equal(JSON.stringify(body).includes('Studio Wireless Headphones'), false);
  });

  it('shows the product once it is live, and the buyer identity of nobody', async () => {
    const { productId } = await setup(-1);
    const alice = await insertProfile(world.db, 'visible-alice@example.com');
    const body = await getDropState(world.deps, null);
    assert.equal(body.phase, 'live');
    assert.equal(body.product?.id, productId);
    assert.equal(body.pricing?.salePaise, 149_900);
    assert.equal(JSON.stringify(body).includes(alice), false);
  });

  it('keeps unreleased product images out of reach until the release moment', async () => {
    const { productId } = await setup(10);
    const [media] = await world.db.query<{ id: string }>(
      `insert into product_media (product_id, content_type, bytes) values ($1, 'image/png', $2) returning id`,
      [productId, Buffer.from([137, 80, 78, 71])],
    );
    // mediaUrl returns the browser path including "/api". apiRequest adds that prefix itself.
    const url = mediaUrl(world.deps, media.id).replace(/^\/api/, '');
    const early = await handleApiRequest(apiRequest(url), world.deps);
    assert.equal(early.status, 404, 'a valid signature is not enough before release');

    const forged = await handleApiRequest(apiRequest(`/media/${media.id}?sig=${'0'.repeat(64)}`), world.deps);
    assert.equal(forged.status, 404);

    // Release is 10 minutes out on the server clock, so move the clock past it before checking.
    world.clock.advance(11 * MIN);
    await world.db.query("update drops set release_at = now() - interval '1 second', closes_at = now() + interval '5 minutes' where product_id = $1", [productId]);
    const released = await handleApiRequest(apiRequest(url), world.deps);
    assert.equal(released.status, 200);
    assert.equal(released.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('administrator access and sign-in', { skip: SKIP_WITHOUT_DB }, () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld(new Date());
  });
  afterEach(async () => {
    await world.db.end();
  });

  it('refuses admin endpoints to visitors and to buyers, and allows an administrator', async () => {
    const buyerCookie = await signIn(world, 'plain-buyer@example.com');
    const adminCookie = await signIn(world, 'boss@example.com');
    await world.db.query("update profiles set is_admin = true where email = 'boss@example.com'");

    const anonymous = await handleApiRequest(apiRequest('/admin/summary'), world.deps);
    assert.equal(anonymous.status, 401);
    const buyer = await handleApiRequest(apiRequest('/admin/summary', { cookie: buyerCookie }), world.deps);
    assert.equal(buyer.status, 403);
    const admin = await handleApiRequest(apiRequest('/admin/summary', { cookie: adminCookie }), world.deps);
    assert.equal(admin.status, 200);
  });

  it('ignores an attempt to grant administrator access through the profile API', async () => {
    const cookie = await signIn(world, 'escalate@example.com');
    const patched = await handleApiRequest(
      apiRequest('/me', { method: 'PATCH', cookie, body: { displayName: 'Eve', isAdmin: true } }),
      world.deps,
    );
    assert.equal(patched.status, 200);
    const body = (await patched.json()) as { profile: { isAdmin: boolean } };
    assert.equal(body.profile.isAdmin, false);
    const [row] = await world.db.query<{ is_admin: boolean }>("select is_admin from profiles where email = 'escalate@example.com'");
    assert.equal(row.is_admin, false);
  });

  it('refuses writes from another site, even for an administrator with a live session', async () => {
    const cookie = await signIn(world, 'csrf-admin@example.com');
    await world.db.query("update profiles set is_admin = true where email = 'csrf-admin@example.com'");
    const request = new Request('http://localhost:5173/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
      body: JSON.stringify({}),
    });
    const response = await handleApiRequest(request, world.deps);
    assert.equal(response.status, 403, 'the cookie alone does not authorise a cross-site write');
  });

  it('issues a session only for the right code, and cools down repeated requests', async () => {
    const { requestLoginCode, verifyLoginCode } = await import('../server/services/auth.ts');
    await requestLoginCode(world.deps, 'code-flow@example.com');
    await assert.rejects(requestLoginCode(world.deps, 'code-flow@example.com'), (e: { code?: string }) => e.code === 'rate_limited');

    const sent = world.email.sent.at(-1);
    const real = /code is (\d{6})/.exec(sent?.text ?? '')?.[1] ?? '';
    const wrong = real === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(verifyLoginCode(world.deps, 'code-flow@example.com', wrong), (e: { code?: string }) => e.code === 'code_invalid');
    }
    await assert.rejects(
      verifyLoginCode(world.deps, 'code-flow@example.com', real),
      (e: { code?: string }) => e.code === 'rate_limited',
      'after five wrong guesses even the right code is refused',
    );
  });

  it('expires a sign-in code after ten minutes', async () => {
    const { requestLoginCode, verifyLoginCode } = await import('../server/services/auth.ts');
    await requestLoginCode(world.deps, 'expiry@example.com');
    const real = /code is (\d{6})/.exec(world.email.sent.at(-1)?.text ?? '')?.[1] ?? '';
    world.clock.advance(11 * MIN);
    await assert.rejects(verifyLoginCode(world.deps, 'expiry@example.com', real), (e: { code?: string }) => e.code === 'code_expired');
  });

  it('does not lock anyone out when the email cannot be sent', async () => {
    const { requestLoginCode } = await import('../server/services/auth.ts');
    world.email.failNext = true;
    await assert.rejects(requestLoginCode(world.deps, 'mailfail@example.com'));
    const [{ count }] = await world.db.query<{ count: number }>("select count(*)::int as count from login_codes where email = 'mailfail@example.com'");
    assert.equal(count, 0, 'the unsent code is removed');
    await requestLoginCode(world.deps, 'mailfail@example.com');
  });
});
