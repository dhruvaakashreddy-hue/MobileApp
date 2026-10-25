import type { Deps } from '../deps.ts';
import { fail } from '../errors.ts';
import type { AddressView, MeResponse, OrderPaymentStatus, OrderSummary, FulfilmentStatus, Condition } from '../../shared/api-types.ts';
import type { SignedInProfile } from './auth.ts';

export async function getMe(deps: Deps, profile: SignedInProfile): Promise<MeResponse> {
  const [prefs] = await deps.db.asRole('bb_user', profile.id, (q) =>
    q.query<{ push_enabled: boolean; email_reminders: boolean }>(
      'select push_enabled, email_reminders from alert_preferences where profile_id = $1',
      [profile.id],
    ),
  );
  const [sub] = await deps.db.query<{ id: string }>(
    'select id from push_subscriptions where profile_id = $1 and revoked_at is null limit 1',
    [profile.id],
  );
  return {
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      isAdmin: profile.is_admin,
    },
    alerts: {
      pushEnabled: prefs?.push_enabled ?? false,
      emailReminders: prefs?.email_reminders ?? false,
    },
    pushSubscribed: Boolean(sub),
  };
}

export async function updateDisplayName(deps: Deps, userId: string, displayName: string | null): Promise<void> {
  // The buyer role can write only display_name (column grant). is_admin is out of reach here.
  await deps.db.asRole('bb_user', userId, (q) =>
    q.query('update profiles set display_name = $2, updated_at = $3 where id = $1', [userId, displayName, deps.clock.now()]),
  );
}

interface AddressRow {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country_code: string;
}

const toAddress = (row: AddressRow): AddressView => ({
  id: row.id,
  label: row.label,
  fullName: row.full_name,
  phone: row.phone,
  line1: row.line1,
  line2: row.line2,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  countryCode: row.country_code,
});

export async function listAddresses(deps: Deps, userId: string): Promise<AddressView[]> {
  const rows = await deps.db.asRole('bb_user', userId, (q) =>
    q.query<AddressRow>(
      `select id, label, full_name, phone, line1, line2, city, state, pincode, country_code
         from addresses where deleted_at is null order by created_at`,
    ),
  );
  return rows.map(toAddress);
}

export interface AddressInput {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  countryCode: string;
}

export async function saveAddress(deps: Deps, userId: string, input: AddressInput): Promise<AddressView> {
  if (!/^\d{6}$/.test(input.pincode)) throw fail.badRequest('invalid_pincode', 'Enter a valid 6-digit pincode.');
  if (!deps.config.shippingCountries.includes(input.countryCode)) {
    throw fail.badRequest('not_serviceable', 'We do not ship to that country yet.');
  }
  const [row] = await deps.db.asRole('bb_user', userId, (q) =>
    q.query<AddressRow>(
      `insert into addresses (profile_id, label, full_name, phone, line1, line2, city, state, pincode, country_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, label, full_name, phone, line1, line2, city, state, pincode, country_code`,
      [
        userId,
        input.label,
        input.fullName,
        input.phone,
        input.line1,
        input.line2,
        input.city,
        input.state,
        input.pincode,
        input.countryCode,
      ],
    ),
  );
  return toAddress(row);
}

export async function deleteAddress(deps: Deps, userId: string, addressId: string): Promise<void> {
  // Soft delete keeps the address snapshot on any order that already used it.
  const rows = await deps.db.asRole('bb_user', userId, (q) =>
    q.query<{ id: string }>('update addresses set deleted_at = $2 where id = $1 and deleted_at is null returning id', [
      addressId,
      deps.clock.now(),
    ]),
  );
  if (rows.length === 0) throw fail.notFound('That address was not found.');
}

export async function setAlertPreferences(
  deps: Deps,
  userId: string,
  input: { pushEnabled?: boolean; emailReminders?: boolean },
): Promise<void> {
  // Email reminders go only to the address the buyer proved they own with a sign-in code.
  await deps.db.query(
    `insert into alert_preferences (profile_id, push_enabled, email_reminders, updated_at)
     values ($1, coalesce($2, false), coalesce($3, false), $4)
     on conflict (profile_id) do update set
       push_enabled = coalesce($2, alert_preferences.push_enabled),
       email_reminders = coalesce($3, alert_preferences.email_reminders),
       updated_at = $4`,
    [userId, input.pushEnabled ?? null, input.emailReminders ?? null, deps.clock.now()],
  );
}

/** Stores a browser push subscription that the user explicitly opted into. */
export async function registerPushSubscription(
  deps: Deps,
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  if (!deps.push.configured) throw fail.unavailable('push_not_configured', 'Browser alerts are not configured on this server yet.');
  let url: URL;
  try {
    url = new URL(subscription.endpoint);
  } catch {
    throw fail.badRequest('invalid_subscription', 'That browser subscription is not valid.');
  }
  if (url.protocol !== 'https:' || subscription.endpoint.length > 2048) {
    throw fail.badRequest('invalid_subscription', 'That browser subscription is not valid.');
  }
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw fail.badRequest('invalid_subscription', 'That browser subscription is missing its keys.');
  }
  const now = deps.clock.now();
  await deps.db.tx(async (q) => {
    await q.query(
      `insert into push_subscriptions (profile_id, endpoint, p256dh, auth_secret, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update set
         profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret,
         revoked_at = null`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, now],
    );
    await q.query(
      `insert into alert_preferences (profile_id, push_enabled, updated_at) values ($1, true, $2)
       on conflict (profile_id) do update set push_enabled = true, updated_at = $2`,
      [userId, now],
    );
  });
}

/** Turns off every alert the buyer has, and forgets their browser subscriptions. */
export async function unsubscribeAll(deps: Deps, userId: string): Promise<void> {
  const now = deps.clock.now();
  await deps.db.tx(async (q) => {
    await q.query('update push_subscriptions set revoked_at = $2 where profile_id = $1 and revoked_at is null', [userId, now]);
    await q.query(
      `insert into alert_preferences (profile_id, push_enabled, email_reminders, updated_at) values ($1, false, false, $2)
       on conflict (profile_id) do update set push_enabled = false, email_reminders = false, updated_at = $2`,
      [userId, now],
    );
  });
}

export async function listMyOrders(deps: Deps, userId: string): Promise<OrderSummary[]> {
  const rows = await deps.db.asRole('bb_user', userId, (q) =>
    q.query<OrderRowView>(orderSelect('order by created_at desc limit 50')),
  );
  return rows.map(toOrderSummary);
}

export async function getMyOrder(deps: Deps, userId: string, orderId: string): Promise<OrderSummary & { address: unknown }> {
  const [row] = await deps.db.asRole('bb_user', userId, (q) =>
    q.query<OrderRowView & { address: unknown }>(orderSelect('where id = $1', ', address'), [orderId]),
  );
  if (!row) throw fail.notFound('That order was not found.');
  return { ...toOrderSummary(row), address: row.address };
}

interface OrderRowView {
  id: string;
  order_no: number;
  quantity: number;
  currency: string;
  total_paise: number;
  refunded_paise: number;
  payment_status: OrderPaymentStatus;
  fulfilment_status: FulfilmentStatus;
  carrier: string | null;
  tracking_number: string | null;
  paid_at: Date | null;
  created_at: Date;
  product_snapshot: { name: string; condition: Condition };
}

function orderSelect(tail: string, extra = ''): string {
  return `select id, order_no, quantity, currency, total_paise, refunded_paise, payment_status, fulfilment_status,
                 carrier, tracking_number, paid_at, created_at, product_snapshot${extra}
            from orders ${tail}`;
}

function toOrderSummary(row: OrderRowView): OrderSummary {
  return {
    id: row.id,
    orderNo: row.order_no,
    productName: row.product_snapshot.name,
    condition: row.product_snapshot.condition,
    quantity: row.quantity,
    currency: row.currency,
    totalPaise: row.total_paise,
    refundedPaise: row.refunded_paise,
    paymentStatus: row.payment_status,
    fulfilmentStatus: row.fulfilment_status,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    paidAt: row.paid_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
