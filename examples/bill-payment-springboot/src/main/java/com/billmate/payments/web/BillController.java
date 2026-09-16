package com.billmate.payments.web;

import com.billmate.payments.config.RazorpayProperties;
import com.billmate.payments.domain.Bill;
import com.billmate.payments.domain.PaymentAttempt;
import com.billmate.payments.domain.PaymentMethod;
import com.billmate.payments.service.PaymentException;
import com.billmate.payments.service.PaymentService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * The four screens, in the order the user meets them.
 *
 * <pre>
 *   GET  /                      reminders — every bill with a "Pay now" button
 *   GET  /pay/{billId}          the UPI / Card / Wallet sheet
 *   POST /pay/{billId}          creates the order, redirects to the payment page
 *   GET  /checkout/{orderId}    the payment page — opens Razorpay Checkout
 *   GET  /success/{orderId}     "Payment successful"
 * </pre>
 *
 * <p>@Controller (not @RestController) means the String each method returns is
 * the name of a Thymeleaf template in {@code resources/templates}. Whatever is
 * put in the {@link Model} is what the template can read.
 */
@Controller
public class BillController {

    private final PaymentService payments;
    private final RazorpayProperties properties;

    public BillController(PaymentService payments, RazorpayProperties properties) {
        this.payments = payments;
        this.properties = properties;
    }

    /** Screen 1 — the reminder list. */
    @GetMapping("/")
    public String reminders(Model model) {
        model.addAttribute("bills", payments.allBills());
        model.addAttribute("live", payments.isLive());
        model.addAttribute("companyName", properties.getCompanyName());
        return "reminders";
    }

    /** Screen 2 — the payment method sheet. */
    @GetMapping("/pay/{billId}")
    public String methods(@PathVariable String billId, Model model) {
        Bill bill = payments.findBill(billId)
                .orElseThrow(() -> new PaymentException("Unknown bill: " + billId));

        model.addAttribute("bill", bill);
        // The enum is the single source of truth for the three options, so the
        // sheet cannot drift out of sync with what the server accepts.
        model.addAttribute("methods", PaymentMethod.values());
        return "methods";
    }

    /**
     * The user picked a method.
     *
     * <p>This creates the Razorpay order and then <strong>redirects</strong>.
     * Redirecting after a POST (rather than rendering) means a refresh on the
     * payment page does not create a second order — the Post/Redirect/Get
     * pattern, and the reason a double-click here cannot double-charge.
     */
    @PostMapping("/pay/{billId}")
    public String startPayment(@PathVariable String billId,
                               @RequestParam("method") PaymentMethod method) {
        PaymentAttempt attempt = payments.startPayment(billId, method);
        return "redirect:/checkout/" + attempt.orderId();
    }

    /** Screen 3 — the payment page that hands off to Razorpay Checkout. */
    @GetMapping("/checkout/{orderId}")
    public String checkout(@PathVariable String orderId, Model model) {
        PaymentAttempt attempt = payments.findAttempt(orderId)
                .orElseThrow(() -> new PaymentException("That payment session has expired"));

        // Already paid — someone hit Back. Send them to the receipt, not to a
        // second checkout for a bill they have settled.
        if (attempt.isPaid()) {
            return "redirect:/success/" + orderId;
        }

        model.addAttribute("attempt", attempt);
        model.addAttribute("keyId", payments.publicKeyId());   // public key only
        model.addAttribute("companyName", properties.getCompanyName());
        model.addAttribute("live", payments.isLive());
        return "checkout";
    }

    /**
     * Screen 4 — the receipt.
     *
     * <p>It renders from the stored status, not from anything in the URL. Typing
     * this address by hand for an unpaid order bounces you back to the
     * reminders: the page cannot be faked into saying a bill was paid.
     */
    @GetMapping("/success/{orderId}")
    public String success(@PathVariable String orderId, Model model) {
        PaymentAttempt attempt = payments.findAttempt(orderId).orElse(null);
        if (attempt == null || !attempt.isPaid()) {
            return "redirect:/";
        }

        model.addAttribute("attempt", attempt);
        model.addAttribute("companyName", properties.getCompanyName());
        return "success";
    }
}
