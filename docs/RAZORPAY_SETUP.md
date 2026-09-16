# Turning on real payments

This is the whole checklist for making the Subscribe button take money. It
takes about an hour, most of which is Razorpay's KYC review.

Nothing in the app needs editing: **setting `VITE_API_BASE_URL` is what
switches billing from the free development unlock to real Razorpay payments.**

---

## What happens when someone taps Subscribe

```
  App                     Your API                 Razorpay
   │                         │                        │
   │ 1. POST /create-subscription ───────────────────▶ │  creates a ₹99/month
   │                         │                        │  subscription
   │ ◀── checkout URL ───────┤                        │
   │                         │                        │
   │ 2. opens the checkout page ─────────────────────▶ │  UPI / card / wallet /
   │                         │                        │  netbanking
   │                         │ ◀── 3. POST /webhook ──┤  signed, server-to-server
   │                         │        (entitlement)   │
   │ ◀── 4. nudgeapp://payment-success ─────────────── │  back into the app
   │                         │                        │
   │ 5. GET /subscription-status ──▶ active: true     │
```

Step 4 is only a hint. **Entitlement is granted at step 3 and read at step 5** —
a deep link can be opened by anyone, so it is never trusted on its own.

Relevant code: `src/lib/billing.ts` (app), `api/` (server),
`src/lib/deeplink.ts` (the return trip).

---

## 1. Razorpay account

1. Sign up at https://razorpay.com and complete **KYC** in their dashboard —
   PAN, GST if applicable, bank account.
   **Bank details go in the Razorpay dashboard only.** Never in this repo, never
   in an environment variable, never in the app.
2. Under **Settings → Configuration → Payment Methods**, enable **UPI**, and
   specifically **UPI Autopay** — this is what makes a recurring ₹99 work in
   India. Enable cards and netbanking too; the same checkout offers all of them,
   including Paytm, GPay and PhonePe as UPI apps.
3. Under **Subscriptions → Plans**, create a plan:
   - Amount **₹99**, billing cycle **monthly**
   - Copy the **Plan ID** (`plan_…`)
4. Under **Settings → API Keys**, generate keys. Copy the **Key ID**
   (`rzp_test_…` while testing) and **Key Secret** — the secret is shown once.

## 2. Somewhere to remember who has paid

The API keeps entitlements in memory unless you give it a Redis, which means a
restart forgets your paying subscribers. Create a free database at
https://upstash.com (or any Redis with an Upstash-compatible REST API) and copy
the REST URL and token.

## 3. Deploy the API

The handlers in `api/` are plain `(req, res)` functions, so they run on Vercel
as-is, and on anything else through `api/server.ts`.

**Vercel:** push this repo, import it, and set the environment variables below
under Settings → Environment Variables.

**Any Node host:** `npm run api` (port 5060, override with `PORT`).

Environment variables on the host:

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxx        # server-side only, never in the app
RAZORPAY_PLAN_ID=plan_xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx    # you choose this in the next step
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
APP_RETURN_URL=nudgeapp://payment-success
APP_CANCEL_URL=nudgeapp://payment-cancelled
ALLOWED_ORIGINS=capacitor://localhost,http://localhost
```

## 4. Point Razorpay's webhook at it

Dashboard → **Settings → Webhooks → Add New Webhook**:

- URL: `https://<your-api>/webhook`
- Secret: any long random string — the same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `subscription.authenticated`, `subscription.activated`,
  `subscription.charged`, `subscription.halted`, `subscription.paused`,
  `subscription.resumed`, `subscription.cancelled`, `subscription.completed`

Without this, nobody is ever granted access. `/subscription-status` does ask
Razorpay directly as a safety net, but the webhook is the primary path.

## 5. Point the app at it

In `.env`:

```
VITE_API_BASE_URL=https://<your-api>
```

Rebuild (`npm run build && npx cap sync`). That is the whole switch-over: the
paywall's "developer build" banner disappears and Subscribe opens Razorpay.

---

## Testing it without spending money

Use your **test-mode** keys (`rzp_test_…`) and Razorpay's test instruments:

| Method | What to use |
| ------ | ----------- |
| UPI    | `success@razorpay` (and `failure@razorpay` to test the sad path) |
| Card   | `4111 1111 1111 1111`, any future expiry, any CVV |

Locally, without a phone:

```bash
npm run api     # terminal 1 — the subscription API
npm run dev     # terminal 2 — the app, with VITE_API_BASE_URL=http://localhost:5060
```

Test-mode webhooks need a public URL. Expose the API with a tunnel
(`cloudflared tunnel --url http://localhost:5060` or ngrok) and use that URL for
both the Razorpay webhook and `VITE_API_BASE_URL`.

Things worth checking before launch:

- [ ] Pay with `success@razorpay` → the app unlocks by itself within a few seconds
- [ ] Pay with `failure@razorpay` → the paywall stays, no entitlement granted
- [ ] Close the checkout window → paywall stays, nothing charged
- [ ] Kill the app mid-payment, reopen → "restore" finds the subscription
- [ ] Cancel from Settings → access continues to the paid-through date
- [ ] Send a webhook with a wrong signature (`curl` with a junk
      `x-razorpay-signature`) → `401`, nothing granted

---

## Before you take real money

- **Go live**: swap the test keys for live ones, and re-create the webhook on
  the live dashboard — test and live webhooks are separate.
- **Authenticate the status endpoint.** `/subscription-status` and
  `/cancel-subscription` currently trust the subscriber id in the request.
  Issue a signed token at sign-in and require it. Today the worst case is
  someone learning whether an id is subscribed, or cancelling it — neither
  grants access or moves money, but both should be closed before launch.
- **Store policy.** Razorpay is not App Store / Play compliant for in-app
  digital subscriptions. See `docs/BILLING_DECISION.md` — this flow is for
  direct Android distribution and the web.
- **Refund and cancellation terms** need to be written somewhere a customer can
  read them; Razorpay asks for a public policy URL during KYC.
