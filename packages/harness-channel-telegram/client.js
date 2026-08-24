/**
 * client.js — harness-channel-telegram web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `telegramGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 Telegram 配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const TELEGRAMGATEWAY = "telegramGateway";

/** 前端路由到的 service locator。 */
export class TelegramClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, "telegramGateway");
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
  telegram: {
    label: "Telegram",
    description: "Bot API 长轮询。官方开放，最简单。需 BotFather 创建 bot 拿 token。",
    fields: ["token"],
  },
};

export default TelegramClientService;
