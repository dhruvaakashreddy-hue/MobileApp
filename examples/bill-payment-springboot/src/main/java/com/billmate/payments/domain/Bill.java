package com.billmate.payments.domain;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * A bill the user is being reminded about.
 *
 * <p>The amount is stored in <strong>paise</strong>, not rupees, and as a
 * {@code long}, not a {@code double}. Both choices matter:
 *
 * <ul>
 *   <li>Razorpay charges in the smallest currency unit, so ₹1,840 is 184000.
 *       Sending 1840 charges ₹18.40 — the single most common first-timer bug.</li>
 *   <li>{@code double} cannot hold 0.1 exactly. Money in floating point
 *       eventually produces a ₹0.01 discrepancy that nobody can explain.</li>
 * </ul>
 *
 * @param id           stable identifier; this is the only thing the browser sends
 * @param label        what the user sees, e.g. "Electricity bill"
 * @param dueIn        human text for the reminder line, e.g. "Due in 2 days"
 * @param amountInPaise the price, owned by the server
 */
public record Bill(String id, String label, String dueIn, long amountInPaise) {

    private static final Locale INDIA = Locale.forLanguageTag("en-IN");

    /** 184000 paise -> "1,840", with Indian digit grouping. */
    public String formattedAmount() {
        return formatPaise(amountInPaise);
    }

    /** Shared by anything holding an amount in paise, such as PaymentAttempt. */
    public static String formatPaise(long paise) {
        NumberFormat format = NumberFormat.getIntegerInstance(INDIA);
        return format.format(paise / 100);
    }
}
