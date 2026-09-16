# Bill payment demo — UPI / Card / Wallet with Razorpay

A small, complete example of the flow you asked for:

**reminder → Pay now → choose UPI / Card / Wallet → Razorpay checkout → "Payment successful"**

It is self-contained. Nothing here depends on the Nudge app in the rest of this
repository — copy the folder anywhere you like.

---

## Run it in VS Code

### 1. Open the folder

VS Code → **File → Open Folder…** → pick `bill-payment-demo`.

Open a terminal inside VS Code with **Ctrl + `** (backtick), or **Terminal → New
Terminal**. Every command below goes in that terminal.

### 2. Install

```bash
npm install
```

### 3. Get your Razorpay test keys

1. Sign up at [razorpay.com](https://razorpay.com) (free, no KYC needed for test mode).
2. In the dashboard, switch the toggle to **Test Mode** — top of the screen.
3. **Settings → API Keys → Generate Test Key**.
4. You get a **Key ID** (`rzp_test_…`) and a **Key Secret**. Copy both now; the
   secret is shown only once.

Test mode never moves real money.

### 4. Add the keys

```bash
cp .env.example .env
```

Open `.env` in VS Code and paste your two keys:

```
RAZORPAY_KEY_ID=rzp_test_your_key_here
RAZORPAY_KEY_SECRET=your_secret_here
PORT=5055
```

`.env` is gitignored. **Never commit the secret** — anyone who has it can create
and refund payments on your account.

### 5. Start it

```bash
npm run dev
```

That runs two things at once: the payment server on `:5055` and the web app on
`:5173`. Open **http://localhost:5173**.

### 6. Pay a bill

Tap **Pay now** → pick **UPI** → Razorpay opens. In test mode use:

| What | Value |
| --- | --- |
| UPI ID | `success@razorpay` |
| Card | `4111 1111 1111 1111`, any future expiry, any CVV |
| Failure card | `4000 0000 0000 0002` |

You should land on the green success screen.

---

## What each file does

```
server/index.js      the payment server — creates orders, verifies signatures
src/App.tsx          the reminder list and the flow between screens
src/payment.ts       create order → open checkout → verify
src/razorpay.ts      loads Razorpay's checkout.js
src/components/
  MethodSheet.tsx    the UPI / Card / Wallet sheet
  SuccessScreen.tsx  the "Payment successful" screen
```

### The flow, step by step

```
 [Pay now]                     App.tsx        opens the sheet
     │
     ▼
 [UPI / Card / Wallet]         MethodSheet    user picks one
     │
     ▼
 POST /api/create-order        server         decides the amount, asks Razorpay
     │                                         for an order, returns order_id
     ▼
 Razorpay Checkout opens       payment.ts     user actually pays
     │
     ▼
 handler(response)             payment.ts     gets payment_id, order_id, signature
     │
     ▼
 POST /api/verify-payment      server         recomputes the HMAC and compares
     │
     ▼
 "Payment successful"          SuccessScreen  only reached if the server said yes
```

---

## The three things that matter

Everything else is presentation. These three are where payment integrations go
wrong, and all three are the reason there is a server at all.

### 1. The browser never sends the amount

Look at what the client posts:

```js
body: JSON.stringify({ billId })   // a bill id. That is all.
```

The server looks the price up itself:

```js
const bill = BILLS[req.body?.billId];
const amountInPaise = bill.amountInRupees * 100;
```

If the browser sent the amount, anyone could open devtools and pay ₹1 for a
₹1,840 bill. Let the server decide the price, always.

### 2. The key secret never leaves the server

The **Key ID** goes to the browser — Checkout needs it, and it is public. The
**Key Secret** stays on the server, where it signs the API call:

```js
const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
```

If you ever find yourself importing the secret into a `.tsx` file, stop. It ends
up in the JavaScript bundle, which anyone can read.

### 3. Success is what the server says, not what the browser says

This is the one people skip. Razorpay's `handler` fires in the browser, so its
three values prove nothing on their own — a determined user can call that
function themselves with made-up values.

So the handler does **not** show the success screen. It asks the server first:

```js
handler: (response) => {
  verifyPayment(response).then(onSuccess).catch(onFailure);
}
```

And the server recomputes the signature with the secret:

```js
const expected = crypto
  .createHmac('sha256', KEY_SECRET)
  .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  .digest('hex');
```

That formula is fixed by Razorpay: `order_id | payment_id`, HMAC-SHA256, keyed
with your secret. If it does not match what the browser sent, the payment is not
real. The comparison uses `crypto.timingSafeEqual` rather than `===`, because a
plain comparison leaks through timing how much of the signature was right, which
is enough to guess it byte by byte.

### Opening straight into UPI

Razorpay's own sheet normally shows every method. `config.display` narrows it to
the one the user already picked:

```js
config: {
  display: {
    blocks: { chosen: { name: 'Pay by UPI', instruments: [{ method: 'upi' }] } },
    sequence: ['block.chosen'],
    preferences: { show_default_blocks: false },
  },
}
```

`show_default_blocks: false` means "show only my block". Remove that line if you
would rather show everything with the chosen method first.

---

## Two bugs worth avoiding

**Amounts are in paise.** `₹1,840` is `184000`. Send `1840` and you charge
₹18.40. This is the single most common first-timer bug.

**A closed window is not a failure.** Three different things can end a payment,
and they are separate callbacks:

| What happened | Callback |
| --- | --- |
| Paid | `handler` |
| Card declined, UPI timed out | `rzp.on('payment.failed')` |
| User closed the window | `modal.ondismiss` |

Treat a dismissal as "nothing happened", not as an error.

---

## Before you take real money

- [ ] Store orders and payments in a database. This demo keeps bills in a
      constant and remembers nothing, so it cannot tell you what was paid.
- [ ] Add a **webhook** (`payment.captured`). If the user closes the app right
      after paying, the verify call never happens — the webhook is how you find
      out anyway. Verify its signature with your webhook secret, which is a
      different secret from the API one.
- [ ] Make verification **idempotent**, so the same payment landing twice (once
      from the browser, once from the webhook) does not double-credit the bill.
- [ ] Complete KYC in the Razorpay dashboard to switch out of test mode. Bank
      details go in the dashboard only, never in code.
- [ ] Put the server somewhere real and point the client at it instead of the
      Vite proxy.

If you ship this inside an **Android or iOS app**, note that Apple and Google
require *their* in-app purchase billing for digital goods. A utility bill is a
real-world service, so Razorpay is allowed — but a subscription to your app
itself is not.
