package com.billmate.payments.domain;

/**
 * Where an attempt got to.
 *
 * <p>There is deliberately no status meaning "the browser said it worked".
 * An attempt is {@link #PAID} only once this server has recomputed the
 * signature with the key secret and it matched.
 */
public enum PaymentStatus {
    /** Order created with Razorpay; the user has not finished paying. */
    CREATED,
    /** Signature verified on the server. This is the only status you may trust. */
    PAID,
    /** The gateway told us the payment failed. */
    FAILED
}
