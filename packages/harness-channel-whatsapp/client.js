/**
 * client.js — harness-channel-whatsapp web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `whatsappGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 WhatsApp 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const WHATSAPPGATEWAY = "whatsappGateway";

/** 前端路由到的 service locator。 */
export class WhatsappClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "whatsappGateway");
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
  whatsapp: {
    label: "WhatsApp",
    description: "Meta Cloud API。Webhook 收 + Graph API 发。需 phoneNumberId + accessToken + verifyToken。",
    fields: ["phoneNumberId","accessToken","verifyToken"],
  },
};

export default WhatsappClientService;
