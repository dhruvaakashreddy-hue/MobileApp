package com.billmate.payments;

import com.billmate.payments.config.RazorpayProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * The entry point. Running this one main() method starts the whole app:
 * an embedded Tomcat on port 8080, Thymeleaf, and every @Component below it.
 *
 * @SpringBootApplication is three annotations in one:
 *   @Configuration      — this class can define beans
 *   @ComponentScan      — find @Component/@Service/@Controller in this package
 *                         and every package under it (that is why every class
 *                         here lives under com.billmate.payments)
 *   @EnableAutoConfiguration — look at what is on the classpath and wire up the
 *                         obvious things (web server, template engine, JSON)
 */
@SpringBootApplication
@EnableConfigurationProperties(RazorpayProperties.class)
public class BillPaymentApplication {

    public static void main(String[] args) {
        SpringApplication.run(BillPaymentApplication.class, args);
    }
}
