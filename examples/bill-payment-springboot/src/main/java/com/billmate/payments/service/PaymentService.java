package com.billmate.payments.service;

import com.billmate.payments.config.RazorpayProperties;
import com.billmate.payments.domain.Bill;
import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.domain.PaymentMethod;
import com.billmate.payments.gateway.GatewayOrder;
import com.billmate.payments.gateway.PaymentGateway;
import com.billmate.payments.gateway.SimulatedGateway;
import com.billmate.payments.repository.BillRepository;
import com.billmate.payments.repository.PaymentAttemptRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * The whole payment flow, in one class. Controllers only translate HTTP to and
 * from these two methods:
 *
 * <pre>
 *   startPayment(billId, method)   ->  order created, attempt recorded
 *   completePayment(order, payment, signature)  ->  verified, marked paid
 * </pre>
 *
 * <p>Keeping this logic out of the controllers is what lets the unit tests call
 * it directly, with no HTTP and no Razorpay.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final BillRepository bills;
    private final PaymentAttemptRepository attempts;
    private final PaymentGateway gateway;
    private final SignatureVerifier verifier;
    private final RazorpayProperties properties;

    /**
     * Constructor injection. Spring sees one constructor and passes in the beans
     * it matches by type — no @Autowired needed. Prefer this to field injection:
     * the fields can be final, and a test can build the class with fakes.
     */
    public PaymentService(BillRepository bills,
                          PaymentAttemptRepository attempts,
                          PaymentGateway gateway,
                          SignatureVerifier verifier,
                          RazorpayProperties properties) {
        this.bills = bills;
        this.attempts = attempts;
        this.gateway = gateway;
        this.verifier = verifier;
        this.properties = properties;
    }

    /**
     * Step 1 of the flow: the user picked a method, so create the order.
     *
     * <p>Note the arguments: a bill <em>id</em> and a method. No amount. The
     * price comes from {@link BillRepository}, which is the whole reason a
     * tampered request cannot change what is charged.
     */
    public PaymentAttempt startPayment(String billId, PaymentMethod method) {
        Bill bill = bills.findById(billId)
                .orElseThrow(() -> new PaymentException("Unknown bill: " + billId));

        String receipt = "bill_" + bill.id() + "_" + System.currentTimeMillis();
        GatewayOrder order = gateway.createOrder(bill, receipt);

        PaymentAttempt attempt = PaymentAttempt.created(
                order.orderId(), bill, method, order.currency());
        attempts.save(attempt);

        log.info("Created order {} for bill {} ({} paise) via {}",
                order.orderId(), bill.id(), bill.amountInPaise(), method);
        return attempt;
    }

    /**
     * Step 2: Checkout handed the browser three values. They prove nothing on
     * their own — the browser could have invented them — so recompute the
     * signature here, with the secret, and only then mark the bill paid.
     *
     * <p>The formula is fixed by Razorpay:
     * {@code HMAC_SHA256(order_id + "|" + payment_id, key_secret)}.
     */
    public PaymentAttempt completePayment(String orderId, String paymentId, String signature) {
        PaymentAttempt attempt = attempts.findByOrderId(orderId)
                .orElseThrow(() -> new PaymentException("We have no record of that order"));

        // Already verified, most likely by the webhook getting here first.
        // Returning happily rather than re-verifying is what makes this safe to
        // call twice; see PaymentAttemptRepository.markPaid.
        if (attempt.isPaid()) {
            return attempt;
        }

        String payload = orderId + "|" + paymentId;
        if (!verifier.matches(payload, verificationSecret(), signature)) {
            attempts.markFailed(orderId);
            log.warn("Signature mismatch for order {} — refusing to mark it paid", orderId);
            throw new PaymentException("That payment could not be verified");
        }

        PaymentAttempt paid = attempts.markPaid(orderId, paymentId)
                .orElseThrow(() -> new PaymentException("We have no record of that order"));

        // Only past this line is the money real. Send the receipt, mark the bill
        // paid in your database, notify the user — all of it belongs here.
        log.info("Verified payment {} for order {}", paymentId, orderId);
        return paid;
    }

    /**
     * Marks an attempt paid on the strength of a webhook.
     *
     * <p>No {@code order_id|payment_id} check here, and that is correct: the
     * webhook carried its own signature over the whole request body, and
     * {@code WebhookController} already verified it. Re-checking the browser's
     * formula would fail, because Razorpay never sent that one.
     *
     * <p>Idempotent, so it is safe when the browser's verify call already ran.
     */
    public Optional<PaymentAttempt> markPaidFromWebhook(String orderId, String paymentId) {
        return attempts.markPaid(orderId, paymentId);
    }

    public Optional<PaymentAttempt> findAttempt(String orderId) {
        return attempts.findByOrderId(orderId);
    }

    public List<Bill> allBills() {
        return bills.findAll();
    }

    public Optional<Bill> findBill(String billId) {
        return bills.findById(billId);
    }

    public String publicKeyId() {
        return gateway.publicKeyId();
    }

    public boolean isLive() {
        return gateway.isLive();
    }

    /**
     * Which secret to check signatures against.
     *
     * <p>With real keys it is your Razorpay key secret. In simulated mode it is
     * the throwaway constant the simulated checkout signs with, so the
     * verification path above is exercised either way.
     */
    private String verificationSecret() {
        return gateway.isLive() ? properties.getKeySecret() : SimulatedGateway.SIMULATED_SECRET;
    }

    /** Signs a simulated payment. Only reachable while the simulated gateway is active. */
    public String simulateSignature(String orderId, String paymentId) {
        if (gateway.isLive()) {
            throw new IllegalStateException("Simulated payments are disabled when real keys are set");
        }
        return verifier.sign(orderId + "|" + paymentId, SimulatedGateway.SIMULATED_SECRET);
    }
}
