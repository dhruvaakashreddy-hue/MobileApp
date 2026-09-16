package com.billmate.payments.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SignatureVerifierTest {

    private final SignatureVerifier verifier = new SignatureVerifier();

    @Test
    void producesTheHmacRazorpayWouldProduce() {
        // A known HMAC-SHA256 vector: key "key", message "The quick brown fox
        // jumps over the lazy dog". If this ever changes, the algorithm or the
        // encoding is wrong, and every signature check would silently fail.
        String signature = verifier.sign("The quick brown fox jumps over the lazy dog", "key");

        assertThat(signature)
                .isEqualTo("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
    }

    @Test
    void matchesItsOwnSignature() {
        String payload = "order_ABC|pay_XYZ";

        assertThat(verifier.matches(payload, "secret", verifier.sign(payload, "secret"))).isTrue();
    }

    @Test
    void rejectsASignatureMadeWithADifferentSecret() {
        String payload = "order_ABC|pay_XYZ";
        String forged = verifier.sign(payload, "attackers-guess");

        assertThat(verifier.matches(payload, "secret", forged)).isFalse();
    }

    @Test
    void rejectsATamperedPayload() {
        String signature = verifier.sign("order_ABC|pay_XYZ", "secret");

        // Same signature, different order id — this is the attack the check exists for.
        assertThat(verifier.matches("order_OTHER|pay_XYZ", "secret", signature)).isFalse();
    }

    @Test
    void rejectsMissingAndMalformedSignatures() {
        String payload = "order_ABC|pay_XYZ";

        assertThat(verifier.matches(payload, "secret", null)).isFalse();
        assertThat(verifier.matches(payload, "secret", "")).isFalse();
        assertThat(verifier.matches(payload, "secret", "short")).isFalse();
    }
}
