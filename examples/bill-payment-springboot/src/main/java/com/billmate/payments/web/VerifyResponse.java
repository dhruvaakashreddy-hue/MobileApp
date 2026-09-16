package com.billmate.payments.web;

/**
 * The answer the browser waits for before showing anything.
 *
 * @param verified    true only if the server recomputed the signature and it matched
 * @param redirectUrl where the browser should go next — the success page
 * @param error       why it failed, safe to show to the user
 */
public record VerifyResponse(boolean verified, String redirectUrl, String error) {

    public static VerifyResponse success(String redirectUrl) {
        return new VerifyResponse(true, redirectUrl, null);
    }

    public static VerifyResponse failure(String error) {
        return new VerifyResponse(false, null, error);
    }
}
