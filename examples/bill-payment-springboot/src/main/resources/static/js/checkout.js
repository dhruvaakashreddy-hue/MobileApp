/*
 * The payment page.
 *
 * Its job is narrow: open Razorpay Checkout on the method the user already
 * chose, and when Checkout reports success, ask OUR server whether that is
 * true before going anywhere near the success page.
 */
(function () {
  'use strict';

  var root = document.getElementById('checkout');
  if (!root) return;

  // Read what Thymeleaf rendered into the data- attributes. Nothing here was
  // ever parsed as code, so a bill label containing a quote cannot break out.
  var data = root.dataset;
  var statusEl = document.getElementById('status');
  var actionsEl = document.getElementById('actions');

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'pay-status' + (kind ? ' ' + kind : '');
  }

  function showButton(label, onClick) {
    var button = document.createElement('button');
    button.className = 'primary';
    button.textContent = label;
    button.addEventListener('click', onClick);
    actionsEl.appendChild(button);
  }

  function clearButtons() {
    actionsEl.innerHTML = '';
  }

  /*
   * The step that decides everything.
   *
   * Razorpay's handler runs here, in the browser, so its three values are only
   * a claim — anyone can call that function with invented values from the
   * console. The server recomputes the HMAC with the key secret, and only its
   * answer moves us to the success page.
   */
  function verify(payload) {
    setStatus('Verifying your payment…');
    clearButtons();

    fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body.verified) {
          throw new Error(result.body.error || 'We could not verify that payment.');
        }
        // The server said yes. Now — and only now — show success.
        window.location.href = result.body.redirectUrl;
      })
      .catch(function (error) {
        setStatus(error.message, 'bad');
        showButton('Try again', function () {
          window.location.reload();
        });
      });
  }

  /* ---------- Simulated mode ---------- */

  function runSimulated() {
    setStatus('Simulated checkout — no money moves here.');
    showButton('Pay ₹' + (Number(data.amount) / 100).toLocaleString('en-IN'), function () {
      setStatus('Signing a simulated payment…');
      clearButtons();

      // Asks the server for a correctly signed fake payment, then sends it
      // through the same /verify endpoint a real payment would use.
      fetch('/api/payments/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId })
      })
        .then(function (response) { return response.json(); })
        .then(verify)
        .catch(function () {
          setStatus('The simulated payment could not be created.', 'bad');
        });
    });

    showButton('Simulate a failure', function () {
      // A deliberately wrong signature, to prove the server rejects it.
      verify({
        razorpay_order_id: data.orderId,
        razorpay_payment_id: 'pay_sim_tampered',
        razorpay_signature: 'not-a-real-signature'
      });
    });
  }

  /* ---------- Real Razorpay Checkout ---------- */

  function runLive() {
    if (typeof window.Razorpay !== 'function') {
      setStatus('Could not load Razorpay Checkout. Check your connection.', 'bad');
      showButton('Reload', function () { window.location.reload(); });
      return;
    }

    var rzp = new window.Razorpay({
      key: data.keyId,                  // PUBLIC key id. The secret is never here.
      amount: Number(data.amount),      // paise, as the server recorded it
      currency: data.currency,
      name: data.company,
      description: data.description,
      order_id: data.orderId,           // ties this window to our server's order

      /*
       * Opens straight into the method the user picked instead of Razorpay's
       * full menu. show_default_blocks:false means "show only my block" — drop
       * that line to show everything with the chosen method first.
       */
      config: {
        display: {
          blocks: {
            chosen: {
              name: data.blockName,
              instruments: [{ method: data.method }]
            }
          },
          sequence: ['block.chosen'],
          preferences: { show_default_blocks: false }
        }
      },

      handler: function (response) {
        // Do not celebrate yet — ask the server.
        verify(response);
      },

      modal: {
        // Closing the window is not a failure. Nothing happened; offer a retry.
        ondismiss: function () {
          setStatus('You closed the payment window. Nothing was charged.');
          clearButtons();
          showButton('Try again', function () { window.location.reload(); });
        }
      },

      theme: { color: '#4f46e5' }
    });

    // A declined card or a timed-out UPI request. Separate from ondismiss,
    // and separate from handler — three different endings, three callbacks.
    rzp.on('payment.failed', function (response) {
      var description = (response && response.error && response.error.description)
        || 'The payment did not go through.';
      setStatus(description, 'bad');
      clearButtons();
      showButton('Try again', function () { window.location.reload(); });
    });

    rzp.open();
  }

  // data-live is rendered by Thymeleaf as the string "true" or "false".
  if (data.live === 'true') {
    runLive();
  } else {
    runSimulated();
  }
})();
