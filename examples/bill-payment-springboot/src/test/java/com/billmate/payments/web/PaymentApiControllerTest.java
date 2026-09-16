package com.billmate.payments.web;

import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.domain.PaymentMethod;
import com.billmate.payments.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The verify endpoint — the one an attacker would go after. */
@SpringBootTest
class PaymentApiControllerTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private PaymentService payments;

    @Autowired
    private ObjectMapper json;

    private MockMvc mockMvc() {
        return MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String body(String orderId, String paymentId, String signature) throws Exception {
        return json.writeValueAsString(Map.of(
                "razorpay_order_id", orderId,
                "razorpay_payment_id", paymentId,
                "razorpay_signature", signature));
    }

    @Test
    void acceptsACorrectlySignedPaymentAndReturnsTheSuccessUrl() throws Exception {
        PaymentAttempt attempt = payments.startPayment("electricity", PaymentMethod.UPI);
        String paymentId = "pay_sim_ok";

        mockMvc().perform(post("/api/payments/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(attempt.orderId(), paymentId,
                                payments.simulateSignature(attempt.orderId(), paymentId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verified").value(true))
                .andExpect(jsonPath("$.redirectUrl").value("/success/" + attempt.orderId()));
    }

    @Test
    void rejectsAnInventedSignature() throws Exception {
        PaymentAttempt attempt = payments.startPayment("electricity", PaymentMethod.UPI);

        mockMvc().perform(post("/api/payments/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(attempt.orderId(), "pay_forged", "0123456789abcdef")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.verified").value(false));
    }

    @Test
    void rejectsASignatureLiftedFromADifferentOrder() throws Exception {
        PaymentAttempt one = payments.startPayment("electricity", PaymentMethod.UPI);
        PaymentAttempt two = payments.startPayment("mobile", PaymentMethod.UPI);
        String paymentId = "pay_sim_replay";

        // A valid signature for the cheap bill, replayed against the dear one.
        String stolen = payments.simulateSignature(two.orderId(), paymentId);

        mockMvc().perform(post("/api/payments/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(one.orderId(), paymentId, stolen)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.verified").value(false));
    }

    @Test
    void rejectsAnEmptyBody() throws Exception {
        mockMvc().perform(post("/api/payments/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }
}
