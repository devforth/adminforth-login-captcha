import type { CaptchaAdapter, KeyValueAdapter, PluginsCommonOptions } from "adminforth";

export interface PluginOptions extends PluginsCommonOptions {
    captchaAdapter: CaptchaAdapter;

    /**
     * Optional key-value adapter used to record captcha tokens that have already been used for a
     * successful login, preventing them from being replayed.
     *
     * Captcha tokens stay valid at the provider for a short window, so the same token could
     * otherwise be submitted several times. When this adapter is provided, each token is stored
     * after it is first consumed and any subsequent login attempt with the same token is rejected.
     *
     * When omitted, tokens are only validated against the captcha provider (previous behaviour).
     */
    keyValueAdapter?: KeyValueAdapter;

    /**
     * How long (in seconds) a used captcha token is remembered in the key-value store. Should be at
     * least as long as the captcha provider keeps the token valid. Only used when `keyValueAdapter`
     * is provided. Defaults to 300 (5 minutes).
     */
    tokenTimeToLiveSeconds?: number;
}
