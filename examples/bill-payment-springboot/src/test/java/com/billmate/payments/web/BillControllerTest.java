package com.billmate.payments.web;

import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.domain.PaymentMethod;
import com.billmate.payments.service.PaymentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.model;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

/**
 * The screens, driven through real HTTP handling but without a running server.
 *
 * <p>No Razorpay keys are set in the test context, so the app boots with the
 * simulated gateway — which is exactly how it boots on a fresh clone.
 */
@SpringBootTest
class BillControllerTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private PaymentService payments;

    private MockMvc mockMvc() {
        return MockMvcBuilders.webAppContextSetup(context).build();
    }

    @Test
    void theReminderScreenListsTheBills() throws Exception {
        mockMvc().perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(view().name("reminders"))
                .andExpect(content().string(containsString("Electricity bill")))
                .andExpect(content().string(containsString("1,840")));
    }

    @Test
    void theMethodSheetOffersUpiCardAndWallet() throws Exception {
        mockMvc().perform(get("/pay/electricity"))
                .andExpect(status().isOk())
                .andExpect(view().name("methods"))
                .andExpect(content().string(containsString("UPI")))
                .andExpect(content().string(containsString("Card")))
                .andExpect(content().string(containsString("Wallet")));
    }

    @Test
    void anUnknownBillIsA400NotA500() throws Exception {
        mockMvc().perform(get("/pay/not-a-bill"))
                .andExpect(status().isBadRequest())
                .andExpect(view().name("error"));
    }

    @Test
    void pickingAMethodCreatesAnOrderAndRedirectsToThePaymentPage() throws Exception {
        mockMvc().perform(post("/pay/electricity").param("method", "upi"))
                .andExpect(status().is3xxRedirection())
                // Post/Redirect/Get: refreshing the payment page cannot re-order.
                .andExpect(header().string("Location", containsString("/checkout/order_sim_")));
    }

    @Test
    void anUnknownMethodIsRejected() throws Exception {
        mockMvc().perform(post("/pay/electricity").param("method", "bitcoin"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void thePaymentPageNeverContainsTheKeySecret() throws Exception {
        PaymentAttempt attempt = payments.startPayment("broadband", PaymentMethod.CARD);

        String html = mockMvc().perform(get("/checkout/" + attempt.orderId()))
                .andExpect(status().isOk())
                .andExpect(view().name("checkout"))
                .andReturn().getResponse().getContentAsString();

        // The public key id is expected in the page; a secret never is.
        org.assertj.core.api.Assertions.assertThat(html).contains("rzp_test_simulated");
        org.assertj.core.api.Assertions.assertThat(html).doesNotContain("simulated_secret_not_for_production");
    }

    @Test
    void theSuccessPageRefusesToRenderForAnUnpaidOrder() throws Exception {
        PaymentAttempt attempt = payments.startPayment("mobile", PaymentMethod.UPI);

        // Guessing the URL must not produce a receipt. The page reads the stored
        // status, which only a verified signature can set.
        mockMvc().perform(get("/success/" + attempt.orderId()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/"));
    }

    @Test
    void theSuccessPageRendersOnceThePaymentIsVerified() throws Exception {
        PaymentAttempt attempt = payments.startPayment("mobile", PaymentMethod.UPI);
        String paymentId = "pay_sim_success";
        payments.completePayment(attempt.orderId(), paymentId,
                payments.simulateSignature(attempt.orderId(), paymentId));

        mockMvc().perform(get("/success/" + attempt.orderId()))
                .andExpect(status().isOk())
                .andExpect(view().name("success"))
                .andExpect(model().attributeExists("attempt"))
                .andExpect(content().string(containsString("Payment successful")))
                .andExpect(content().string(containsString(paymentId)));
    }

    @Test
    void thePaymentPageBouncesToTheReceiptIfTheBillIsAlreadyPaid() throws Exception {
        PaymentAttempt attempt = payments.startPayment("broadband", PaymentMethod.WALLET);
        String paymentId = "pay_sim_already";
        payments.completePayment(attempt.orderId(), paymentId,
                payments.simulateSignature(attempt.orderId(), paymentId));

        mockMvc().perform(get("/checkout/" + attempt.orderId()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/success/" + attempt.orderId()));
    }
}
