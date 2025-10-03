import { AdminForthPlugin } from "adminforth";
import type { AdminForthResource, AdminUser, IAdminForth, IHttpServer, IAdminForthHttpResponse } from "adminforth";
import type { PluginOptions } from './types.js';



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
        loginPageInjections: { underInputs: [], panelHeader: [] }
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
    beforeLoginConfirmationArray.push(
      async({ extra }: { adminUser: AdminUser, response: IAdminForthHttpResponse, extra?: any} )=> {
        if ( !extra || !extra.cookies ) {
          return {
            body:{
              allowedLogin: false,
              redirectTo: '/login',
            },
            ok: true
          }
        }
        const cookies = extra.cookies;
        const token = cookies.find(
          (cookie) => cookie.key === `adminforth_${adapterName}_temporaryJWT`
        )?.value;
        if ( !token ) {
          return {
            body:{
              allowedLogin: false,
              redirectTo: '/login',
            },
            ok: true
          }
        }

        const ip = this.adminforth.auth.getClientIp(extra.headers);
        const validationResult = await this.options.captchaAdapter.validate(token, ip);
        console.log('Validation result:', validationResult);

        if (!validationResult || !validationResult.success) {
          return {
            body:{
              allowedLogin: false,
              redirectTo: '/login',
            },
            ok: true
          }
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
        const { token } = body;

        const adapter = this.options.captchaAdapter;
        const adapterName = adapter.constructor.name;    

        response.setHeader('Set-Cookie', `adminforth_${adapterName}_temporaryJWT=${token}; Path=${this.adminforth.config.baseUrl || '/'}; HttpOnly; SameSite=Strict; max-age=300; `);
        return { ok: true };
      }
    });
  }
}
