package com.billmate.payments.web;

import com.billmate.payments.config.RazorpayProperties;
import com.billmate.payments.service.PaymentService;
import com.billmate.payments.service.SignatureVerifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Razorpay calling us, rather than us calling Razorpay.
 *
 * <p>Why this exists: if the user pays and then closes the app before the
 * browser's verify call goes out, that call never happens and your database
 * still says unpaid while their money is gone. The webhook is how you find out
 * anyway. It is not optional in production.
 *
 * <p>Two details people get wrong:
 * <ol>
 *   <li>The signature covers the <strong>raw request body, byte for byte</strong>.
 *       Parsing to a Map and re-serialising changes the whitespace and the
 *       signature stops matching — so take the body as a String and parse it
 *       afterwards, as below.</li>
 *   <li>The webhook secret is a <strong>different</strong> secret from the API
 *       key secret. You choose it in the dashboard when creating the webhook.</li>
 * </ol>
 */
@RestController
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final PaymentService payments;
    private final SignatureVerifier verifier;
    private final RazorpayProperties properties;
    private final ObjectMapper objectMapper;

    public WebhookController(PaymentService payments,
                             SignatureVerifier verifier,
                             RazorpayProperties properties,
                             ObjectMapper objectMapper) {
        this.payments = payments;
        this.verifier = verifier;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/webhooks/razorpay")
    public ResponseEntity<String> receive(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {

        if (!StringUtils.hasText(properties.getWebhookSecret())) {
            log.warn("Webhook received but razorpay.webhook-secret is not set — ignoring it");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("not configured");
        }

        if (!verifier.matches(rawBody, properties.getWebhookSecret(), signature)) {
            log.warn("Webhook signature did not match — ignoring it");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("bad signature");
        }

        try {
            JsonNode root = objectMapper.readTree(rawBody);
            String event = root.path("event").asText();

            if ("payment.captured".equals(event)) {
                JsonNode entity = root.path("payload").path("payment").path("entity");
                String orderId = entity.path("order_id").asText();
                String paymentId = entity.path("id").asText();

                // markPaid is idempotent, so the browser's verify call having
                // already handled this payment costs nothing.
                payments.markPaidFromWebhook(orderId, paymentId).ifPresentOrElse(
                        attempt -> log.info("Webhook captured payment {} for order {}",
                                paymentId, orderId),
                        () -> log.warn("Webhook for an order we do not know: {}", orderId));
            }
        } catch (Exception ex) {
            log.error("Could not read the webhook body", ex);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("unreadable");
        }

        // Always 200 once the signature checks out. A non-2xx makes Razorpay
        // retry, and retrying a body you have already handled is pointless.
        return ResponseEntity.ok("ok");
    }
}
