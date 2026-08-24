/**
 * client.js — harness-channel-slack web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `slackGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 Slack 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const SLACKGATEWAY = "slackGateway";

/** 前端路由到的 service locator。 */
export class SlackClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "slackGateway");
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
  slack: {
    label: "Slack",
    description: "Socket Mode（apps.connections.open）。需 botToken + appToken。",
    fields: ["botToken","appToken"],
  },
};

export default SlackClientService;
