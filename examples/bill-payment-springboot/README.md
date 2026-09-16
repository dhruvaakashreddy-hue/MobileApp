# Bill payment in Java + Spring Boot — UPI / Card / Wallet

The flow you asked for, as a complete Spring Boot app:

**reminder → Pay now → choose UPI / Card / Wallet → payment page → "Payment successful"**

It is self-contained. Nothing here depends on the rest of this repository.

**It runs with no Razorpay account.** With no keys set it starts in *simulated
mode*: the order id and the signature are faked, but every screen, the HMAC
verification, the redirect and the receipt are the real code paths. Add test
keys later and the same app talks to Razorpay.

---

## Part 1 — Run it in VS Code

### Step 1. Install the two things you need

| | Check it worked |
| --- | --- |
| **JDK 21** ([Adoptium](https://adoptium.net/)) | `java -version` → `21.x` |
| **VS Code** | — |

Maven is **not** a separate install — the Java extension below brings its own.

### Step 2. Install the VS Code extensions

Open VS Code → Extensions (`Ctrl+Shift+X`) → install:

1. **Extension Pack for Java** (Microsoft) — compiler, debugger, Maven, test runner
2. **Spring Boot Extension Pack** (VMware) — the Spring dashboard and YAML autocomplete

Reload VS Code when it asks.

### Step 3. Open the project

**File → Open Folder…** → pick this `bill-payment-springboot` folder.

> Open **this** folder, not its parent. VS Code looks for `pom.xml` in the folder
> you open; point it one level up and Java support never activates.

Bottom-right will say *"Importing Java projects…"*. Wait for it to finish — the
first import downloads Spring Boot and takes a few minutes. You are ready when
the **Java Projects** view in the Explorer shows `bill-payment-springboot`.

### Step 4. Run it

Three ways — any one works:

- **Easiest:** open `src/main/java/com/billmate/payments/BillPaymentApplication.java`.
  A **Run | Debug** link appears just above `public static void main`. Click **Run**.
- **Spring dashboard:** the Spring Boot Dashboard in the sidebar → hover the app → ▶.
- **Terminal** (`Ctrl+` backtick):
  ```bash
  ./mvnw spring-boot:run      # macOS / Linux
  mvnw.cmd spring-boot:run    # Windows
  ```

Watch for this in the terminal:

```
Tomcat started on port 8080 (http)
Started BillPaymentApplication in 1.5 seconds
```

### Step 5. Use it

Open **http://localhost:8080**.

Click **Pay now** → pick **UPI**, **Card** or **Wallet** → **Pay ₹1,840** →
the green **Payment successful** screen.

Press **Simulate a failure** on the payment page to watch the server reject a
bad signature — that is the security check doing its job.

### Step 6. Run the tests

```bash
./mvnw test
```

27 tests, no network needed. Or use the **Testing** flask icon in the sidebar to
run them individually.

---

## Part 2 — Switch to real Razorpay (test mode)

Optional. Skip it until the simulated flow makes sense.

1. Sign up at [razorpay.com](https://razorpay.com) — free, no KYC for test mode.
2. In the dashboard, flip the toggle to **Test Mode** (top of the screen).
3. **Settings → API Keys → Generate Test Key**. You get a **Key ID**
   (`rzp_test_…`) and a **Key Secret**. Copy both now — the secret is shown once.
4. Copy `src/main/resources/application-local.yml.example` to
   `application-local.yml` in the same folder and paste your keys in.
5. Run with that profile:
   ```bash
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```
   In VS Code instead: **Run and Debug** → the gear → add
   `"args": ["--spring.profiles.active=local"]`.

`application-local.yml` is gitignored. Test mode never moves real money.

Test credentials once Razorpay Checkout opens:

| What | Value |
| --- | --- |
| UPI ID | `success@razorpay` |
| Card | `4111 1111 1111 1111`, any future expiry, any CVV |
| Failure card | `4000 0000 0000 0002` |

---

## Part 3 — The code

### Every file

```
pom.xml                          dependencies; inherits versions from Spring Boot

src/main/java/com/billmate/payments/
  BillPaymentApplication.java    main() — starts Tomcat and everything else

  config/
    RazorpayProperties.java      typed binding for the razorpay.* settings
    PaymentGatewayConfig.java    picks the real or the simulated gateway at boot

  domain/
    Bill.java                    a bill; amount in PAISE, as a long
    PaymentMethod.java           the UPI / CARD / WALLET enum
    PaymentAttempt.java          one attempt: order id, status, payment id
    PaymentStatus.java           CREATED / PAID / FAILED

  repository/
    BillRepository.java          the bills AND their prices — the security boundary
    PaymentAttemptRepository.java in-memory store; idempotent markPaid

  gateway/
    PaymentGateway.java          the interface the service depends on
    RazorpayGateway.java         the real HTTPS call to Razorpay
    SimulatedGateway.java        stand-in when no keys are set
    GatewayOrder.java            what came back
    PaymentGatewayException.java

  service/
    PaymentService.java          startPayment + completePayment — the whole flow
    SignatureVerifier.java       HMAC-SHA256, constant-time comparison
    PaymentException.java

  web/
    BillController.java          the four screens
    PaymentApiController.java    POST /api/payments/verify
    WebhookController.java       Razorpay calling us back
    PageExceptionHandler.java    errors as a page, not a stack trace
    PaymentMethodConverter.java  "upi" in a URL -> the enum
    VerifyRequest / VerifyResponse.java

src/main/resources/
  application.yml                settings; reads env vars
  templates/                     reminders, methods, checkout, success, error
  static/css/app.css             styling only
  static/js/checkout.js          opens Checkout, calls verify

src/test/java/...                27 tests
```

### The flow, step by step

```
 GET /                        BillController      the reminder list
     │
     │  click "Pay now"
     ▼
 GET /pay/electricity         BillController      the UPI / Card / Wallet sheet
     │
     │  pick a method (an HTML form POST)
     ▼
 POST /pay/electricity        BillController   ─► PaymentService.startPayment
     │                                            looks the PRICE up server-side,
     │                                            asks Razorpay for an order
     │  302 redirect
     ▼
 GET /checkout/order_xyz      BillController      the payment page
     │
     │  checkout.js opens Razorpay Checkout on the chosen method
     ▼
 user pays                    Razorpay
     │
     │  handler(response) fires IN THE BROWSER — three values, proving nothing
     ▼
 POST /api/payments/verify    PaymentApiController ─► PaymentService.completePayment
     │                                                recomputes the HMAC with the
     │                                                key secret and compares
     │  { verified: true, redirectUrl }
     ▼
 GET /success/order_xyz       BillController      "Payment successful"
```

### How Spring Boot wires this up

Four annotations do almost all of it.

**`@SpringBootApplication`** on the main class. It scans `com.billmate.payments`
and every package below it — which is why every class lives under that package —
finds the annotated classes, and creates one instance of each. Those instances
are "beans".

**`@Service`, `@Repository`, `@Controller`, `@Component`** mark a class as one of
those beans. They do the same thing; the different names say what the class is
for, and tools use that.

**Constructor injection** connects them. `PaymentService` declares what it needs:

```java
public PaymentService(BillRepository bills,
                      PaymentAttemptRepository attempts,
                      PaymentGateway gateway,
                      SignatureVerifier verifier,
                      RazorpayProperties properties) { ... }
```

Spring sees one constructor and passes in a matching bean for each parameter. No
`new`, no `@Autowired` needed. The payoff is in `PaymentServiceTest`, which
constructs the class by hand with a fake gateway and tests the whole flow without
a network.

**`@GetMapping` / `@PostMapping`** map a URL to a method. In a `@Controller`, the
returned `String` names a template in `resources/templates`; in a
`@RestController` the return value becomes JSON.

### Thymeleaf in one minute

Templates are ordinary HTML files with extra `th:` attributes:

```html
<span th:text="${bill.label}">Electricity bill</span>
```

At render time `th:text` replaces the content with `bill.label` from the model.
The text already in the tag is what you see if you open the file directly in a
browser, so templates can be designed offline.

- `th:each="bill : ${bills}"` — repeat this element per item
- `th:if` / `th:unless` — render only when true
- `th:href="@{/pay/{id}(id=${bill.id})}"` — build a URL
- `th:action` + `method="post"` — a form that posts to a controller

`th:text` escapes what it inserts, so a bill named `<script>…` renders as text
rather than running. Use `th:utext` (unescaped) only on HTML you produced
yourself.

---

## Part 4 — The four things that matter

Everything else is presentation. These four are where payment integrations go
wrong, and they are the reason a server exists at all.

### 1. The browser never sends the amount

Look at what the method sheet posts:

```html
<input type="hidden" name="method" value="upi">
```

A method, and the bill id already in the URL. **No amount.** The server looks the
price up itself:

```java
Bill bill = bills.findById(billId)
        .orElseThrow(() -> new PaymentException("Unknown bill: " + billId));
```

If the browser sent the amount, anyone could edit that HTML in devtools and pay
₹1 for a ₹1,840 bill. `PaymentServiceTest.chargesThePriceFromTheServerNotFromTheRequest`
is the test that pins this down.

### 2. The key secret never leaves the server

The **Key ID** goes to the browser — Checkout needs it, and it is public. The
**Key Secret** stays on the server, where it authenticates the API call:

```java
.defaultHeaders(headers -> headers.setBasicAuth(
        properties.getKeyId(), properties.getKeySecret()))
```

If you find yourself putting the secret in a `th:data-…` attribute or a
`<script>` block, stop. Anyone can read the page source.
`BillControllerTest.thePaymentPageNeverContainsTheKeySecret` asserts it is absent.

### 3. Success is what the server says, not what the browser says

This is the one people skip. Razorpay's `handler` runs **in the browser**, so its
three values are a claim — anyone can open the console and call that function
with invented values.

So the handler does not show success. It asks the server first:

```javascript
handler: function (response) {
  verify(response);   // -> POST /api/payments/verify
}
```

And the server recomputes the signature with the key secret:

```java
String payload = orderId + "|" + paymentId;
if (!verifier.matches(payload, verificationSecret(), signature)) {
    attempts.markFailed(orderId);
    throw new PaymentException("That payment could not be verified");
}
```

The formula is fixed by Razorpay: `order_id | payment_id`, HMAC-SHA256, keyed
with your secret.

The comparison uses `MessageDigest.isEqual`, not `String.equals`:

```java
return MessageDigest.isEqual(expected, provided);
```

`equals` stops at the first differing character, so **how long it takes leaks how
much of the signature was right** — enough to guess a valid one byte by byte.
`MessageDigest.isEqual` always reads every byte. Never use `equals` on a
signature.

The success page reinforces it: it renders from the **stored status**, not from
the URL. Typing `/success/order_xyz` for an unpaid order redirects back to the
bill list, so the receipt cannot be faked.

### 4. Paying twice must not charge twice

The same payment arrives twice in normal operation — once from the browser, once
from the webhook, in either order. The update is therefore atomic and idempotent:

```java
attemptsByOrderId.computeIfPresent(orderId,
        (key, attempt) -> attempt.isPaid() ? attempt : attempt.paid(paymentId));
```

`computeIfPresent` runs under the map's lock for that key, and an attempt that is
already `PAID` is returned unchanged. `verifyingTwiceIsIdempotent` tests it.

The same reasoning drives the redirect after the POST: creating the order and
then **redirecting** means refreshing the payment page re-renders it instead of
creating a second order. That is the Post/Redirect/Get pattern.

---

## Part 5 — Two bugs worth avoiding

**Amounts are in paise.** ₹1,840 is `184000`. Send `1840` and you charge ₹18.40.
This is the single most common first-timer bug. `Bill` stores paise as a `long`
so the mistake has nowhere to hide — and `long`, not `double`, because `double`
cannot represent 0.1 exactly and money in floating point eventually produces a
₹0.01 discrepancy nobody can explain.

**A closed window is not a failure.** Three different things end a payment, and
they are three separate callbacks:

| What happened | Callback |
| --- | --- |
| Paid | `handler` |
| Card declined, UPI timed out | `rzp.on('payment.failed')` |
| User closed the window | `modal.ondismiss` |

Treat a dismissal as "nothing happened", not as an error. `checkout.js` handles
all three.

---

## Part 6 — Before you take real money

- [ ] **Use a database.** Swap the two in-memory repositories for Spring Data JPA
      (`spring-boot-starter-data-jpa` + a driver). Nothing else changes — that is
      why they are behind classes. As written, a restart forgets every payment.
- [ ] **Turn the webhook on.** `WebhookController` is written but idle until you
      add `payment.captured` in **Dashboard → Settings → Webhooks** and set
      `razorpay.webhook-secret`. Without it, a user who pays and immediately
      closes the app is charged while your database still says unpaid. Note that
      the webhook signature covers the **raw request body byte for byte** — parse
      it *after* verifying, never re-serialise before.
- [ ] **Add Spring Security.** There is no login here, so anyone can pay anyone's
      bill. Adding `spring-boot-starter-security` also switches CSRF protection
      on, and the forms in `methods.html` then need
      `<input type="hidden" th:name="${_csrf.parameterName}" th:value="${_csrf.token}">`
      and the `fetch` call an `X-XSRF-TOKEN` header.
- [ ] **Never commit the secret.** Use environment variables in production, not a
      file. Rotate the key immediately if it is ever pushed — git history keeps it
      even after you delete the line.
- [ ] **Complete KYC** in the Razorpay dashboard to leave test mode. Bank details
      go in the dashboard only, never in code.
- [ ] **Keep the logs clean.** Log order ids and payment ids, never card numbers,
      UPI IDs or the signature.

If you ship this inside an **Android or iOS app**, note that Apple and Google
require *their* in-app purchase billing for digital goods. A utility bill is a
real-world service, so Razorpay is allowed — but a subscription to your app
itself is not.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| VS Code shows no Run link | Opened the wrong folder, or the Java import is still running. Check the bottom status bar. |
| `Port 8080 was already in use` | Something else has the port. Change `server.port` in `application.yml`. |
| Red squiggles everywhere on a fresh clone | Dependencies still downloading. Or **Ctrl+Shift+P → Java: Clean Java Language Server Workspace**. |
| `release version 21 not supported` | VS Code is on an older JDK. **Ctrl+Shift+P → Java: Configure Java Runtime**. |
| Still says "Simulated mode" with keys set | The `local` profile is not active, or the keys are blank. The startup log prints which gateway it chose. |
| Checkout opens then closes instantly | Key ID and Key Secret are from different accounts, or one is a live key in test mode. |
