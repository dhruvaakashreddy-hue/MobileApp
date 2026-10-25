-- Bizzar Buzzar core schema.
-- Run by the migration runner as the table owner. Access rules live in 0002_access.sql.
-- Amounts are integer paise. Timestamps are timestamptz (stored in UTC).

-- ── Accounts and sign-in ───────────────────────────────────────────────────────

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  -- Only the owner role changes this (npm run admin:grant). The API never writes it.
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalised check (email = lower(email))
);
create unique index profiles_email_key on profiles (email);

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts int not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index login_codes_email_idx on login_codes (email, created_at desc);

create table login_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  label text not null default 'Home' check (length(label) between 1 and 40),
  full_name text not null check (length(full_name) between 1 and 120),
  phone text not null check (phone ~ '^\+?[0-9 ]{8,16}$'),
  line1 text not null check (length(line1) between 1 and 200),
  line2 text check (line2 is null or length(line2) <= 200),
  city text not null check (length(city) between 1 and 80),
  state text not null check (length(state) between 1 and 80),
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index addresses_profile_idx on addresses (profile_id) where deleted_at is null;

create table alert_preferences (
  profile_id uuid primary key references profiles (id) on delete cascade,
  push_enabled boolean not null default false,
  email_reminders boolean not null default false,
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_failure_code int
);
create index push_subscriptions_active_idx on push_subscriptions (profile_id) where revoked_at is null;

-- ── Catalogue ──────────────────────────────────────────────────────────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (length(sku) between 1 and 60),
  name text not null check (length(name) between 1 and 160),
  description text not null default '',
  category text not null check (length(category) between 1 and 60),
  condition text not null check (condition in ('new', 'open_box', 'refurbished')),
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  warranty_text text not null,
  return_policy_text text not null,
  shipping_eligible boolean not null default true,
  shipping_fee_paise int not null default 0 check (shipping_fee_paise >= 0),
  -- Costs are nullable on purpose. NULL means "not recorded", never zero.
  procurement_cost_paise int check (procurement_cost_paise is null or procurement_cost_paise >= 0),
  shipping_cost_paise int check (shipping_cost_paise is null or shipping_cost_paise >= 0),
  other_cost_paise int check (other_cost_paise is null or other_cost_paise >= 0),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  -- SVG is only accepted from the dev seed. Uploads are raster-only (see server/routes.ts).
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  bytes bytea not null check (octet_length(bytes) between 1 and 2097152),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_media_product_idx on product_media (product_id, sort_order);

create table price_references (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  condition text not null check (condition in ('new', 'open_box', 'refurbished')),
  amount_paise int not null check (amount_paise > 0),
  source_label text not null check (length(source_label) between 1 and 160),
  source_url text,
  evidence_note text not null check (length(evidence_note) between 1 and 1000),
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index price_references_lookup_idx on price_references (product_id, condition, captured_at desc);

-- ── Sessions and drops ─────────────────────────────────────────────────────────

create table sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'paused', 'cancelled')),
  window_opens_at timestamptz not null,
  window_closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_window_order check (window_closes_at > window_opens_at)
);

create table drops (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete restrict,
  product_id uuid not null references products (id) on delete restrict,
  position int not null check (position > 0),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'paused', 'cancelled')),
  sale_price_paise int not null check (sale_price_paise > 0),
  quantity int not null default 1 check (quantity between 1 and 100),
  release_at timestamptz,
  closes_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position),
  constraint drops_window_order check (closes_at is null or (release_at is not null and closes_at > release_at)),
  constraint drops_scheduled_has_window check (
    status in ('draft', 'cancelled') or (release_at is not null and closes_at is not null)
  ),
  -- Only one drop can sell at any moment: live sale windows across all sessions may not overlap.
  constraint drops_sale_windows_never_overlap exclude using gist (
    tstzrange(release_at, closes_at, '[)') with &&
  ) where (status in ('scheduled', 'paused'))
);
create index drops_session_idx on drops (session_id, release_at);

-- ── Reservations, orders and money ─────────────────────────────────────────────

create table reservations (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references drops (id) on delete restrict,
  profile_id uuid not null references profiles (id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  status text not null check (status in ('held', 'paying', 'paid', 'expired', 'released', 'cancelled')),
  status_reason text,
  expires_at timestamptz not null,
  late_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live reservation per buyer per drop. This makes reserve requests idempotent.
create unique index reservations_one_active_per_buyer on reservations (drop_id, profile_id)
  where status in ('held', 'paying', 'paid');
create index reservations_drop_status_idx on reservations (drop_id, status);
create index reservations_profile_idx on reservations (profile_id, created_at desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity unique,
  reservation_id uuid not null unique references reservations (id) on delete restrict,
  profile_id uuid not null references profiles (id) on delete restrict,
  drop_id uuid not null references drops (id) on delete restrict,
  product_id uuid not null references products (id) on delete restrict,
  quantity int not null check (quantity > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  item_paise int not null check (item_paise >= 0),
  shipping_paise int not null check (shipping_paise >= 0),
  total_paise int not null check (total_paise = item_paise + shipping_paise),
  refunded_paise int not null default 0 check (refunded_paise >= 0 and refunded_paise <= total_paise),
  address jsonb not null,
  product_snapshot jsonb not null,
  -- Cost snapshot taken when the order is created. NULL means not recorded.
  cost_procurement_paise int,
  cost_shipping_paise int,
  cost_other_paise int,
  payment_fee_paise int,
  payment_provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  payment_status text not null default 'awaiting_payment' check (payment_status in (
    'awaiting_payment', 'paid', 'failed', 'abandoned', 'refund_pending',
    'partially_refunded', 'refunded', 'needs_review'
  )),
  fulfilment_status text not null default 'unfulfilled' check (fulfilment_status in (
    'unfulfilled', 'preparing', 'shipped', 'delivered', 'cancelled'
  )),
  carrier text,
  tracking_number text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_money_movement_has_timestamp check (payment_status not in ('paid', 'partially_refunded', 'refunded', 'refund_pending') or paid_at is not null),
  constraint orders_shipped_has_tracking check (fulfilment_status not in ('shipped', 'delivered') or tracking_number is not null)
);
create index orders_profile_idx on orders (profile_id, created_at desc);
create index orders_drop_idx on orders (drop_id);

-- Every provider webhook or verification event, stored once. Provider event IDs are unique,
-- which makes duplicate deliveries harmless.
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  provider_event_id text not null unique,
  event_type text not null,
  provider_order_id text,
  provider_payment_id text,
  amount_paise int,
  currency text,
  outcome text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_events_order_idx on payment_events (provider_order_id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  -- The provider payment being refunded. A duplicate payment is refunded by its own ID.
  provider_payment_id text not null,
  -- 'order' refunds count against the order total. 'duplicate' refunds only return an extra capture.
  kind text not null default 'order' check (kind in ('order', 'duplicate')),
  amount_paise int not null check (amount_paise > 0),
  reason text not null check (length(reason) between 1 and 300),
  status text not null default 'requested' check (status in ('requested', 'pending', 'processed', 'failed')),
  provider_refund_id text unique,
  requested_by uuid references profiles (id),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one refund in flight per payment, so a double-click cannot refund twice.
create unique index refunds_one_open_per_payment on refunds (provider_payment_id)
  where status in ('requested', 'pending');

create table reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'late_payment_after_reassignment', 'duplicate_payment', 'amount_mismatch',
    'unknown_order', 'refund_failed', 'uncertain_payment'
  )),
  status text not null default 'open' check (status in ('open', 'resolved')),
  order_id uuid references orders (id) on delete restrict,
  reservation_id uuid references reservations (id) on delete restrict,
  provider_payment_id text,
  amount_paise int,
  details jsonb not null default '{}'::jsonb,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reconciliation_cases_open_idx on reconciliation_cases (status, created_at);

create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  author_id uuid references profiles (id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- ── Alert jobs ─────────────────────────────────────────────────────────────────

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('push_alert', 'session_reminder_email')),
  -- Unique key: scheduling the same alert twice produces one job.
  dedupe_key text not null unique,
  drop_id uuid references drops (id) on delete cascade,
  session_id uuid references sessions (id) on delete cascade,
  run_at timestamptz not null,
  -- After the deadline a job expires instead of sending late. Alerts expire at release.
  deadline_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'sent', 'expired', 'failed', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_until timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index notification_jobs_due_idx on notification_jobs (run_at) where status = 'queued';

-- One row per recipient per job. Outcomes are recorded without contact details.
create table notification_deliveries (
  job_id uuid not null references notification_jobs (id) on delete cascade,
  recipient_ref uuid not null,
  status text not null check (status in ('pending', 'sent', 'failed', 'gone')),
  error_code text,
  attempted_at timestamptz not null default now(),
  primary key (job_id, recipient_ref)
);

-- ── Operations ─────────────────────────────────────────────────────────────────

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  actor_kind text not null check (actor_kind in ('admin', 'system', 'webhook')),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);

-- Page-view counts per site day and path. No IP addresses or user identifiers are stored.
create table visit_counts (
  day date not null,
  path text not null check (length(path) <= 120),
  views int not null default 0 check (views >= 0),
  primary key (day, path)
);
