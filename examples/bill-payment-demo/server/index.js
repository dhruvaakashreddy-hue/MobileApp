import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

/**
 * The payment server.
 *
 * Two things MUST happen here and never in the browser:
 *
 *  1. Creating the order. The amount is decided server-side. If the browser
 *     sent the amount, anyone could open devtools and pay ₹1 for a ₹2,000 bill.
 *  2. Verifying the signature. It is an HMAC signed with your key secret, so
 *     only a server holding that secret can check it. Without this step a user
 *     could fake a "payment succeeded" response and never pay at all.
 */

const app = express();
app.use(cors());
app.use(express.json());

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const PORT = process.env.PORT || 5055;

/**
 * The bills live on the server, with their real prices.
 *
 * This is the important bit: the client sends only a bill id. The price comes
 * from here, so the amount charged cannot be tampered with.
 */
const BILLS = {
  electricity: { id: 'electricity', label: 'Electricity bill', amountInRupees: 1840 },
  broadband: { id: 'broadband', label: 'Broadband', amountInRupees: 799 },
  mobile: { id: 'mobile', label: 'Mobile recharge', amountInRupees: 299 },
};

app.get('/api/bills', (_req, res) => {
  res.json({ bills: Object.values(BILLS), configured: Boolean(KEY_ID && KEY_SECRET) });
});

/**
 * POST /api/create-order
 *
 * Asks Razorpay to create an order and hands the browser back the order id
 * plus the PUBLIC key id. Checkout needs both. The secret never leaves here.
 */
app.post('/api/create-order', async (req, res) => {
  if (!KEY_ID || !KEY_SECRET) {
    return res.status(500).json({
      error: 'Razorpay keys are missing. Copy .env.example to .env and add your test keys.',
    });
  }

  const bill = BILLS[req.body?.billId];
  if (!bill) return res.status(400).json({ error: 'Unknown bill' });

  // Razorpay works in the smallest currency unit, so ₹1,840 is 184000 paise.
  // Sending rupees here is the classic first bug — you would charge 1/100th.
  const amountInPaise = bill.amountInRupees * 100;

  // Basic auth: "key_id:key_secret" base64-encoded. This is why the call has
  // to be server-side.
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        // Your own reference. Useful when reconciling later.
        receipt: `bill_${bill.id}_${Date.now()}`,
        notes: { billId: bill.id, billLabel: bill.label },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: 'Razorpay rejected the order', detail });
    }

    const order = await response.json();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID, // public key — safe to send
      bill,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not reach Razorpay', detail: String(err) });
  }
});

/**
 * POST /api/verify-payment
 *
 * Checkout hands the browser three values after a successful payment. They
 * prove nothing on their own — the browser could invent them. This recomputes
 * the signature with the key secret and compares.
 *
 * The formula is fixed by Razorpay:
 *     HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
app.post('/api/verify-payment', (req, res) => {
  if (!KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay key secret is missing.' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: 'Missing payment fields' });
  }

  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  // Constant-time compare. A plain === leaks, through timing, how much of the
  // signature was correct, which is enough to guess it byte by byte.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(razorpay_signature), 'utf8');
  const verified = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!verified) {
    return res.status(400).json({ verified: false, error: 'Signature did not match' });
  }

  // Only now is the payment real. This is where you would mark the bill paid
  // in your database, send a receipt, and so on.
  console.log(`✅ verified payment ${razorpay_payment_id} for order ${razorpay_order_id}`);

  res.json({ verified: true, paymentId: razorpay_payment_id });
});

app.listen(PORT, () => {
  console.log(`payment server listening on http://localhost:${PORT}`);
  if (!KEY_ID || !KEY_SECRET) {
    console.warn('⚠️  No Razorpay keys found — copy .env.example to .env and add your test keys.');
  }
});
