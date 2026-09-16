package com.billmate.payments.service;

/** Something the user did or asked for is wrong — turns into a 4xx, not a 500. */
public class PaymentException extends RuntimeException {

    public PaymentException(String message) {
        super(message);
    }
}
