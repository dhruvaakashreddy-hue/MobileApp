# Bizzar Buzzar

Surprise product drops at unusually low prices. One unit per drop, one buyer per unit,
and each product stays a mystery until its release. Built for India (INR, en-IN,
Asia/Kolkata), with the currency, locale, time zone, shipping countries and payment
adapter all configurable.

This folder is a separate app inside the `MobileApp` repository. The Nudge app in the
repository root is untouched.

![Desktop, concept preview: reveal countdown](docs/screenshots/concept-desktop-reveal.png)

---

## Status at a glance

| Area | State |
| --- | --- |
| Visual system and every public state (waiting, reveal, live, held, reserved, sold, ended, session ended, paused) | Built. Verified in Chromium at 1440 and 390 widths. |
| Checkout, reservation hold, server-calculated totals | Built and tested against Postgres 16. |
| Payments (Razorpay, test mode) | Built behind a payment adapter. Signatures and the webhook path are tested with a fake provider. **Not run against live Razorpay.** |
| Email sign-in (one-time codes) | Built. Locally it writes to `.data/outbox`. Production needs an email provider. |
| Browser alerts (Web Push) | Built: permission flow, subscriptions, service worker, dispatch with dedupe and deadlines. **Not verified on real devices**, and needs VAPID keys. |
| Admin: products, evidence, sessions, drops, pause, cancel, orders, refunds, notes, jobs, cases, audit, analytics | Built. Admin endpoints are tested for authorisation. Admin screens were driven in Chromium. |
| Scheduler | `npm run worker` (long-running). A cron tick endpoint also exists. See "Scheduler". |
| Automated tests | 88 pass: 23 pure domain tests and 65 database tests against real Postgres. |
| Legal and policy copy | **Draft.** Flagged in the UI until the owner completes it. |
| Production hosting, credentials, product photography | **Not configured.** See "Remaining setup". |

---

## Architecture

| Need in the brief | What this app uses | Why |
| --- | --- | --- |
| Frontend | Vite, React 19, TypeScript, Tailwind v4, react-router | Preserves the stack already in this repository. |
| API | Web-standard `Request`/`Response` handlers under `api/`, one router in `server/` | Same convention as the repo's `api/` functions. Runs on Vercel and in the local dev server. |
| Database | PostgreSQL with transactions, exclusion constraints and row-level security | Inventory and money need relational transactions. Upstash Redis, the repo's current store, cannot express the sale-window and reservation invariants without re-building them by hand. |
| Auth | Email one-time codes, hashed, with attempt caps and server-side sessions | The brief's Supabase Auth is not used because the backend is plain Postgres. The same flow can move to Supabase Auth later. |
| Real-time | Server-authoritative polling, refetch on focus, resume and reconnect | Simpler and more robust on serverless hosting than long-lived streams. The brief allows equivalent streaming. |
| Scheduling | A worker process that claims due jobs with `FOR UPDATE SKIP LOCKED` | A browser timer or a sleeping request is not a scheduler. |
| Payments | Adapter interface. Razorpay REST implementation. Fake adapter for tests only | Keeps the provider out of the domain logic. |
| Media | Product images stored in Postgres (`bytea`, 2 MB limit) and served only after release | Avoids a second storage system for a small catalogue. Move to object storage when volume grows. |

### Invariants and where they live

- **One unit, one buyer.** `createReservation` locks the drop row (`SELECT … FOR UPDATE`), then
  counts active holds. A partial unique index also allows only one live reservation per buyer
  per drop. Tested with six concurrent buyers: exactly one wins.
- **Sale windows never overlap across sessions.** An exclusion constraint on
  `tstzrange(release_at, closes_at)` in `db/migrations/0001_schema.sql`. Within a session,
  the 5 to 30 minute gap rule is checked by `shared/schedule.ts` and enforced on save.
- **Reveal and release follow the server clock.** The reveal window is also enforced in SQL:
  the `public_drops` view shows a drop only from 30 seconds before release, and `product_id`
  and `sale_price_paise` are null until release. The browser's clock only displays countdowns.
- **Hidden products do not leak.** Visitors read only the views. The `bb_anon` role has no
  grant on `products`, `drops` or `price_references`. Tests check the HTTP responses, the
  views, and the image URLs.
- **A client success callback never marks an order paid.** The browser's signature is verified
  with HMAC, and then the provider confirms the capture. Webhooks are verified against the raw
  body. Event IDs are recorded once.
- **Late payments never sell a unit twice.** A capture for a recycled reservation is accepted
  only if the unit is still free and the sale is open. Otherwise it is refunded and a
  reconciliation case is opened. A second capture on a paid order is refunded.
- **Expired holds are released safely.** Holds without a payment in flight expire at the
  deadline. A checkout with a payment in flight is not recycled until the provider has been
  asked and a grace period has passed.
- **Money is integer paise,** computed on the server from the database. Margin treats a missing
  cost as missing, never as zero.

### Access control

- Buyers never talk to the database directly. The API connects as the owner role. The public
  catalogue and most buyer reads (profile, addresses, orders, alert settings) run inside a
  transaction that switches to `bb_anon` or `bb_user` (`SET LOCAL ROLE`), so PostgreSQL enforces
  visibility. Reservation and payment paths run as the owner, with explicit checks on every row.
- `bb_user` sees only its own addresses, reservations, orders and alert settings
  (row-level security with `app.user_id`). It cannot read cost snapshots, provider IDs, push
  endpoints or keys, and it cannot write `profiles.is_admin`.
- Administrator access is `profiles.is_admin`, granted only by `npm run admin:grant`. No API
  path writes it. Every admin endpoint checks it on the server. The browser guard is only for
  usability.
- Writes from another origin are refused. Bodies must be JSON, which a cross-site form cannot send.

---

## Quick start (local)

Prerequisites: Node 22.18 or later (the tests and scripts run TypeScript directly), and PostgreSQL 14 or later (tested on 16).

```bash
cd bizzar-buzzar
npm install

# Local configuration. .env is gitignored.
cp .env.example .env
# Set DATABASE_URL to a database you can reset, and BB_APP_SECRET to any 32+ characters.

npm run db:reset      # drops the public schema and applies db/migrations
npm run db:seed       # sample products, price evidence and drops around "now"
npm run dev           # http://localhost:5173 (the API is mounted at /api)
```

Sign in as the seeded administrator (`admin@example.com`, or `SEED_ADMIN_EMAIL`). The
six-digit code is written to `.data/outbox/`. Open the newest file. The administrator is
at `/admin`.

Development previews: append `?preview=<state>` to any page in `npm run dev`. The states are
`waiting`, `reveal`, `live`, `reserved`, `held`, `sold`, `ended`, `session-ended` and `paused`.
The preview uses sample data and is labelled as such. Its controls are not in production builds.

### Running tests

```bash
export TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/bizzar_test
npm test
```

The database tests drop and recreate the `public` schema in that database for each test file.
Use a database that holds nothing you care about. Without `TEST_DATABASE_URL` the database tests
are skipped and the output says so. Typecheck with `npm run typecheck`, and build with `npm run build`.

What the tests cover:

- Pure rules: phases at the 30 second boundary, session state, 5 to 30 minute gaps, overlaps,
  integer money, savings only with evidence, margin with missing costs.
- Reservations: six concurrent buyers for one unit, idempotent reserve, hold length from the
  server clock, a hold that ends at sale close, expiry then reuse, release, phase refusals,
  and a lapsed hold that is not handed back.
- Payments: server-calculated amount, verified webhook, tampered body rejected, duplicate
  redelivery, concurrent deliveries applied once, failed and mismatched amounts, a checkout
  callback that needs provider confirmation, duplicate captures refunded, grace-period capture,
  late capture before and after reassignment, and refund webhooks applied once.
- Access: visitors cannot read base tables; a drop is visible at 29 seconds and not at 31
  seconds before release; products and prices appear only at release; buyers see only their own
  orders, addresses and push endpoints; buyers cannot set `is_admin`; no product name, ID or
  price appears in waiting or reveal responses; unreleased image URLs return 404 even with a
  valid signature; administrator endpoints refuse anonymous and buyer requests; cross-site writes
  are refused; sign-in codes cool down, lock after five wrong guesses, and expire.
- Administration and alerts: schedule gaps and overlaps refused with nothing written; a draft
  session cannot be scheduled; drops lock once their reveal starts; pause and cancel behave as
  stated; alerts are queued at release minus 30 seconds, sent once to opted-in browsers, expired
  after release, retried only for the browser that failed, and revoked when the push service says
  the browser is gone; alert records hold counts, not contact details.

---

## Scheduler

Two processes are needed in production:

1. **The web app** (`api/`), which serves requests and runs no timers.
2. **The worker** (`npm run worker`), a long-running process that every
   `BB_WORKER_INTERVAL_MS` (default 5000) sweeps expired holds, reconciles checkouts in
   flight, retries refunds that were interrupted, and dispatches due alerts.

All state lives in Postgres, so a restart or crash loses nothing. A stopped worker only
delays work, and an alert past its deadline expires instead of arriving late.

If the worker cannot run, `POST` or `GET /api/jobs/tick` with
`Authorization: Bearer $BB_CRON_SECRET` runs one tick. Most platform cron schedules run once per
minute or less. Alerts need a 30 second lead, so use the worker. Use the tick endpoint only as a
fallback for holds and refunds.

Alert timing: a push is queued at `release − 30 s` and expires at release. Browsers and push
services can delay delivery, so the copy never promises second-accurate delivery.

---

## Payments (Razorpay)

The app needs test keys before checkout works.

1. In the Razorpay dashboard (test mode), create an API key. Keys start with `rzp_test_`.
2. Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in the environment.
   Keep `BB_PAYMENT_MODE=test`. The config refuses a key whose prefix does not match the mode.
3. Create a webhook pointing at `https://YOUR_DOMAIN/api/webhooks/razorpay`, with the same
   secret. Enable `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and
   `refund.failed`.
4. Checkout loads Razorpay's script only on the checkout screen, with the order ID the server
   created.

Going live: switch to `BB_PAYMENT_MODE=live` and `rzp_live_` keys only after the owner has
completed Razorpay KYC and tested the full path (order, capture, webhook, refund) in test mode.

Refunds: admins request them from an order. The refund is recorded before the provider is called,
and only one refund per payment can be open at a time. `refund.processed` marks it done once.
Refunds stuck in `pending` for ten minutes open a reconciliation case, so a person checks the
provider dashboard.

Payment cases: the admin Operations screen lists late payments after reassignment, duplicate
payments, amount mismatches, unknown orders, refund failures and uncertain payments.

---

## Alerts (Web Push)

Generate a VAPID key pair with the `web-push` package (`npx web-push generate-vapid-keys`) and set
`BB_VAPID_PUBLIC_KEY`, `BB_VAPID_PRIVATE_KEY` and `BB_VAPID_SUBJECT` (a `mailto:` address).
Without them, "Turn on browser alerts" says alerts are not configured.

The browser asks for notification permission only when the buyer presses "Turn on browser alerts".
Denied permission and unsupported browsers both get a plain explanation. Email reminders are a
separate, optional setting. They are for session reminders, not the 30 second alert.

---

## Deployment

### Database

1. Create a PostgreSQL 14+ database (Supabase, Neon, RDS or self-hosted). Use a role that can
   create roles, because migration 0002 creates `bb_anon` and `bb_user`.
2. Run `DATABASE_URL=… npm run db:migrate`. Migrations are forward-only and each runs once. A
   deploy lock stops two migrations running together.
3. If you use Supabase, migration 0002 revokes `anon` and `authenticated` access to every table in
   the public schema, so PostgREST cannot expose them. Tables you add later need the same care.
   Enable row-level security on any table you expose.
4. Do not run `db:seed` against production. It refuses when `NODE_ENV=production`.

### Web app (Vercel)

1. Import this repository. Set **Root Directory** to `bizzar-buzzar`.
2. Set the environment variables from `.env.example`. Production requires `DATABASE_URL`, a
   `BB_APP_SECRET` of 32+ characters, `BB_CRON_SECRET` (32+ characters, if you use the tick), and
   `EMAIL_PROVIDER=resend` with `RESEND_API_KEY`. `dev-outbox` is refused in production.
3. Set `BB_PUBLIC_ORIGIN` to the public https URL. Cookies are `Secure` only when this is https.
4. `vercel.json` rewrites non-API paths to `index.html` and sets function limits. Admin routes
   are under `/admin` and are disallowed in `public/robots.txt`.

### Worker

Run `npm run worker` as a long-lived service with the same environment (for example Railway,
Fly.io, Render, or a small VM). It needs only `DATABASE_URL` and the payment, email and VAPID
settings.

### Build check

`npm run typecheck && npm run build && npm test` passes in this repository. Run it before each release.

---

## Rollback

- **Web app:** redeploy the previous Vercel deployment. The API and the frontend ship together, so
  roll back both.
- **Worker:** stop the service or redeploy the previous image. Queued jobs persist and resume.
- **Database:** migrations are forward-only. To undo a change, write a new migration. For data
  problems, restore from a point-in-time backup of the database.
- **Stopping sales:** pause the session (every drop in it pauses, and holds run to their end),
  or cancel a drop and choose what happens to paid orders. Either action is audited.
- **Stopping payments:** set `BB_PAYMENT_MODE=test` and remove the live keys. Checkout then refuses
  with "Payments are not configured". Pending orders are kept for reconciliation.

---

## Remaining setup

These are the items this build does not include. Each one needs a credential, a decision, or
content that only the owner can supply.

1. **Razorpay:** KYC, test keys and webhook, then live keys after testing. (`RAZORPAY_*`,
   `BB_PAYMENT_MODE`)
2. **Email provider:** a Resend account, a verified sending domain, and `RESEND_API_KEY`.
3. **Browser alerts:** VAPID keys (`BB_VAPID_*`). Then test on real Android Chrome and desktop
   Chrome, Firefox and Safari. iOS Safari needs the site added to the home screen before it can
   show web push.
4. **Production database** with backups, and `BB_APP_SECRET` and `BB_CRON_SECRET` generated with a
   CSPRNG.
5. **Worker host** running `npm run worker`, with a restart policy and alerting on crashes.
6. **Legal copy:** complete every bracketed item in `src/pages/Legal.tsx` (business name, address,
   GSTIN, returns window, refund timelines, grievance contact, retention period), then set
   `LEGAL_COPY_IS_DRAFT` in `src/lib/legal.ts` to `false`.
7. **Product content:** licensed or original product photography (the sample art is generated),
   real warranty and return terms, procurement and shipping costs, and reference-price evidence
   with a source link and a note for each product. Without evidence, no savings are shown.
8. **Shared rate limits.** The current limiter counts per process. Multi-instance hosting needs a
   shared store (for example Upstash or Postgres-backed counters).
9. **Optional bot protection** such as Cloudflare Turnstile on sign-in and checkout. Not included.
10. **Monitoring:** error tracking for the API and the worker, and an uptime check on
    `/api/config`.
11. **Mockups.** No concept images were attached to the request, so the visual direction follows the
    written tokens and layout. Share the desktop and mobile images to compare them against
    `docs/screenshots/`.

## Known limits

- Real-time updates are polled (every 1 to 30 seconds, depending on phase). They refresh on focus,
  resume and reconnect, and at the release moment. They are not pushed.
- Payments have been tested only against a fake provider and real HMAC signatures. The Razorpay
  REST calls are implemented but have not been called against Razorpay.
- Product images are capped at 2 MB and stored in Postgres.
- Amounts are rupees and paise only. Tax handling is the owner's decision, and the price copy says
  so.
- The admin "preview" shows the schedule rules and gap checks. It does not render a buyer preview
  of each drop.
- The concept preview is labelled and compiled out of production builds unless
  `VITE_BB_PREVIEW=true`.

## Layout

```
api/[...path].ts          Vercel entry for /api (delegates to server/handler.ts)
db/migrations/            0001 schema and invariants; 0002 roles, views and RLS
server/                   config, DB client, routes, services, payment and push adapters
  services/               catalogue, reservations, payments, jobs, admin, account, auth
shared/                   pure domain rules and API types used by server and browser
scripts/                  migrate, reset, seed, grant-admin, worker
src/                      React app: buyer pages, checkout, alerts, admin, preview
public/                   service worker, favicon, generated sample artwork, robots.txt
tests/                    domain and database tests (node:test)
docs/screenshots/         captures from the final build
```
