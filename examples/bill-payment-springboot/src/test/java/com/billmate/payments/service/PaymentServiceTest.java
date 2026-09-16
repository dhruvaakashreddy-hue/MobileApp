package com.billmate.payments.service;

import com.billmate.payments.config.RazorpayProperties;
import com.billmate.payments.domain.Bill;
import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.domain.PaymentMethod;
import com.billmate.payments.domain.PaymentStatus;
import com.billmate.payments.gateway.GatewayOrder;
import com.billmate.payments.gateway.PaymentGateway;
import com.billmate.payments.repository.BillRepository;
import com.billmate.payments.repository.PaymentAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The flow, tested without HTTP and without Razorpay.
 *
 * <p>This is what constructor injection buys you: a fake gateway goes in, and
 * the service under test cannot tell the difference.
 */
class PaymentServiceTest {

    private static final String SECRET = "test_secret";

    /** Records what it was asked for and hands back a predictable order id. */
    private static final class FakeGateway implements PaymentGateway {
        private Bill lastBill;

        @Override
        public GatewayOrder createOrder(Bill bill, String receipt) {
            this.lastBill = bill;
            return new GatewayOrder("order_TEST123", bill.amountInPaise(), "INR");
        }

        @Override
        public String publicKeyId() {
            return "rzp_test_fake";
        }

        @Override
        public boolean isLive() {
            return true;
        }
    }

    private FakeGateway gateway;
    private SignatureVerifier verifier;
    private PaymentService service;

    @BeforeEach
    void setUp() {
        gateway = new FakeGateway();
        verifier = new SignatureVerifier();

        RazorpayProperties properties = new RazorpayProperties();
        properties.setKeyId("rzp_test_fake");
        properties.setKeySecret(SECRET);

        service = new PaymentService(
                new BillRepository(), new PaymentAttemptRepository(), gateway, verifier, properties);
    }

    private String validSignature(String orderId, String paymentId) {
        return verifier.sign(orderId + "|" + paymentId, SECRET);
    }

    @Test
    void chargesThePriceFromTheServerNotFromTheRequest() {
        service.startPayment("electricity", PaymentMethod.UPI);

        // The caller passed a bill id and nothing else; the amount came from
        // BillRepository. This is the check that stops a tampered ₹1 payment.
        assertThat(gateway.lastBill.amountInPaise()).isEqualTo(184_000L);
    }

    @Test
    void recordsTheAttemptAsUnpaidUntilItIsVerified() {
        PaymentAttempt attempt = service.startPayment("broadband", PaymentMethod.CARD);

        assertThat(attempt.status()).isEqualTo(PaymentStatus.CREATED);
        assertThat(attempt.isPaid()).isFalse();
        assertThat(attempt.method()).isEqualTo(PaymentMethod.CARD);
        assertThat(attempt.amountInPaise()).isEqualTo(79_900L);
    }

    @Test
    void rejectsAnUnknownBill() {
        assertThatThrownBy(() -> service.startPayment("yacht-mooring", PaymentMethod.UPI))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("Unknown bill");
    }

    @Test
    void marksPaidWhenTheSignatureIsCorrect() {
        PaymentAttempt created = service.startPayment("electricity", PaymentMethod.UPI);
        String paymentId = "pay_TEST999";

        PaymentAttempt paid = service.completePayment(
                created.orderId(), paymentId, validSignature(created.orderId(), paymentId));

        assertThat(paid.isPaid()).isTrue();
        assertThat(paid.paymentId()).isEqualTo(paymentId);
        assertThat(paid.completedAt()).isNotNull();
    }

    @Test
    void refusesAForgedSignature() {
        PaymentAttempt created = service.startPayment("electricity", PaymentMethod.UPI);

        assertThatThrownBy(() ->
                service.completePayment(created.orderId(), "pay_FORGED", "deadbeef"))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("could not be verified");

        // And the bill is emphatically not paid.
        assertThat(service.findAttempt(created.orderId()))
                .get()
                .extracting(PaymentAttempt::isPaid)
                .isEqualTo(false);
    }

    @Test
    void refusesAPaymentForAnOrderWeNeverCreated() {
        assertThatThrownBy(() ->
                service.completePayment("order_INVENTED", "pay_X", validSignature("order_INVENTED", "pay_X")))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("no record");
    }

    @Test
    void verifyingTwiceIsIdempotent() {
        PaymentAttempt created = service.startPayment("mobile", PaymentMethod.WALLET);
        String paymentId = "pay_TWICE";
        String signature = validSignature(created.orderId(), paymentId);

        PaymentAttempt first = service.completePayment(created.orderId(), paymentId, signature);
        // The webhook arriving after the browser, which is the common case.
        PaymentAttempt second = service.completePayment(created.orderId(), paymentId, signature);

        assertThat(second.paymentId()).isEqualTo(first.paymentId());
        assertThat(second.completedAt()).isEqualTo(first.completedAt());
    }

    @Test
    void theWebhookCanCompleteAPaymentTheBrowserNeverReported() {
        PaymentAttempt created = service.startPayment("mobile", PaymentMethod.UPI);

        PaymentAttempt paid = service.markPaidFromWebhook(created.orderId(), "pay_WEBHOOK").orElseThrow();

        assertThat(paid.isPaid()).isTrue();
        assertThat(paid.paymentId()).isEqualTo("pay_WEBHOOK");
    }
}
