import type { Deps } from '../deps.ts';
import { constantTimeEqual, hmacSha256Hex } from '../crypto.ts';
import type { DropState, PastDrop, PublicConfig, PublicProduct, SpecItem, Condition } from '../../shared/api-types.ts';
import { resolveDropPhase, resolveSessionState, type SessionState } from '../../shared/phase.ts';
import { savingsFor } from '../../shared/pricing.ts';

interface SessionRow {
  id: string;
  name: string;
  status: 'scheduled' | 'paused';
  window_opens_at: Date;
  window_closes_at: Date;
}

interface VisibleDropRow {
  id: string;
  status: 'scheduled' | 'paused';
  quantity: number;
  release_at: Date;
  closes_at: Date;
  product_id: string | null;
  sale_price_paise: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  category: string;
  condition: Condition;
  specs: SpecItem[];
  warranty_text: string;
  return_policy_text: string;
  shipping_eligible: boolean;
  shipping_fee_paise: number;
}

export interface SessionCandidate {
  id: string;
  status: 'scheduled' | 'paused';
  opensMs: number;
  closesMs: number;
}

/**
 * Picks the session a visitor should see: one that is open now, else the next upcoming one,
 * else the most recently ended one. Pure, so the choice is testable without a database.
 */
export function chooseSession<T extends SessionCandidate>(sessions: T[], nowMs: number): T | null {
  const open = sessions.filter((s) => nowMs >= s.opensMs && nowMs < s.closesMs);
  if (open.length > 0) return open.sort((a, b) => b.opensMs - a.opensMs)[0];
  const upcoming = sessions.filter((s) => s.opensMs > nowMs).sort((a, b) => a.opensMs - b.opensMs);
  if (upcoming.length > 0) return upcoming[0];
  const ended = sessions.filter((s) => s.closesMs <= nowMs).sort((a, b) => b.closesMs - a.closesMs);
  return ended[0] ?? null;
}

/** Media URLs carry an HMAC over the media ID. The ID is random, and the signature is only issued once a product is live. */
function mediaSignature(deps: Deps, mediaId: string): string {
  return hmacSha256Hex(deps.config.appSecret, `media:${mediaId}`);
}

export function mediaUrl(deps: Deps, mediaId: string): string {
  return `/api/media/${mediaId}?sig=${mediaSignature(deps, mediaId)}`;
}

export function verifyMediaSignature(deps: Deps, mediaId: string, signature: string): boolean {
  return constantTimeEqual(mediaSignature(deps, mediaId), signature);
}

export async function imageUrlFor(deps: Deps, productId: string): Promise<string | null> {
  const [media] = await deps.db.query<{ id: string }>(
    'select id from product_media where product_id = $1 order by sort_order, created_at limit 1',
    [productId],
  );
  return media ? mediaUrl(deps, media.id) : null;
}

async function loadPublicProduct(deps: Deps, productId: string): Promise<PublicProduct | null> {
  const [row] = await deps.db.asRole('bb_anon', null, (q) =>
    q.query<ProductRow>(
      `select id, name, description, category, condition, specs, warranty_text, return_policy_text,
              shipping_eligible, shipping_fee_paise
         from public_products where id = $1`,
      [productId],
    ),
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    condition: row.condition,
    specs: row.specs,
    warrantyText: row.warranty_text,
    returnPolicyText: row.return_policy_text,
    shippingEligible: row.shipping_eligible,
    shippingFeePaise: row.shipping_fee_paise,
    imageUrl: await imageUrlFor(deps, row.id),
  };
}

function emptyState(serverNow: Date): DropState {
  return {
    serverNow: serverNow.toISOString(),
    sessionState: 'none',
    session: null,
    phase: 'none',
    dropId: null,
    releaseAt: null,
    closesAt: null,
    availability: null,
    product: null,
    pricing: null,
  };
}

/**
 * The state a visitor sees, computed from the server clock. Reads go through the restricted
 * views, so a product or price is not returned before its release, whatever this code does.
 */
export async function getDropState(deps: Deps, viewerId: string | null): Promise<DropState> {
  const now = deps.clock.now();
  const nowMs = now.getTime();

  const sessions = await deps.db.asRole('bb_anon', null, (q) =>
    q.query<SessionRow>(
      `select id, name, status, window_opens_at, window_closes_at from public_sessions
        where window_closes_at > $1::timestamptz - interval '2 days'
          and window_opens_at < $1::timestamptz + interval '14 days'`,
      [now],
    ),
  );
  const picked = chooseSession(
    sessions.map((s) => ({ ...s, opensMs: s.window_opens_at.getTime(), closesMs: s.window_closes_at.getTime() })),
    nowMs,
  );
  if (!picked) return emptyState(now);

  const sessionState: SessionState = resolveSessionState(
    { status: picked.status, opensMs: picked.opensMs, closesMs: picked.closesMs },
    nowMs,
  );
  const session = {
    id: picked.id,
    name: picked.name,
    windowOpensAt: picked.window_opens_at.toISOString(),
    windowClosesAt: picked.window_closes_at.toISOString(),
  };

  const [drop] = await deps.db.asRole('bb_anon', null, (q) =>
    q.query<VisibleDropRow>(
      `select id, status, quantity, release_at, closes_at, product_id, sale_price_paise
         from public_drops where session_id = $1
        order by release_at desc limit 1`,
      [picked.id],
    ),
  );

  if (!drop) {
    return {
      serverNow: now.toISOString(),
      sessionState,
      session,
      phase: sessionState === 'paused' ? 'paused' : 'waiting',
      dropId: null,
      releaseAt: null,
      closesAt: null,
      availability: null,
      product: null,
      pricing: null,
    };
  }

  const [counts] = await deps.db.query<{ sold: number; held: number }>(
    `select coalesce(sum(quantity) filter (where status = 'paid'), 0)::int as sold,
            coalesce(sum(quantity) filter (
              where status = 'paying' or (status = 'held' and expires_at > $2)
            ), 0)::int as held
       from reservations where drop_id = $1`,
    [drop.id, now],
  );

  const phase = resolveDropPhase({
    nowMs,
    releaseMs: drop.release_at.getTime(),
    closesMs: drop.closes_at.getTime(),
    quantity: drop.quantity,
    soldUnits: counts.sold,
    dropStatus: drop.status,
    sessionPaused: sessionState === 'paused',
  });

  const released = nowMs >= drop.release_at.getTime();
  const product = released && drop.product_id ? await loadPublicProduct(deps, drop.product_id) : null;

  let pricing: DropState['pricing'] = null;
  if (product && drop.sale_price_paise !== null) {
    const [reference] = await deps.db.asRole('bb_anon', null, (q) =>
      q.query<{ amount_paise: number; captured_at: Date }>(
        `select amount_paise, captured_at from public_price_references
          where product_id = $1 and condition = $2
          order by captured_at desc limit 1`,
        [product.id, product.condition],
      ),
    );
    const referencePaise = reference?.amount_paise ?? null;
    const savings = savingsFor(referencePaise, drop.sale_price_paise);
    pricing = {
      currency: deps.config.currency,
      salePaise: drop.sale_price_paise,
      referencePaise,
      referenceCheckedAt: reference?.captured_at.toISOString() ?? null,
      savingsPaise: savings?.savingsPaise ?? null,
      savingsPercent: savings?.percent ?? null,
    };
  }

  let yourHold: { reservationId: string; expiresAt: string } | null = null;
  let yourOrderId: string | null = null;
  if (viewerId && released) {
    const [mine] = await deps.db.query<{ id: string; status: string; expires_at: Date; order_id: string | null }>(
      `select r.id, r.status, r.expires_at, o.id as order_id
         from reservations r
         left join orders o on o.reservation_id = r.id
        where r.drop_id = $1 and r.profile_id = $2 and r.status in ('held', 'paying', 'paid')
        limit 1`,
      [drop.id, viewerId],
    );
    if (mine?.status === 'paid') yourOrderId = mine.order_id;
    else if (mine) yourHold = { reservationId: mine.id, expiresAt: mine.expires_at.toISOString() };
  }

  const remaining = Math.max(0, drop.quantity - counts.sold - counts.held);
  const availability = released
    ? {
        quantity: drop.quantity,
        remaining,
        state: counts.sold >= drop.quantity ? ('sold' as const) : remaining === 0 ? ('held' as const) : ('available' as const),
        heldByYou: yourHold !== null,
        yourHold,
        yourOrderId,
      }
    : null;

  return {
    serverNow: now.toISOString(),
    sessionState,
    session,
    phase,
    dropId: drop.id,
    releaseAt: drop.release_at.toISOString(),
    closesAt: released ? drop.closes_at.toISOString() : null,
    availability,
    product,
    pricing,
  };
}

/** Adds one page view to today's count for a path. Stores no visitor identifier. */
export async function recordVisitDay(deps: Deps, path: string): Promise<void> {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: deps.config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(deps.clock.now());
  await deps.db.query(
    `insert into visit_counts (day, path, views) values ($1, $2, 1)
     on conflict (day, path) do update set views = visit_counts.views + 1`,
    [day, path],
  );
}

/** Sold or ended drops, most recent first. Buyer identities are never included. */
export async function listPastDrops(deps: Deps): Promise<PastDrop[]> {
  const now = deps.clock.now();
  const rows = await deps.db.asRole('bb_anon', null, (q) =>
    q.query<VisibleDropRow & { name: string; condition: Condition }>(
      `select d.id, d.status, d.quantity, d.release_at, d.closes_at, d.product_id, d.sale_price_paise,
              p.name, p.condition
         from public_drops d
         join public_products p on p.id = d.product_id
        where d.closes_at <= $1
        order by d.release_at desc
        limit 12`,
      [now],
    ),
  );
  if (rows.length === 0) return [];

  const soldRows = await deps.db.query<{ drop_id: string; sold: number }>(
    `select drop_id, coalesce(sum(quantity), 0)::int as sold
       from reservations where status = 'paid' and drop_id = any($1::uuid[])
      group by drop_id`,
    [rows.map((r) => r.id)],
  );
  const soldByDrop = new Map(soldRows.map((r) => [r.drop_id, r.sold]));

  const result: PastDrop[] = [];
  for (const row of rows) {
    result.push({
      dropId: row.id,
      productName: row.name,
      condition: row.condition,
      salePaise: row.sale_price_paise ?? 0,
      outcome: (soldByDrop.get(row.id) ?? 0) >= row.quantity ? 'sold' : 'ended',
      releasedAt: row.release_at.toISOString(),
      imageUrl: row.product_id ? await imageUrlFor(deps, row.product_id) : null,
    });
  }
  return result;
}

export function publicConfig(deps: Deps): PublicConfig {
  const { config } = deps;
  return {
    brand: config.brand,
    currency: config.currency,
    locale: config.locale,
    timeZone: config.timeZone,
    shippingCountries: config.shippingCountries,
    paymentMode: config.paymentMode,
    paymentsConfigured: deps.payments.configured,
    razorpayKeyId: deps.payments.publishableKey,
    pushConfigured: deps.push.configured,
    vapidPublicKey: deps.push.publicKey,
    emailConfigured: deps.email.configured,
    holdSeconds: config.holdSeconds,
    revealLeadSeconds: 30,
  };
}
