/**
 * config.mjs — harness-channel-whatsapp 配置 schema 与校验
 *
 * Meta Cloud API。Webhook 收 + Graph API 发。需 phoneNumberId + accessToken + verifyToken。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** 默认配置（可被环境变量覆盖）。 */
export function defaults() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
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
    phoneNumberId: pick("phoneNumberId", base.phoneNumberId),
    accessToken: pick("accessToken", base.accessToken),
    verifyToken: pick("verifyToken", base.verifyToken),
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

  // allowlist: 允许的目标（字符串数组）
  if (Array.isArray(input.allowlist)) {
    out.allowlist = input.allowlist
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  return out;
}
