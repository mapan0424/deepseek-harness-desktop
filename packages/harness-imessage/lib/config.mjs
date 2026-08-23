/**
 * config.mjs — harness-imessage 统一配置 schema 与校验
 *
 * 三种传输模式统一在同一 `imessage` settings namespace 下：
 *   - mode: "imsg"    本地 Mac + imsg CLI（JSON-RPC over stdio）
 *   - mode: "photon"  Photon 云端托管线路（RFC 8628 设备码授权）
 *   - mode: "relay"   云中继（Claw Messenger / Sendblue，消息 API 抽象）
 *
 * 各模式共享 base 开关；模式独有字段按需打开，前端对当前 mode 显示对应卡片。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** 导出供 client 渲染的模式列表与默认。 */
export const MODES = ["imsg", "photon", "relay"];
export const DEFAULT_MODE = "imsg";

/** 当前运行环境默认 imsg 命令与 chat.db 路径（网关以 root 运行时可用环境变量覆盖）。 */
export function defaults() {
  return {
    mode: DEFAULT_MODE,
    // imsg（本地）
    imsgCmd: process.env.IMSG_CMD || "imsg",
    chatDb: process.env.IMSG_CHAT_DB || join(homedir(), "Library/Messages/chat.db"),
    defaultWorkspace: process.env.IMSG_DEFAULT_WORKSPACE || join(homedir(), "dsh", "default"),
    // photon（云端）
    photonApiOrigin: process.env.DSH_IM_PHOTON_ORIGIN || "https://app.photon.codes",
    // relay（云中继）
    relayProvider: process.env.DSH_IM_RELAY_PROVIDER || "claw",
    relayApiBase: process.env.DSH_IM_RELAY_API_BASE || "",
    // 通用
    autoReply: true,
    streamReplies: true,
    toolCallReplies: true,
    stepTimeoutSec: 0,
    allowlist: [],
    routes: {},
  };
}

/**
 * 对一份 settings 快照做宽松校验/归一化。
 * 返回归一化对象；非法值回退默认，不抛错（前端已做基本校验兜底）。
 */
export function normalizeSettings(input) {
  const base = defaults();
  if (!input || typeof input !== "object") return base;

  const pick = (key, fallback) =>
    typeof input[key] === "string" && input[key].trim() ? input[key].trim() : fallback;
  const bool = (key, fallback) =>
    typeof input[key] === "boolean" ? input[key] : fallback;
  const num = (key, fallback) => {
    const n = Number(input[key]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const mode = MODES.includes(input.mode) ? input.mode : base.mode;

  const out = {
    ...base,
    mode,
    imsgCmd: pick("imsgCmd", base.imsgCmd),
    chatDb: pick("chatDb", base.chatDb),
    defaultWorkspace: pick("defaultWorkspace", base.defaultWorkspace),
    photonApiOrigin: pick("photonApiOrigin", base.photonApiOrigin),
    relayProvider: pick("relayProvider", base.relayProvider),
    relayApiBase: pick("relayApiBase", base.relayApiBase),
    autoReply: bool("autoReply", base.autoReply),
    streamReplies: bool("streamReplies", base.streamReplies),
    toolCallReplies: bool("toolCallReplies", base.toolCallReplies),
    stepTimeoutSec: num("stepTimeoutSec", base.stepTimeoutSec),
  };

  // routes: handle → workspace 路径
  if (input.routes && typeof input.routes === "object") {
    const routes = {};
    for (const [k, v] of Object.entries(input.routes)) {
      if (typeof v === "string" && v.trim()) {
        const key = typeof k === "string" ? k.trim() : String(k);
        if (key) routes[key] = v.trim();
      }
    }
    out.routes = routes;
  }

  // allowlist: 允许的用户/号码列表（字符串数组）
  if (Array.isArray(input.allowlist)) {
    out.allowlist = input.allowlist
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  return out;
}
