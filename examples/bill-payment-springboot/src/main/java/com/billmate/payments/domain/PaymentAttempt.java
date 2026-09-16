package com.billmate.payments.domain;

import java.time.Instant;

/**
 * One attempt to pay one bill: created when we ask Razorpay for an order,
 * completed when the signature verifies.
 *
 * <p>It is a record, so it is immutable — {@link #paid} and {@link #failed}
 * return a new instance instead of mutating this one. That is what lets the
 * repository update it atomically without locking.
 *
 * <p>In a real app this is a JPA {@code @Entity} in a database table. The demo
 * keeps it in memory so that you can run the project with nothing installed.
 */
public record PaymentAttempt(
        String orderId,
        String billId,
        String billLabel,
        PaymentMethod method,
        long amountInPaise,
        String currency,
        PaymentStatus status,
        String paymentId,
        Instant createdAt,
        Instant completedAt) {

    public static PaymentAttempt created(
            String orderId, Bill bill, PaymentMethod method, String currency) {
        return new PaymentAttempt(
                orderId,
                bill.id(),
                bill.label(),
                method,
                bill.amountInPaise(),
                currency,
                PaymentStatus.CREATED,
                null,
                Instant.now(),
                null);
    }

    public PaymentAttempt paid(String paymentId) {
        return new PaymentAttempt(orderId, billId, billLabel, method, amountInPaise,
                currency, PaymentStatus.PAID, paymentId, createdAt, Instant.now());
    }

    public PaymentAttempt failed() {
        return new PaymentAttempt(orderId, billId, billLabel, method, amountInPaise,
                currency, PaymentStatus.FAILED, paymentId, createdAt, Instant.now());
    }

    public boolean isPaid() {
        return status == PaymentStatus.PAID;
    }

    /** Rupees, with Indian grouping, for the receipt. */
    public String formattedAmount() {
        return Bill.formatPaise(amountInPaise);
    }
}
