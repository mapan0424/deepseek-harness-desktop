/**
 * client.js — harness-channel-wecom web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `wecomGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 企业微信 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const WECOMGATEWAY = "wecomGateway";

/** 前端路由到的 service locator。 */
export class WecomClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "wecomGateway");
    this.ctx = ctx;
  }

  getConfig() {
    return this.call("getConfig");
  }

  setConfig(payload) {
    return this.call("setConfig", payload);
  }
}

/** 供页面在渲染前规范化字段默认值/枚举。 */
export const modeMeta = {
  wecom: {
    label: "企业微信",
    description: "开放 API。自建应用回调收 + 发送消息；需 corpId/agentId/corpSecret/callbackToken。",
    fields: ["corpId", "agentId", "corpSecret", "callbackToken"],
  },
};

export default WecomClientService;
