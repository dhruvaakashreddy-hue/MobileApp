package com.billmate.payments.web;

import com.billmate.payments.gateway.PaymentGatewayException;
import com.billmate.payments.service.PaymentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Renders a readable page instead of a stack trace when something goes wrong
 * on one of the HTML screens.
 *
 * <p>{@code assignableTypes} scopes this to {@link BillController}, so the JSON
 * endpoints keep returning JSON errors rather than a chunk of HTML that
 * {@code fetch()} could not parse.
 */
@ControllerAdvice(assignableTypes = BillController.class)
public class PageExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(PageExceptionHandler.class);

    /** Bad bill id, expired session — the user's request was wrong. */
    @ExceptionHandler({PaymentException.class, IllegalArgumentException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public String handleBadRequest(RuntimeException ex, Model model) {
        model.addAttribute("message", ex.getMessage());
        return "error";
    }

    /** Razorpay was unreachable or refused us — our problem, not theirs. */
    @ExceptionHandler(PaymentGatewayException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public String handleGateway(PaymentGatewayException ex, Model model) {
        log.error("Gateway call failed", ex);
        model.addAttribute("message",
                "We could not reach the payment provider. Nothing has been charged.");
        return "error";
    }
}
