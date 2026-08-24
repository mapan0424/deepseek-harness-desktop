/**
 * config.mjs — harness-channel-wecom 配置 schema 与校验
 *
 * 开放 API。自建应用回调收消息 + 发送接口发。需 corpId/agentId/corpSecret/callbackToken。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** 默认配置（可被环境变量覆盖）。 */
export function defaults() {
  return {
    corpId: process.env.WECOM_CORP_ID || "",
    agentId: process.env.WECOM_AGENT_ID || "",
    corpSecret: process.env.WECOM_CORP_SECRET || "",
    callbackToken: process.env.WECOM_CALLBACK_TOKEN || "",
    defaultWorkspace: process.env.DSH_CH_DEFAULT_WORKSPACE || join(homedir(), "dsh", "default"),
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
    corpId: pick("corpId", base.corpId),
    agentId: pick("agentId", base.agentId),
    corpSecret: pick("corpSecret", base.corpSecret),
    callbackToken: pick("callbackToken", base.callbackToken),
    defaultWorkspace: pick("defaultWorkspace", base.defaultWorkspace),
    autoReply: bool("autoReply", base.autoReply),
    streamReplies: bool("streamReplies", base.streamReplies),
    toolCallReplies: bool("toolCallReplies", base.toolCallReplies),
    stepTimeoutSec: num("stepTimeoutSec", base.stepTimeoutSec),
  };

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

  if (Array.isArray(input.allowlist)) {
    out.allowlist = input.allowlist
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  return out;
}
