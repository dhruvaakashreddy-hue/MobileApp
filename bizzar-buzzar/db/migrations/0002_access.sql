-- Roles, public views and row-level security.
--
-- The API connects as the owner role and runs writes there, with the checks in code.
-- Read paths for visitors and signed-in buyers switch to the restricted roles below
-- (SET LOCAL ROLE), so PostgreSQL itself hides what each caller may not see, even if
-- application code has a bug.
--
-- The reveal rules live here as well as in code: a product or price is not visible
-- before its release time, and a drop is not visible before its reveal window.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bb_anon') then
    create role bb_anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'bb_user') then
    create role bb_user nologin;
  end if;
end
$$;

-- Lets the migrating role switch into the restricted roles.
grant bb_anon, bb_user to current_user;
grant usage on schema public to bb_anon, bb_user;

create or replace function app_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

grant execute on function app_user_id() to bb_anon, bb_user;

-- Supabase exposes the public schema through PostgREST to anon and authenticated.
-- Remove that access here. Keep RLS enabled on any table you add later.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end
$$;

-- ── Public views: visitors and buyers read the catalogue only through these ────

create or replace view public_sessions as
select id, name, status, window_opens_at, window_closes_at
from sessions
where status in ('scheduled', 'paused');

-- A drop is visible from 30 seconds before release (the reveal countdown).
-- Product and price are withheld until the release moment.
create or replace view public_drops as
select
  d.id,
  d.session_id,
  d.position,
  d.status,
  d.quantity,
  d.release_at,
  d.closes_at,
  case when d.release_at <= now() then d.product_id end as product_id,
  case when d.release_at <= now() then d.sale_price_paise end as sale_price_paise
from drops d
where d.status in ('scheduled', 'paused')
  and d.release_at <= now() + interval '30 seconds';

create or replace view public_products as
select
  p.id, p.name, p.description, p.category, p.condition, p.specs,
  p.warranty_text, p.return_policy_text, p.shipping_eligible, p.shipping_fee_paise
from products p
where exists (
  select 1
  from drops d
  where d.product_id = p.id
    and d.status in ('scheduled', 'paused')
    and d.release_at <= now()
);

create or replace view public_price_references as
select r.id, r.product_id, r.condition, r.amount_paise, r.source_label, r.captured_at
from price_references r
where exists (
  select 1
  from drops d
  where d.product_id = r.product_id
    and d.status in ('scheduled', 'paused')
    and d.release_at <= now()
);

grant select on public_sessions, public_drops, public_products, public_price_references
  to bb_anon, bb_user;

-- ── Buyer-owned rows ───────────────────────────────────────────────────────────

alter table profiles enable row level security;
create policy profiles_self_select on profiles
  for select to bb_user using (id = app_user_id());
create policy profiles_self_update on profiles
  for update to bb_user using (id = app_user_id()) with check (id = app_user_id());
grant select on profiles to bb_user;
-- Column-level grant: a buyer can edit their display name. is_admin is not writable.
grant update (display_name, updated_at) on profiles to bb_user;

alter table addresses enable row level security;
create policy addresses_owner on addresses
  for all to bb_user using (profile_id = app_user_id()) with check (profile_id = app_user_id());
grant select, insert, update, delete on addresses to bb_user;

alter table alert_preferences enable row level security;
create policy alert_preferences_owner on alert_preferences
  for select to bb_user using (profile_id = app_user_id());
grant select on alert_preferences to bb_user;

alter table push_subscriptions enable row level security;
create policy push_subscriptions_owner on push_subscriptions
  for select to bb_user using (profile_id = app_user_id());
-- Endpoint and keys are secrets for the push service, so they are not readable by buyers.
grant select (id, profile_id, created_at, revoked_at) on push_subscriptions to bb_user;

alter table reservations enable row level security;
create policy reservations_owner_select on reservations
  for select to bb_user using (profile_id = app_user_id());
grant select (
  id, drop_id, profile_id, quantity, status, status_reason, expires_at,
  late_accepted, created_at, updated_at
) on reservations to bb_user;

alter table orders enable row level security;
create policy orders_owner_select on orders
  for select to bb_user using (profile_id = app_user_id());
-- Cost snapshots, provider IDs and fee data are not readable by buyers.
grant select (
  id, order_no, reservation_id, profile_id, drop_id, product_id, quantity, currency,
  item_paise, shipping_paise, total_paise, refunded_paise, address, product_snapshot,
  payment_status, fulfilment_status, carrier, tracking_number, paid_at, created_at, updated_at
) on orders to bb_user;

-- Tables with no grant to bb_anon or bb_user: login_codes, login_sessions, order_notes,
-- refunds, reconciliation_cases, payment_events, notification_jobs, notification_deliveries,
-- audit_log, visit_counts, product_media and the base products, drops and sessions tables.
