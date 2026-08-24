/**
 * client.js — harness-channel-dingtalk web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `dingtalkGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 钉钉 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const DINGTALKGATEWAY = "dingtalkGateway";

/** 前端路由到的 service locator。 */
export class DingtalkClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "dingtalkGateway");
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
  dingtalk: {
    label: "钉钉",
    description: "开放 API。企业内部应用机器人 + Stream/webhook 收；需 appKey/appSecret。",
    fields: ["appKey", "appSecret"],
  },
};

export default DingtalkClientService;
