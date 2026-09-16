package com.billmate.payments.web;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

/**
 * The three values Razorpay Checkout hands the browser on success.
 *
 * <p>Razorpay names them in snake_case, and Java fields are camelCase, so
 * {@code @JsonProperty} maps between the two. @NotBlank plus @Valid on the
 * controller argument rejects a half-empty body with a 400 before any of our
 * code runs.
 */
public record VerifyRequest(
        @JsonProperty("razorpay_order_id") @NotBlank String orderId,
        @JsonProperty("razorpay_payment_id") @NotBlank String paymentId,
        @JsonProperty("razorpay_signature") @NotBlank String signature) {
}
