package com.billmate.payments.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * Everything configurable, bound from {@code application.yml} (which in turn
 * reads environment variables).
 *
 * <p>@ConfigurationProperties binds {@code razorpay.key-id} in YAML to the
 * {@code keyId} field here — relaxed binding, so KEY_ID, key-id and keyId all
 * land in the same place. Typed config beats {@code @Value("${...}")} scattered
 * across classes: one place to look, and the IDE autocompletes it.
 */
@ConfigurationProperties(prefix = "razorpay")
public class RazorpayProperties {

    /** PUBLIC key. Checkout needs it in the browser, so sending it there is fine. */
    private String keyId = "";

    /** SECRET key. Server only — it signs API calls and verifies signatures. */
    private String keySecret = "";

    /** A DIFFERENT secret, set in the dashboard when you create the webhook. */
    private String webhookSecret = "";

    private String apiBaseUrl = "https://api.razorpay.com/v1";

    private String currency = "INR";

    private String companyName = "BillMate";

    /**
     * With no keys the app starts in simulated mode so you can walk the whole
     * flow before signing up for anything. Real keys switch it off automatically.
     */
    public boolean isConfigured() {
        return StringUtils.hasText(keyId) && StringUtils.hasText(keySecret);
    }

    public String getKeyId() {
        return keyId;
    }

    public void setKeyId(String keyId) {
        this.keyId = keyId;
    }

    public String getKeySecret() {
        return keySecret;
    }

    public void setKeySecret(String keySecret) {
        this.keySecret = keySecret;
    }

    public String getWebhookSecret() {
        return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
        this.webhookSecret = webhookSecret;
    }

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public void setApiBaseUrl(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }
}
