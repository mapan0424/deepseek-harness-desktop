/**
 * client.js — harness-channel-imessage web client（Typert 配置页）
 *
 * 通过 Typert remote 调用 host 的 `imessageGateway`（getConfig/setConfig），
 * 在 dsh web UI 渲染三种模式（imsg / photon / relay）的配置卡片。
 * photon 模式额外提供 beginAuthorization（RFC 8628 device flow）触发入口。
 */
import {
  Remote,
  TypertRemoteServiceLocator,
} from "@deepseek-ai/dsh-typert-protocol";

/** 已注册的 remote 服务名（与 host MANIFEST 对应）。 */
export const IMESSAGE_GATEWAY = "imessageGateway";

export const MODES = ["imsg", "photon", "relay"];

/** 前端路由到的 service locator（用于触发 authorize、savePhone 等）。 */
export class ImessageClientService extends TypertRemoteServiceLocator {
  constructor(ctx) {
    super(ctx, IMESSAGE_GATEWAY);
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
  imsg: {
    label: "本地 imsg",
    description: "Mac + Messages.app + imsg CLI（JSON-RPC over stdio）。数据不出本机，需 Mac 与自动化/全盘访问授权。",
    fields: ["imsgCmd", "chatDb", "defaultWorkspace"],
  },
  photon: {
    label: "Photon 云端",
    description: "托管 iMessage 号码（hosted line），无需 Mac/SIM/Apple ID。RFC 8628 浏览器授权，开箱即用。v1 仅纯文本一对一。",
    fields: ["photonApiOrigin"],
    authFlow: "device",
  },
  relay: {
    label: "云中继",
    description: "Claw Messenger / Sendblue 等消息 API 中继。数据经第三方云，开箱即用、无需 Apple 设备。",
    fields: ["relayProvider", "relayApiBase"],
  },
};

export default ImessageClientService;
