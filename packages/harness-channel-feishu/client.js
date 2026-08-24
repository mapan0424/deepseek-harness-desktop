/**
 * client.js — harness-channel-feishu web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `feishuGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 飞书 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const FEISHUGATEWAY = "feishuGateway";

/** 前端路由到的 service locator。 */
export class FeishuClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "feishuGateway");
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
  feishu: {
    label: "飞书",
    description: "开放 API。应用事件订阅（webhook 收）+ 开放接口发消息。需创建企业自建应用拿 appId/appSecret/verifyToken。",
    fields: ["appId","appSecret","verifyToken","encryptKey"],
  },
};

export default FeishuClientService;
