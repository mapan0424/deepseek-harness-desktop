/**
 * client.js — harness-channel-wecom web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `wecomGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 企业微信 配置卡片。
 */
window.__ModuleLoader__.load({
  id: "@anarkhgatsby/deepseek-harness-channel-wecom",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const WECOMGATEWAY = "wecomGateway";

    class WecomClientService {
      constructor(ctx) {
        this.ctx = ctx;
        this.service = WECOMGATEWAY;
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
      wecom: {
        label: "企业微信",
        description: "开放 API。自建应用回调收 + 发送消息；需 corpId/agentId/corpSecret/callbackToken。",
        fields: ["corpId", "agentId", "corpSecret", "callbackToken"],
      },
    };

    function apply(ctx) {}

    exports.WECOMGATEWAY = WECOMGATEWAY;
    exports.WecomClientService = WecomClientService;
    exports.modeMeta = modeMeta;
    exports.apply = apply;
    exports.default = WecomClientService;

    return module.exports;
  },
});
