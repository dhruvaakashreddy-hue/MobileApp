package com.billmate.payments.gateway;

/**
 * What the gateway hands back after creating an order.
 *
 * @param orderId  Razorpay's id, e.g. {@code order_MkT9...}; Checkout needs it
 * @param amount   the amount Razorpay recorded, in paise
 * @param currency e.g. INR
 */
public record GatewayOrder(String orderId, long amount, String currency) {
}
