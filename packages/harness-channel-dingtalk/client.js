/**
 * client.js — harness-channel-dingtalk web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `dingtalkGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 钉钉 配置卡片。
 */
window.__ModuleLoader__.load({
  id: "@anarkhgatsby/deepseek-harness-channel-dingtalk",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const DINGTALKGATEWAY = "dingtalkGateway";

    class DingtalkClientService {
      constructor(ctx) {
        this.ctx = ctx;
        this.service = DINGTALKGATEWAY;
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
      dingtalk: {
        label: "钉钉",
        description: "开放 API。企业内部应用机器人 + Stream/webhook 收；需 appKey/appSecret。",
        fields: ["appKey", "appSecret"],
      },
    };

    function apply(ctx) {}

    exports.DINGTALKGATEWAY = DINGTALKGATEWAY;
    exports.DingtalkClientService = DingtalkClientService;
    exports.modeMeta = modeMeta;
    exports.apply = apply;
    exports.default = DingtalkClientService;

    return module.exports;
  },
});
