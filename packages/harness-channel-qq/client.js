/**
 * client.js — harness-channel-qq web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `qqGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染 QQ（OneBot v11）配置卡片。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const QQ_GATEWAY = "qqGateway";

/** 前端路由到的 service locator（用于触发 authorize、savePhone 等）。 */
export class QQClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, QQ_GATEWAY);
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
  qq: {
    label: "QQ (OneBot v11)",
    description: "通过 NapCat / Lagrange / LLOneBot 的 WebSocket 端点收发。需本机/局域网跑一个 OneBot 实现，把 bot 接入 QQ。",
    fields: ["wsUrl", "token"],
  },
};

export default QQClientService;
