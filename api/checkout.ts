/**
 * GET /checkout?subscriptionId=sub_xxx&contact=+91...&name=...&email=...
 *
 * The page the app opens when Subscribe is tapped. It loads Razorpay Checkout,
 * which is what actually offers UPI (GPay / PhonePe / Paytm / any UPI app),
 * cards, netbanking and wallets, and then sends the customer back into the app
 * through the `nudgeapp://` deep link.
 *
 * Why serve our own page instead of Razorpay's hosted `short_url`? The hosted
 * page has no way to return to a mobile app when payment finishes — it ends on
 * Razorpay's own success screen. This page can, because it controls the
 * `handler` callback.
 *
 * Only the PUBLISHABLE key id is embedded here. That is by design: it is the
 * same value every Razorpay checkout exposes in its page source. The key
 * secret is never sent to a browser.
 */

import {
  escapeHtml, handledPreflight, jsonForScript, queryParam, sendHtml,
  type ApiRequest, type ApiResponse,
} from './_http.ts';
import { entitlementStore } from './_store.ts';
import { readConfig } from './_razorpay.ts';

const DEFAULT_RETURN_URL = 'nudgeapp://payment-success';

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  if (handledPreflight(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cfg = readConfig();
  if (!cfg) {
    sendHtml(res, 500, page('Payments are not configured yet.', 'Ask the app owner to finish the Razorpay setup.'));
    return;
  }

  const subscriptionId = queryParam(req, 'subscriptionId');
  // Shape check before anything else: this value is echoed into a page, and
  // Razorpay subscription ids are always `sub_` followed by alphanumerics.
  if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    sendHtml(res, 400, page('That payment link is not valid.', 'Go back to the app and tap Subscribe again.'));
    return;
  }

  // Refuse ids we never issued, so this page cannot be pointed at an arbitrary
  // subscription belonging to someone else's Razorpay account.
  const known = await entitlementStore().findBySubscriptionId(subscriptionId);
  if (!known && !process.env.UPSTASH_REDIS_REST_URL) {
    // In-memory store on a different instance — can't verify, so carry on.
    // With a durable store configured this branch never runs.
    console.warn('[nudge] checkout: subscription not in store, in-memory backend');
  } else if (!known) {
    sendHtml(res, 404, page('That payment link has expired.', 'Go back to the app and tap Subscribe again.'));
    return;
  }

  const returnUrl = process.env.APP_RETURN_URL ?? DEFAULT_RETURN_URL;
  const cancelUrl = process.env.APP_CANCEL_URL ?? 'nudgeapp://payment-cancelled';

  sendHtml(
    res,
    200,
    checkoutPage({
      keyId: cfg.keyId,
      subscriptionId,
      returnUrl,
      cancelUrl,
      contact: queryParam(req, 'contact') ?? '',
      name: queryParam(req, 'name') ?? '',
      email: queryParam(req, 'email') ?? '',
    }),
  );
}

interface PageArgs {
  keyId: string;
  subscriptionId: string;
  returnUrl: string;
  cancelUrl: string;
  contact: string;
  name: string;
  email: string;
}

function checkoutPage(a: PageArgs): string {
  // Everything interpolated below goes through `jsonForScript`, so neither a
  // stray quote nor a literal `</script>` in a customer's name can break out
  // of the script block.
  const cfg = jsonForScript({
    key: a.keyId,
    subscription_id: a.subscriptionId,
    name: 'Nudge',
    description: 'Nudge subscription — ₹99/month',
    theme: { color: '#a855f7' },
    prefill: { contact: a.contact, name: a.name, email: a.email },
    notes: { subscriptionId: a.subscriptionId },
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Nudge — ₹99/month</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0b10; color: #fff; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { padding: 24px; max-width: 320px; }
  .dot { width: 56px; height: 56px; margin: 0 auto 18px; border-radius: 18px;
         background: linear-gradient(135deg, #d946ef, #6366f1); }
  h1 { font-size: 19px; margin: 0 0 6px; }
  p  { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.6); margin: 0; }
  button {
    margin-top: 20px; width: 100%; padding: 14px; border: 0; border-radius: 16px;
    background: #a855f7; color: #fff; font-size: 15px; font-weight: 700;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="dot"></div>
    <h1>Opening secure payment…</h1>
    <p>Pay with any UPI app, card, netbanking or wallet. You'll come straight back to Nudge.</p>
    <button id="retry" hidden>Open payment</button>
  </div>

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function () {
  var RETURN_URL = ${jsonForScript(a.returnUrl)};
  var CANCEL_URL = ${jsonForScript(a.cancelUrl)};
  var SUB_ID = ${jsonForScript(a.subscriptionId)};
  var options = ${cfg};

  function leave(base, extra) {
    var url = base + (base.indexOf('?') === -1 ? '?' : '&') +
      'subscription_id=' + encodeURIComponent(SUB_ID) + (extra || '');
    window.location.href = url;
    // If the deep link does not resolve (desktop browser, or the app is not
    // installed), fall back to a plain result page after a moment.
    setTimeout(function () {
      document.querySelector('h1').textContent = 'Done — you can close this tab.';
      document.querySelector('p').textContent =
        'Your subscription is being confirmed. Reopen Nudge to continue.';
      document.getElementById('retry').hidden = true;
    }, 1200);
  }

  options.handler = function (response) {
    // The app does NOT trust this redirect. It calls /subscription-status, and
    // the server answers from Razorpay's signed webhook. This is only a nudge
    // back to the app.
    leave(RETURN_URL,
      '&payment_id=' + encodeURIComponent(response.razorpay_payment_id || ''));
  };
  options.modal = {
    escape: false,
    ondismiss: function () { leave(CANCEL_URL, ''); }
  };

  function open() {
    try {
      new window.Razorpay(options).open();
    } catch (e) {
      document.querySelector('h1').textContent = 'Could not open payment';
      document.querySelector('p').textContent = String(e);
      document.getElementById('retry').hidden = false;
    }
  }

  document.getElementById('retry').addEventListener('click', open);
  // Some in-app browsers block a modal opened before first paint.
  setTimeout(open, 120);
})();
</script>
</body>
</html>`;
}

/** A plain message page, for the cases where checkout cannot be shown. */
function page(title: string, detail: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nudge</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0b10;
         color:#fff; text-align:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { padding:24px; max-width:320px; }
  h1 { font-size:19px; margin:0 0 6px; }
  p { font-size:14px; line-height:1.5; color:rgba(255,255,255,.6); margin:0; }
</style></head>
<body><div class="wrap"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></div></body></html>`;
}
