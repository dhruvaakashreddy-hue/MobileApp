package com.billmate.payments.gateway;

import com.billmate.payments.domain.Bill;

import java.util.UUID;

/**
 * Stands in for Razorpay when no keys are configured, so that
 * {@code mvn spring-boot:run} shows you the whole flow on a fresh clone.
 *
 * <p>It fakes only the two things that need an account: the order id, and the
 * signature that the simulated checkout page produces. Everything after that —
 * the HMAC recomputation, the constant-time comparison, the idempotent update,
 * the redirect to the success page — is the same code that runs in production.
 * A demo that skipped verification would teach you the wrong flow.
 */
public class SimulatedGateway implements PaymentGateway {

    /** Used to sign simulated payments so the real verifier can check them. */
    public static final String SIMULATED_SECRET = "simulated_secret_not_for_production";

    @Override
    public GatewayOrder createOrder(Bill bill, String receipt) {
        String orderId = "order_sim_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        return new GatewayOrder(orderId, bill.amountInPaise(), "INR");
    }

    @Override
    public String publicKeyId() {
        return "rzp_test_simulated";
    }

    @Override
    public boolean isLive() {
        return false;
    }
}
