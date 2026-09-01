/**
 * config.mjs — harness-imessage 统一配置 schema 与校验
 *
 * iMessage 仅使用本机 `local` 传输：chat.db 监听 + Messages.app（无 CLI、无云中继）。
 * 配置保留 mode 字段用于兼容已有 settings，但唯一允许的值是 "local"。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** 导出供 client 渲染的模式列表与默认。 */
export const MODES = ["local"];
export const DEFAULT_MODE = "local";

/** 当前运行环境默认 chat.db 路径（网关以 root 运行时可用环境变量覆盖）。 */
export function defaults() {
  return {
    mode: DEFAULT_MODE,
    // local（本机）
    chatDb: process.env.IMSG_CHAT_DB || join(homedir(), "Library/Messages/chat.db"),
    defaultWorkspace: process.env.IMSG_DEFAULT_WORKSPACE || join(homedir(), "dsh", "default"),
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
    chatDb: pick("chatDb", base.chatDb),
    defaultWorkspace: pick("defaultWorkspace", base.defaultWorkspace),
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
