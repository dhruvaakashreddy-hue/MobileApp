package com.billmate.payments.repository;

import com.billmate.payments.domain.PaymentAttempt;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory store of payment attempts, keyed by Razorpay order id.
 *
 * <p>{@link #markPaid} is the interesting method. The same payment can arrive
 * twice — once from the browser's verify call and once from the webhook, in
 * either order, possibly at the same moment. {@code ConcurrentHashMap.compute}
 * runs the update atomically for that key, and returning the existing record
 * when it is already paid makes the operation <em>idempotent</em>: paying once
 * can never credit the bill twice.
 */
@Repository
public class PaymentAttemptRepository {

    private final Map<String, PaymentAttempt> attemptsByOrderId = new ConcurrentHashMap<>();

    public void save(PaymentAttempt attempt) {
        attemptsByOrderId.put(attempt.orderId(), attempt);
    }

    public Optional<PaymentAttempt> findByOrderId(String orderId) {
        return Optional.ofNullable(attemptsByOrderId.get(orderId));
    }

    /** Atomically flips the attempt to PAID, or returns it unchanged if it already was. */
    public Optional<PaymentAttempt> markPaid(String orderId, String paymentId) {
        return Optional.ofNullable(attemptsByOrderId.computeIfPresent(orderId,
                (key, attempt) -> attempt.isPaid() ? attempt : attempt.paid(paymentId)));
    }

    public Optional<PaymentAttempt> markFailed(String orderId) {
        return Optional.ofNullable(attemptsByOrderId.computeIfPresent(orderId,
                (key, attempt) -> attempt.isPaid() ? attempt : attempt.failed()));
    }
}
