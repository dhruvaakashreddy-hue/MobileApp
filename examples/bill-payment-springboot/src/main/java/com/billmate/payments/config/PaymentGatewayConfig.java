package com.billmate.payments.config;

import com.billmate.payments.gateway.PaymentGateway;
import com.billmate.payments.gateway.RazorpayGateway;
import com.billmate.payments.gateway.SimulatedGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Decides at startup which {@link PaymentGateway} the rest of the app gets.
 *
 * <p>A @Bean method is how you register an object Spring did not build itself.
 * Every class that asks for a {@code PaymentGateway} in its constructor now
 * receives whichever one this method returned, and none of them has to know
 * which.
 */
@Configuration
public class PaymentGatewayConfig {

    private static final Logger log = LoggerFactory.getLogger(PaymentGatewayConfig.class);

    @Bean
    public PaymentGateway paymentGateway(RazorpayProperties properties, RestClient.Builder builder) {
        if (properties.isConfigured()) {
            log.info("Razorpay keys found — using the live gateway (key id {}).",
                    properties.getKeyId());
            return new RazorpayGateway(properties, builder);
        }
        log.warn("""
                
                ****************************************************************
                No Razorpay keys found, so payments are SIMULATED.
                The flow is real; no money and no network call to Razorpay is.
                Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to go to test mode.
                ****************************************************************
                """);
        return new SimulatedGateway();
    }
}
