import type { CaptchaAdapter, PluginsCommonOptions } from "adminforth";

export interface PluginOptions extends PluginsCommonOptions {
    captchaAdapter: CaptchaAdapter;
}
