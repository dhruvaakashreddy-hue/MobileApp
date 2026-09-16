package com.billmate.payments.gateway;

import com.billmate.payments.domain.Bill;

/**
 * The seam between our app and the payment provider.
 *
 * <p>Two implementations exist: {@link RazorpayGateway}, which makes the real
 * HTTPS call, and {@link SimulatedGateway}, used when no keys are configured.
 * {@code PaymentService} depends on this interface and cannot tell which one it
 * got — that is dependency inversion, and it is also what makes the service
 * testable without touching the network.
 */
public interface PaymentGateway {

    /** Asks the provider to create an order for this bill. */
    GatewayOrder createOrder(Bill bill, String receipt);

    /** The key the browser is allowed to see, or a placeholder in simulated mode. */
    String publicKeyId();

    /** True when real Razorpay credentials are in use. */
    boolean isLive();
}
