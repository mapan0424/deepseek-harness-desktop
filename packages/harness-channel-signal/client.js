/**
 * client.js — harness-channel-signal web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `signalGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 Signal 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const SIGNALGATEWAY = "signalGateway";

/** 前端路由到的 service locator。 */
export class SignalClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "signalGateway");
    this.ctx = ctx;
  }

  /** 读取当前配置快照。 */
  getConfig() {
    return this.call("getConfig");
  }

  /** 保存配置整体快照。 */
  setConfig(payload) {
    return this.call("setConfig", payload);
  }
}

/** 供页面在渲染前规范化字段默认值/枚举。 */
export const modeMeta = {
  signal: {
    label: "Signal",
    description: "signal-cli（JSON-RPC，本地类，同 imsg 路线）。需本机装 signal-cli + 已注册号码。",
    fields: ["signalCliCmd","signalAccount","dbPath"],
  },
};

export default SignalClientService;
