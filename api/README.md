# Nudge subscription API

A deliberately tiny server. It exists for one reason: Razorpay subscriptions
**cannot** be created or verified purely client-side — creating a subscription
and verifying webhook signatures both require the key secret, which must never
be shipped inside a mobile app bundle.

Deploy target: any Node host. The handlers are written for Vercel-style
`(req, res)` serverless functions and port easily to Express.

## Endpoints

| Method | Path                   | Purpose                                              |
| ------ | ---------------------- | ---------------------------------------------------- |
| `POST` | `/create-subscription` | Creates a Razorpay subscription, returns its pay URL |
| `POST` | `/webhook`             | Verifies Razorpay's signature, records entitlement    |
| `GET`  | `/subscription-status` | The app asks whether a device is entitled             |

## Required environment variables (set on the host, never in this repo)

```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxx      # server-side only, never in the app
RAZORPAY_PLAN_ID=plan_xxxxxxxx        # the ₹99/month plan
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx  # set when creating the webhook
APP_RETURN_URL=nudgeapp://payment-success
```

## TODO before this is production-ready

- [ ] Replace the in-memory `subscriptions` map with a real datastore. The
      current map is wiped on every cold start, so entitlements will not survive.
- [ ] Authenticate `/subscription-status`. As written, anyone who guesses a
      device id can read its status.
- [ ] Handle the full webhook event set (`subscription.charged`,
      `subscription.halted`, `subscription.cancelled`, `subscription.completed`).
- [ ] Add rate limiting on `/create-subscription`.
