package com.billmate.payments.domain;

import java.util.Arrays;

/**
 * The three options shown in the sheet.
 *
 * <p>{@link #code} is the string Razorpay Checkout understands. Keeping it here
 * rather than scattering "upi" / "card" / "wallet" string literals through the
 * controllers means a typo becomes a compile error instead of a checkout that
 * silently opens on the wrong screen.
 */
public enum PaymentMethod {

    UPI("upi", "UPI", "GPay, PhonePe, Paytm — any UPI app", "📲"),
    CARD("card", "Card", "Debit or credit card", "💳"),
    WALLET("wallet", "Wallet", "Paytm, Mobikwik, Freecharge", "👛");

    private final String code;
    private final String label;
    private final String hint;
    private final String icon;

    PaymentMethod(String code, String label, String hint, String icon) {
        this.code = code;
        this.label = label;
        this.hint = hint;
        this.icon = icon;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    public String getHint() {
        return hint;
    }

    public String getIcon() {
        return icon;
    }

    /** Title of the single block shown in Checkout, e.g. "Pay by UPI". */
    public String getCheckoutBlockName() {
        return "Pay by " + label.toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * Turns the URL segment back into an enum constant.
     *
     * @throws IllegalArgumentException if the segment is not one of the three,
     *         which the controller advice below turns into a 400 rather than a 500
     */
    public static PaymentMethod fromCode(String code) {
        return Arrays.stream(values())
                .filter(method -> method.code.equalsIgnoreCase(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown payment method: " + code));
    }
}
