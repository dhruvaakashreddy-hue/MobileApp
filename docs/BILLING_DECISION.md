# Decision needed: how to charge for the ₹99/month subscription

**Status: open, and now urgent.**

Nudge is a hard-paywalled app: sign in, subscribe, and only then does anything
work. That makes this decision blocking rather than academic — there is no free
tier to fall back on if a store rejects the build, so getting it wrong means
having no shippable product at all.

The build prompt specified Razorpay. Razorpay is genuinely the right rail for
₹99/month in India (UPI Autopay and eNACH make small recurring amounts viable in
a way card-only processors do not). The problem is not Razorpay — it is where
the unlock happens.

## The constraint

Both stores require their own billing for digital content unlocked inside the
app:

- **Apple** — App Store Review Guideline 3.1.1: digital content used within the
  app must be bought via in-app purchase.
- **Google** — Play Billing policy: the same, for in-app digital goods.

Nudge is now the strongest possible case for this rule: the *entire app* is
behind a ₹99/month subscription. Shipping Razorpay checkout in a store build is
close to a guaranteed rejection on iOS and a policy violation on Play — Apple in
particular rejects apps whose only path to any functionality is a non-IAP
payment.

## The two honest options

### Option A — RevenueCat + native billing (store-compliant)

Use StoreKit (iOS) and Play Billing (Android) through RevenueCat, and offer
Razorpay only on a companion website.

- ✅ Ships on both stores; the normal distribution route.
- ✅ RevenueCat handles receipt validation, renewals and restore across
  platforms, which is a meaningful amount of work you don't write.
- ❌ Apple and Google take 15–30%. On ₹99 that is roughly ₹15–30 per subscriber
  per month.
- ❌ No UPI Autopay. Indian users pay through their store account, which has
  measurably worse conversion at this price point.
- ❌ Store pricing tiers, so ₹99 may become ₹99-ish rather than exactly ₹99.

### Option B — Android-only, distributed directly (Razorpay-native)

Ship the APK from your own website, skip both stores for now.

- ✅ Razorpay works as intended: UPI Autopay, full ₹99, best conversion.
- ✅ No store review, ship whenever you like.
- ❌ No iOS at all. That is roughly half the market, and this app is built for
  both.
- ❌ You do your own distribution, updates and install-trust work; users must
  allow installs from unknown sources.
- ❌ Play Protect warnings on sideloaded APKs will cost you some installs.

## What the code does about it in the meantime

`src/lib/billing.ts` is written against a `BillingProvider` interface, so this
decision is a swap of one constant rather than a rewrite:

```ts
export const activeProvider: BillingProvider = stubProvider;
```

- `stubProvider` — what ships today. Grants a 30-day local entitlement, charges
  nothing. **Must not go to production.**
- `razorpayProvider` — written, not wired. Needs `api/` deployed and the
  environment variables from `api/README.md`.
- A RevenueCat provider — not written; it is the Option A path, and I did not
  want to build it against a decision you may not make.

No screen reads the provider directly, so nothing else has to change.

## My read, if you want one

**Option A**, and more firmly than before. A hard paywall removes the middle
ground: with no free tier, a rejection is not a setback, it is the end of that
distribution channel. Take the 15–30% and use Razorpay on a web checkout later,
once you have the audience to make splitting the flow worthwhile.

Choose **Option B** only to validate the idea among people you can reach
directly, and treat it as a pre-launch rather than a launch.

## Worth reconsidering: the hard paywall itself

Not a blocker, but it should be a deliberate choice rather than a default.
Asking for ₹99/month before anyone has felt a single nudge is the hardest sell
in consumer apps — the usual pattern is a few days free precisely because people
need to feel the product work before a price means anything. If conversion
disappoints after launch, this is the first thing to change, and the code is
ready for it: the gate is one condition in `src/App.tsx` (`needsSubscription`),
so a trial is a matter of letting it pass while a trial window is open.
