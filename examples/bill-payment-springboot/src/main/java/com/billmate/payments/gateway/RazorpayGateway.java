package com.billmate.payments.gateway;

import com.billmate.payments.config.RazorpayProperties;
import com.billmate.payments.domain.Bill;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The real gateway: one HTTPS POST to {@code /v1/orders}.
 *
 * <p>This call cannot be made from the browser, because it authenticates with
 * the key secret. Anyone holding that secret can create and refund payments on
 * your account, so it stays on the server — never in a .js bundle, never in a
 * Thymeleaf template, never in git.
 */
public class RazorpayGateway implements PaymentGateway {

    private final RazorpayProperties properties;
    private final RestClient restClient;

    public RazorpayGateway(RazorpayProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        // basicAuth sends "Authorization: Basic base64(keyId:keySecret)" on every
        // request. Setting it once here means no call site can forget it.
        this.restClient = builder
                .baseUrl(properties.getApiBaseUrl())
                .defaultHeaders(headers -> headers.setBasicAuth(
                        properties.getKeyId(), properties.getKeySecret()))
                .build();
    }

    @Override
    public GatewayOrder createOrder(Bill bill, String receipt) {
        Map<String, Object> body = new LinkedHashMap<>();
        // Already paise — see Bill. Do not multiply again here.
        body.put("amount", bill.amountInPaise());
        body.put("currency", properties.getCurrency());
        body.put("receipt", receipt);
        // Your own metadata. It comes back on the payment and in the webhook,
        // which is what makes reconciliation possible later.
        body.put("notes", Map.of("billId", bill.id(), "billLabel", bill.label()));

        try {
            RazorpayOrderResponse response = restClient.post()
                    .uri("/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(RazorpayOrderResponse.class);

            if (response == null || response.id() == null) {
                throw new PaymentGatewayException("Razorpay returned an empty order");
            }
            return new GatewayOrder(response.id(), response.amount(), response.currency());
        } catch (RestClientException ex) {
            // Includes 4xx/5xx from Razorpay (bad keys, bad amount) and network errors.
            throw new PaymentGatewayException(
                    "Could not create the order with Razorpay: " + ex.getMessage(), ex);
        }
    }

    @Override
    public String publicKeyId() {
        return properties.getKeyId();
    }

    @Override
    public boolean isLive() {
        return true;
    }

    /**
     * Only the fields we use. Razorpay sends a dozen more; ignoring the unknown
     * ones means their adding a field tomorrow does not break this app.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record RazorpayOrderResponse(String id, long amount, String currency, String status) {
    }
}
