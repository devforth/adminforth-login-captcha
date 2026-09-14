import { AdminForthPlugin } from "adminforth";
import type { AdminForthResource, BeforeLoginAttemptFunction, IAdminForth, IHttpServer } from "adminforth";
import type { PluginOptions } from './types.js';
import { z } from "zod";

const DEFAULT_TOKEN_TTL_SECONDS = 300;
const KV_COLLECTION = 'adminforth_login_captcha';

const setTokenBodySchema = z.object({
  token: z.string(),
}).strict();

export default class CaptchaPlugin extends AdminForthPlugin {
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
    if (!adminforth.config.customization?.loginPageInjections) {
      adminforth.config.customization = {
        ...adminforth.config.customization,
        loginPageInjections: { underInputs: [], underLoginButton: [], panelHeader: [] }
      };
    };

    const adapter = this.options.captchaAdapter;
    const adapterName = adapter.constructor.name;    

    adminforth.config.customization.loginPageInjections.underInputs.push({
      file: this.componentPath('CaptchaWidget.vue'),
      meta: {
        containerId: this.options.captchaAdapter.getWidgetId(),
        adapterName: adapterName,
        renderWidgetFunctionName: this.options.captchaAdapter.getRenderWidgetFunctionName(),
        siteKey: this.options.captchaAdapter.getSiteKey(),
        pluginInstanceId: this.pluginInstanceId
      }
    });
 
    if (!adminforth.config.customization?.customHeadItems) {
      adminforth.config.customization.customHeadItems = [];
    }
    adminforth.config.customization.customHeadItems.push(
      {
        tagName: 'script',
        attributes: { src: this.options.captchaAdapter.getScriptSrc(), async: 'true', defer: 'true' }
      },
      {
        tagName: 'script',
        attributes: { type: 'text/javascript' },
        innerCode: this.options.captchaAdapter.getRenderWidgetCode()
      }
    );

    const beforeLoginAttempt = this.adminforth.config.auth.beforeLoginAttempt as BeforeLoginAttemptFunction[];
    if (!beforeLoginAttempt) {
      throw new Error('Captcha plugin requires AdminForth which supports auth.beforeLoginAttempt hook, please update adminforth package');
    }
    // captcha is checked before credentials are looked up in database, so login attempt without
    // solved captcha is rejected in the same way for any username and password
    beforeLoginAttempt.unshift(
      async ({ extra, tr }) => {
        const reject = async () => ({ ok: false, error: await tr('Captcha verification failed', 'errors') });

        const token = extra.cookies.find(
          (cookie) => cookie.key === `adminforth_${adapterName}_temporaryJWT`
        )?.value;
        if (!token) {
          return reject();
        }

        // Reject tokens which were already spent by a previous login attempt. Captcha tokens
        // stay valid at the provider for a short window, so without this check the same token could
        // be replayed multiple times.
        if (this.options.keyValueAdapter) {
          const alreadyUsed = await this.options.keyValueAdapter.get(token, KV_COLLECTION);
          if (alreadyUsed) {
            return reject();
          }
        }

        const ip = this.adminforth.auth.getClientIp(extra.headers);
        const validationResult = await this.options.captchaAdapter.validate(token, ip);
        if (!validationResult || !validationResult.success) {
          return reject();
        }

        // Mark the token as spent, so one solved captcha allows exactly one login attempt.
        if (this.options.keyValueAdapter) {
          const ttlSeconds = this.options.tokenTimeToLiveSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
          await this.options.keyValueAdapter.set(token, 'used', ttlSeconds, KV_COLLECTION);
        }

        return { ok: true };
      }
    );
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    const adapter = this.options.captchaAdapter;
    const adapterName = adapter.constructor.name;  
    return `CaptchaPlugin-${adapterName}-${this.options.captchaAdapter.getSiteKey()}`;
  }

  setupEndpoints(server: IHttpServer) {
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/setToken`,
      noAuth: true,
      request_schema: setTokenBodySchema,
      handler: async ({ body, response }) => {
        const data = body as z.infer<typeof setTokenBodySchema>;
        const { token } = data;

        if (!token) {
          return { ok: false, error: 'Token is required' };
        }

        const adapter = this.options.captchaAdapter;
        const adapterName = adapter.constructor.name;

        response.setHeader('Set-Cookie', `adminforth_${adapterName}_temporaryJWT=${token}; Path=${this.adminforth.config.baseUrl || '/'}; HttpOnly; SameSite=Strict; max-age=300; `);
        return { ok: true };
      }
    });
  }
}
