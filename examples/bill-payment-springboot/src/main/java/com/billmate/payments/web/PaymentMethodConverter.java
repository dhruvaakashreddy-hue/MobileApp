package com.billmate.payments.web;

import com.billmate.payments.domain.PaymentMethod;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

/**
 * Lets a controller write {@code @PathVariable PaymentMethod method} and receive
 * an enum instead of a String.
 *
 * <p>Spring Boot picks up any {@code Converter} bean automatically and adds it
 * to the MVC conversion service. Converting at the edge means the rest of the
 * app only ever sees valid values.
 */
@Component
public class PaymentMethodConverter implements Converter<String, PaymentMethod> {

    @Override
    public PaymentMethod convert(String source) {
        return PaymentMethod.fromCode(source);
    }
}
