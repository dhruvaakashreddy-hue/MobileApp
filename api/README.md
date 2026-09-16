# Nudge subscription API

A deliberately tiny server. It exists for one reason: Razorpay subscriptions
**cannot** be created or verified purely client-side — creating a subscription
and verifying webhook signatures both require the key secret, which must never
be shipped inside a mobile app bundle.

The handlers are host-agnostic `(req, res)` functions: they deploy to Vercel
unchanged, and `api/server.ts` runs the same files on plain Node.

```bash
npm run api    # http://localhost:5060
```

Full walkthrough, including Razorpay setup and test cards: **`docs/RAZORPAY_SETUP.md`**.

## Endpoints

| Method | Path                   | Purpose                                                |
| ------ | ---------------------- | ------------------------------------------------------ |
| `POST` | `/create-subscription` | Creates a Razorpay subscription, returns a checkout URL |
| `GET`  | `/checkout`            | The page that opens Razorpay Checkout and returns to the app |
| `POST` | `/webhook`             | Verifies Razorpay's signature, records entitlement       |
| `GET`  | `/subscription-status` | The app asks whether a subscriber is entitled            |
| `POST` | `/cancel-subscription` | Cancels at the end of the paid cycle                     |

## Who is allowed to grant access

Only `/webhook`, and only after the HMAC signature over the raw request body
matches `RAZORPAY_WEBHOOK_SECRET`. The `nudgeapp://payment-success` deep link
is a UI hint — anyone can open a URL — and the app treats it as nothing more
than a cue to re-ask `/subscription-status`.

`/subscription-status` will ask Razorpay directly when it finds no active
record for a subscriber who has one on file. That covers a missed webhook, a
webhook still in flight in the seconds after payment, and a wiped in-memory
store — all of which would otherwise lock out someone who has paid.

## Required environment variables (set on the host, never in this repo)

```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxx      # server-side only, never in the app
RAZORPAY_PLAN_ID=plan_xxxxxxxx        # the ₹99/month plan
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx  # set when creating the webhook
APP_RETURN_URL=nudgeapp://payment-success
APP_CANCEL_URL=nudgeapp://payment-cancelled
```

Strongly recommended:

```
UPSTASH_REDIS_REST_URL=...            # without these the store is in-memory
UPSTASH_REDIS_REST_TOKEN=...          # and a restart forgets who has paid
ALLOWED_ORIGINS=capacitor://localhost,http://localhost
PUBLIC_API_BASE_URL=https://...       # only if the request host is wrong
```

## Tests

`npm test` covers the parts that matter most here: webhook signature
verification (including a body altered after signing), the entitlement
transitions each event causes, and the injection guards on the checkout page.

## Still to do before production

- [ ] **Authenticate `/subscription-status` and `/cancel-subscription`.** They
      trust the subscriber id in the request. Issue a signed token at sign-in
      and require it. Today's worst case is someone learning whether an id is
      subscribed, or cancelling it — neither grants access nor moves money.
- [ ] Rate-limit `/create-subscription`, which reaches Razorpay on every call.
- [ ] Keep a record of payments for support and reconciliation; this store
      keeps only current entitlement.
