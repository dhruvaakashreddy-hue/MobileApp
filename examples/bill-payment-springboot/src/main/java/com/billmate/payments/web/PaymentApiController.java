package com.billmate.payments.web;

import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.service.PaymentException;
import com.billmate.payments.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * The JSON endpoints the checkout page calls with fetch().
 *
 * <p>@RestController means every return value is serialised to JSON instead of
 * being treated as a template name.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentApiController {

    private final PaymentService payments;

    public PaymentApiController(PaymentService payments) {
        this.payments = payments;
    }

    /**
     * The step everything else depends on.
     *
     * <p>Checkout's success callback runs in the browser, so its three values
     * are a <em>claim</em>, not proof — a determined user can call that callback
     * themselves with invented values. This recomputes the signature with the
     * key secret. The browser is told where to go next only if it matches.
     */
    @PostMapping("/verify")
    public VerifyResponse verify(@Valid @RequestBody VerifyRequest request) {
        PaymentAttempt attempt = payments.completePayment(
                request.orderId(), request.paymentId(), request.signature());
        return VerifyResponse.success("/success/" + attempt.orderId());
    }

    /**
     * Simulated mode only: produces a correctly signed payment so that the
     * verify endpoint above can be exercised without a Razorpay account.
     *
     * <p>{@link PaymentService#simulateSignature} throws the moment real keys
     * are configured, so this cannot be used to forge a live payment.
     */
    @PostMapping("/simulate")
    public Map<String, String> simulate(@RequestBody Map<String, String> body) {
        String orderId = body.get("orderId");
        if (orderId == null || orderId.isBlank()) {
            throw new PaymentException("orderId is required");
        }
        String paymentId = "pay_sim_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        return Map.of(
                "razorpay_order_id", orderId,
                "razorpay_payment_id", paymentId,
                "razorpay_signature", payments.simulateSignature(orderId, paymentId));
    }

    /**
     * Turns our own exceptions into a 400 with a readable message, instead of
     * the default 500 and a stack trace. Scoped to this class, so the page
     * controller keeps rendering HTML errors.
     */
    @ExceptionHandler(PaymentException.class)
    public ResponseEntity<VerifyResponse> handlePaymentException(PaymentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(VerifyResponse.failure(ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<VerifyResponse> handleDisabled(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(VerifyResponse.failure(ex.getMessage()));
    }
}
