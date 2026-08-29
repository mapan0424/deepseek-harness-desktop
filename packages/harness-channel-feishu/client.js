/**
 * client.js — harness-channel-feishu web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `feishuGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 飞书 配置卡片。
 */
window.__ModuleLoader__.load({
  id: "@anarkhgatsby/deepseek-harness-channel-feishu",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const FEISHUGATEWAY = "feishuGateway";

    class FeishuClientService {
      constructor(ctx) {
        this.ctx = ctx;
        this.service = FEISHUGATEWAY;
      }

      async call(method, payload) {
        const connection = this.ctx?.get?.("connection");
        if (!connection?.rpc) return undefined;
        const res = await connection.rpc.call("/api", `${this.service}/${method}`, {
          args: payload !== undefined ? { payload } : {},
        });
        return res?.ok ? res.value : res;
      }

      getConfig() {
        return this.call("getConfig");
      }

      setConfig(payload) {
        return this.call("setConfig", payload);
      }
    }

    const modeMeta = {
      feishu: {
        label: "飞书",
        description: "开放 API。应用事件订阅（webhook 收）+ 开放接口发消息。需创建企业自建应用拿 appId/appSecret/verifyToken。",
        fields: ["appId","appSecret","verifyToken","encryptKey"],
      },
    };

    function apply(ctx) {}

    exports.FEISHUGATEWAY = FEISHUGATEWAY;
    exports.FeishuClientService = FeishuClientService;
    exports.modeMeta = modeMeta;
    exports.apply = apply;
    exports.default = FeishuClientService;

    return module.exports;
  },
});
