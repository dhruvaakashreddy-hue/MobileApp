package com.billmate.payments.service;

import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * HMAC-SHA256, the one piece of cryptography in this app.
 *
 * <p>Razorpay signs things with your key secret. Because only you and Razorpay
 * hold that secret, recomputing the signature and getting the same bytes proves
 * the message really came from Razorpay and was not edited on the way.
 */
@Component
public class SignatureVerifier {

    private static final String ALGORITHM = "HmacSHA256";

    /** The signature Razorpay should have produced for this payload. */
    public String sign(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            // Razorpay sends the signature as lowercase hex, so compare in that form.
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | java.security.InvalidKeyException ex) {
            throw new IllegalStateException("Could not compute the HMAC signature", ex);
        }
    }

    /**
     * Compares in constant time.
     *
     * <p>{@code String.equals} stops at the first differing character, so how
     * long it takes leaks how much of the signature was right — enough to guess
     * a valid one byte by byte. {@link MessageDigest#isEqual} always reads every
     * byte, so the timing tells an attacker nothing. Never use {@code equals}
     * on a secret or a signature.
     */
    public boolean matches(String payload, String secret, String providedSignature) {
        if (providedSignature == null) {
            return false;
        }
        byte[] expected = sign(payload, secret).getBytes(StandardCharsets.UTF_8);
        byte[] provided = providedSignature.trim().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, provided);
    }
}
