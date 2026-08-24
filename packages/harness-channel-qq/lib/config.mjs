/**
 * config.mjs — harness-channel-qq 配置 schema 与校验
 *
 * QQ 走 OneBot v11（NapCat / Lagrange / LLOneBot）的 WebSocket 端点。
 * 配置集中在 `qq` settings namespace，供 client 配置页渲染。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** OneBot v11 端点支持 WS 正向（connect ws://）或反向（作为服务端）。此处用正向客户端。 */
export function defaults() {
  return {
    // OneBot WS 端点
    wsUrl: process.env.QQ_WS_URL || "ws://127.0.0.1:3001",
    token: process.env.QQ_WS_TOKEN || "",
    defaultWorkspace: process.env.QQ_DEFAULT_WORKSPACE || join(homedir(), "dsh", "default"),
    // 通用
    autoReply: true,
    streamReplies: true,
    toolCallReplies: true,
    stepTimeoutSec: 0,
    allowlist: [],
    routes: {},
  };
}

/** 对一份 settings 快照做宽松校验/归一化（非法值回退默认，不抛错）。 */
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

  const out = {
    ...base,
    wsUrl: pick("wsUrl", base.wsUrl),
    token: pick("token", base.token),
    defaultWorkspace: pick("defaultWorkspace", base.defaultWorkspace),
    autoReply: bool("autoReply", base.autoReply),
    streamReplies: bool("streamReplies", base.streamReplies),
    toolCallReplies: bool("toolCallReplies", base.toolCallReplies),
    stepTimeoutSec: num("stepTimeoutSec", base.stepTimeoutSec),
  };

  // routes: 目标 → workspace 路径
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

  // allowlist: 允许的 QQ 号/群号（字符串数组）
  if (Array.isArray(input.allowlist)) {
    out.allowlist = input.allowlist
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  return out;
}
