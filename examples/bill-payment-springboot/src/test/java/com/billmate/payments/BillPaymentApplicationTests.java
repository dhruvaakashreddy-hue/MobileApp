package com.billmate.payments;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Starts the whole Spring context.
 *
 * <p>It looks like it asserts nothing, but it catches most wiring mistakes: a
 * missing bean, two beans of the same type, a bad @ConfigurationProperties key.
 * The test fails because the context fails to start.
 */
@SpringBootTest
class BillPaymentApplicationTests {

    @Test
    void contextLoads() {
    }
}
