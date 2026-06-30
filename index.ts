import { AdminForthPlugin } from "adminforth";
import type { AdminForthResource, AdminUser, IAdminForth, IHttpServer, IAdminForthHttpResponse } from "adminforth";
import type { PluginOptions } from './types.js';
import { z } from "zod";

const setTokenBodySchema = z.object({
  token: z.string(),
}).strict();

export default class CaptchaPlugin extends AdminForthPlugin {
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  private parseBody<T>(
    schema: z.ZodType<T>,
    body: unknown,
    response: { setStatus: (code: number, message: string) => void },
  ): { ok: true; data: T } | { ok: false; error: { error: string; details: unknown } } {
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      response.setStatus(400, '');
      return {
        ok: false,
        error: { error: 'Request body validation failed', details: parsed.error.issues },
      };
    }
    return { ok: true, data: parsed.data };
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

    const beforeLoginConfirmation = this.adminforth.config.auth.beforeLoginConfirmation;
    const beforeLoginConfirmationArray = Array.isArray(beforeLoginConfirmation) ? beforeLoginConfirmation : [beforeLoginConfirmation];
    beforeLoginConfirmationArray.unshift(
      async({ extra }: { adminUser: AdminUser, response: IAdminForthHttpResponse, extra?: any} )=> {
        const rejectResult = {
          body:{
            allowedLogin: false,
            redirectTo: '/login',
          },
          ok: true
        };

        if ( !extra || !extra.cookies ) {
          return rejectResult;
        }
        const cookies = extra.cookies;
        const token = cookies.find(
          (cookie) => cookie.key === `adminforth_${adapterName}_temporaryJWT`
        )?.value;
        if ( !token ) {
          return rejectResult;
        }

        const ip = this.adminforth.auth.getClientIp(extra.headers);
        const validationResult = await this.options.captchaAdapter.validate(token, ip);
        if (!validationResult || !validationResult.success) {
          return rejectResult;
        }
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
      handler: async ({ body, response }) => {
        const parsed = this.parseBody(setTokenBodySchema, body, response);
        if ('error' in parsed) return parsed.error;
        const data = parsed.data;
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
