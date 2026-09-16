/**
 * Entitlement store — who has paid, and until when.
 *
 * Two backends, chosen at runtime:
 *
 *   1. **Upstash Redis** (or any Redis speaking the Upstash REST API) when
 *      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set. Durable,
 *      survives cold starts, no npm dependency — it is plain `fetch`.
 *   2. **In-memory** otherwise, for local development only. A serverless cold
 *      start wipes it, which would silently lock paying subscribers out, so it
 *      warns loudly on first use.
 *
 * Losing this store is not fatal on its own: `/subscription-status` falls back
 * to asking Razorpay directly when a record is missing. It is still the fast
 * path and the only place the deviceless subscriber → subscription mapping
 * lives, so run it durably in production.
 */

export interface Entitlement {
  subscriptionId: string;
  active: boolean;
  /** Epoch millis; null until the first successful charge. */
  expiresAt: number | null;
  /** Last webhook event applied, useful when debugging a support ticket. */
  lastEvent?: string;
  updatedAt?: number;
}

export interface EntitlementStore {
  get(subscriberId: string): Promise<Entitlement | null>;
  set(subscriberId: string, value: Entitlement): Promise<void>;
  /** Reverse lookup, so a webhook without notes can still find its owner. */
  findBySubscriptionId(subscriptionId: string): Promise<
    { subscriberId: string; entitlement: Entitlement } | null
  >;
}

const KEY_PREFIX = 'nudge:entitlement:';
const SUB_INDEX_PREFIX = 'nudge:subscription:';

/* ─────────────────────────── in-memory backend ─────────────────────────── */

const memory = new Map<string, Entitlement>();
let warned = false;

const memoryStore: EntitlementStore = {
  async get(subscriberId) {
    warnOnce();
    return memory.get(subscriberId) ?? null;
  },
  async set(subscriberId, value) {
    warnOnce();
    memory.set(subscriberId, value);
  },
  async findBySubscriptionId(subscriptionId) {
    warnOnce();
    for (const [subscriberId, entitlement] of memory) {
      if (entitlement.subscriptionId === subscriptionId) {
        return { subscriberId, entitlement };
      }
    }
    return null;
  },
};

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[nudge] Entitlement store is IN-MEMORY and will be wiped on restart. ' +
      'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production.',
  );
}

/* ──────────────────────────── Redis backend ────────────────────────────── */

function redisStore(url: string, token: string): EntitlementStore {
  const call = async (command: unknown[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      throw new Error(`Redis command failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { result?: unknown };
    return body.result ?? null;
  };

  return {
    async get(subscriberId) {
      const raw = await call(['GET', KEY_PREFIX + subscriberId]);
      if (typeof raw !== 'string') return null;
      try {
        return JSON.parse(raw) as Entitlement;
      } catch {
        return null;
      }
    },
    async set(subscriberId, value) {
      await call([
        'SET',
        KEY_PREFIX + subscriberId,
        JSON.stringify({ ...value, updatedAt: Date.now() }),
      ]);
      // The index lets the webhook resolve an owner even if `notes` were lost.
      await call([
        'SET',
        SUB_INDEX_PREFIX + value.subscriptionId,
        subscriberId,
      ]);
    },
    async findBySubscriptionId(subscriptionId) {
      const subscriberId = await call(['GET', SUB_INDEX_PREFIX + subscriptionId]);
      if (typeof subscriberId !== 'string') return null;
      const entitlement = await this.get(subscriberId);
      return entitlement ? { subscriberId, entitlement } : null;
    },
  };
}

/* ───────────────────────────── selection ───────────────────────────────── */

let cached: EntitlementStore | null = null;

export function entitlementStore(): EntitlementStore {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(url, token) : memoryStore;
  return cached;
}

/**
 * True when the record grants access right now.
 *
 * Deliberately NOT a type guard: `false` means "expired, revoked or missing",
 * and narrowing the false branch to `null` would hide the expired case.
 */
export function isEntitled(e: Entitlement | null): boolean {
  return !!e && e.active && !!e.expiresAt && e.expiresAt > Date.now();
}
