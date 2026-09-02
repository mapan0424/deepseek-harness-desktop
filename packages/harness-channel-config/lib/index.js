/**
 * index.js — harness-channel-config host 入口
 *
 * 通道配置总览：汇总所有已安装 channel 插件（feishu/imessage/telegram/...）的
 * settings namespace 与 gateway 状态文件，向 client（浏览器设置页）暴露只读状态
 * 与写回能力。
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export const name = "harness-channel-config";

export const inject = ["typert", "settings"];

export const Config = z.object({
  settingsPath: z.string().default(join(homedir(), ".dsh", "settings.yaml")),
  stateDir: z.string().default(join(homedir(), ".dsh")),
});

/** 已知通道：显示名、settings 段名、状态文件后缀、图标颜色、能力标签与配置字段描述。 */
const CHANNELS = [
  {
    id: "feishu",
    label: "飞书",
    verified: true,
    section: "feishu",
    stateFile: "feishu-gateway-state.json",
    color: "#3370ff",
    desc: "企业自建应用，支持富文本卡片交互、打字机流式输出与群聊/私聊回复。",
    tags: ["卡片交互", "流式打字", "多媒体附件"],
    guide: "登录飞书开放平台创建企业自建应用，开启机器人能力，获取 App ID 与 App Secret。",
    fields: [
      { key: "appId", label: "App ID", type: "text", required: true, placeholder: "cli_a93f15..." },
      { key: "appSecret", label: "App Secret", type: "password", required: true, placeholder: "iaESkQ8Q..." },
      { key: "verifyToken", label: "Verification Token", type: "password", required: false, placeholder: "可选事件校验 Token" },
      { key: "encryptKey", label: "Encrypt Key", type: "password", required: false, placeholder: "可选事件加密 Key" },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "cardReplies", label: "卡片格式回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "imessage",
    label: "iMessage",
    verified: true,
    section: "imessage",
    stateFile: "imessage-gateway-state.json",
    color: "#34C759",
    desc: "macOS 原生 AppleScript + chat.db 监听，支持本地直连无中转收发 iMessage 短信。",
    tags: ["本地原生", "chat.db直连", "零第三方中转"],
    guide: "利用 macOS 本地信息数据库与 AppleScript 直接与系统「信息」应用协同，无需第三方云端中转。",
    fields: [
      { key: "chatDb", label: "chat.db 路径", type: "text", required: false, placeholder: "~/Library/Messages/chat.db" },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    section: "telegram",
    stateFile: "telegram-gateway-state.json",
    color: "#2AABEE",
    desc: "Bot API 长轮询接入，支持私聊、群组话题与流式消息编辑回复。",
    tags: ["Bot API", "长轮询", "全球接入"],
    guide: "在 Telegram 中联系 @BotFather 创建机器人并获取 API Token。",
    fields: [
      { key: "token", label: "Bot Token", type: "password", required: true, placeholder: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..." },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    section: "discord",
    stateFile: "discord-gateway-state.json",
    color: "#5865F2",
    desc: "Discord Bot 网关接入，支持公会频道监听、私聊、斜杠指令与富媒体交互。",
    tags: ["WebSocket网关", "公会频道", "Slash指令"],
    guide: "登录 Discord Developer Portal 创建 Application 并添加 Bot，开启 Message Content Intent 获取 Token。",
    fields: [
      { key: "token", label: "Bot Token", type: "password", required: true, placeholder: "MTE0Nz..." },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    section: "slack",
    stateFile: "slack-gateway-state.json",
    color: "#E01E5A",
    desc: "Slack App 事件订阅与 Socket 模式，支持 Block Kit 布局与企业协作频道。",
    tags: ["Block Kit", "Socket Mode", "企业协作"],
    guide: "在 api.slack.com 创建 Slack App，配置 Bot Token (xoxb-) 与 App Token (xapp-)。",
    fields: [
      { key: "botToken", label: "Bot Token (xoxb-)", type: "password", required: true, placeholder: "xoxb-..." },
      { key: "appToken", label: "App Token (xapp-)", type: "password", required: false, placeholder: "xapp-... (Socket 模式)" },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "dingtalk",
    label: "钉钉",
    section: "dingtalk",
    stateFile: "dingtalk-gateway-state.json",
    color: "#007FFF",
    desc: "钉钉企业内部应用与机器人，支持 Stream 长连接推送与 Markdown 消息渲染。",
    tags: ["Stream长连", "企业内部应用", "Markdown"],
    guide: "登录钉钉开发者后台创建企业内部应用，开启机器人功能，获取 Client ID (AppKey) 与 Client Secret。",
    fields: [
      { key: "appKey", label: "Client ID (AppKey)", type: "text", required: true, placeholder: "ding..." },
      { key: "appSecret", label: "Client Secret", type: "password", required: true, placeholder: "AppSecret..." },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "wecom",
    label: "企业微信",
    verified: true,
    section: "wecom",
    stateFile: "wecom-gateway-state.json",
    color: "#0082EF",
    desc: "企业微信智能机器人，支持 WebSocket 长连接模式出站直连，无需公网 IP 与消息加解密。",
    tags: ["智能机器人", "WS长连", "免加解密"],
    guide: "在企业微信管理后台 → 工作台 → 智能机器人 → API 模式创建机器人，连接方式选择「使用长连接」，获取 Bot ID 与 Secret，并确保可见范围包含使用成员。",
    fields: [
      { key: "botId", label: "Bot ID", type: "text", required: true, placeholder: "aibS9-..." },
      { key: "secret", label: "Secret", type: "password", required: true, placeholder: "0Y3UNb..." },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
      { key: "streamReplies", label: "流式打字输出", type: "boolean", default: true },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    section: "whatsapp",
    stateFile: "whatsapp-gateway-state.json",
    color: "#25D366",
    desc: "Meta Cloud API 官方渠道，支持全球 WhatsApp 用户与 Webhook 交互。",
    tags: ["Cloud API", "Meta官方", "跨平台"],
    guide: "在 Meta for Developers 创建 WhatsApp Business 应用，获取 Phone Number ID 与 System User Access Token。",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", type: "text", required: true, placeholder: "10065..." },
      { key: "accessToken", label: "Access Token", type: "password", required: true, placeholder: "EAAB..." },
      { key: "verifyToken", label: "Webhook Verify Token", type: "password", required: false, placeholder: "VerifyToken" },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
    ],
  },
  {
    id: "signal",
    label: "Signal",
    section: "signal",
    stateFile: "signal-gateway-state.json",
    color: "#3A76F0",
    desc: "基于 signal-cli 的端到端加密消息渠道，极致保障私密性。",
    tags: ["端到端加密", "Privacy-first", "signal-cli"],
    guide: "在本地安装并注册 signal-cli 账户后，配置注册的电话号码即可接入。",
    fields: [
      { key: "signalAccount", label: "Signal 注册号码", type: "text", required: true, placeholder: "+8613800138000" },
      { key: "signalCliCmd", label: "signal-cli 命令", type: "text", required: false, placeholder: "signal-cli" },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
    ],
  },
  {
    id: "qq",
    label: "QQ",
    section: "qq",
    stateFile: "qq-gateway-state.json",
    color: "#12B7F5",
    desc: "QQ 开放平台机器人接入，支持 QQ 频道与私聊对话。",
    tags: ["QQ开放平台", "官方Bot", "频道/私聊"],
    guide: "登录 QQ 开放平台创建机器人，获取 App ID 与 Token / Secret。",
    fields: [
      { key: "appId", label: "机器人 App ID", type: "text", required: true, placeholder: "1020..." },
      { key: "token", label: "机器人 Token", type: "password", required: true, placeholder: "Token..." },
      { key: "secret", label: "机器人 App Secret", type: "password", required: false, placeholder: "Secret..." },
      { key: "defaultWorkspace", label: "工作空间路径", type: "text", required: false, placeholder: "~/dsh/default" },
      { key: "autoReply", label: "自动回复", type: "boolean", default: true },
    ],
  },
];

/** 严谨判定通道是否「真正已配置」有效凭证。 */
function isChannelConfigured(id, cfg, sessions) {
  if (sessions > 0) return true;
  if (!cfg || typeof cfg !== "object") return false;
  switch (id) {
    case "feishu":
      return Boolean(cfg.appId && String(cfg.appId).trim() && cfg.appSecret && String(cfg.appSecret).trim());
    case "imessage":
      // 本地模式没有云端凭证；是否可用由 chat.db 权限状态单独检查。
      return false;
    case "telegram":
      return Boolean(cfg.token && String(cfg.token).trim());
    case "discord":
      return Boolean(cfg.token && String(cfg.token).trim());
    case "slack":
      return Boolean((cfg.botToken && String(cfg.botToken).trim()) || (cfg.appToken && String(cfg.appToken).trim()));
    case "whatsapp":
      return Boolean(cfg.phoneNumberId && String(cfg.phoneNumberId).trim() && cfg.accessToken && String(cfg.accessToken).trim());
    case "signal":
      return Boolean(cfg.signalAccount && String(cfg.signalAccount).trim());
    case "dingtalk":
      return Boolean(cfg.appKey && String(cfg.appKey).trim() && cfg.appSecret && String(cfg.appSecret).trim());
    case "wecom":
      return Boolean(cfg.botId && String(cfg.botId).trim() && cfg.secret && String(cfg.secret).trim());
    case "qq":
      return Boolean((cfg.appId && String(cfg.appId).trim()) || (cfg.token && String(cfg.token).trim()));
    default:
      return false;
  }
}

function expandHomePath(value) {
  const path = typeof value === "string" && value.trim() ? value.trim() : join(homedir(), "Library/Messages/chat.db");
  return path.replace(/^~(?=\/|$)/, homedir());
}

function inspectImessageStatus(cfg) {
  const chatDb = expandHomePath(cfg?.chatDb);
  try {
    const db = new DatabaseSync(chatDb);
    db.prepare("SELECT MAX(ROWID) AS maxRow FROM message").get();
    db.close();
    return {
      statusCode: "ready",
      databaseReadable: true,
      statusMessage: "chat.db 读取权限已授予；自动化权限会在首次发送回复时验证。",
    };
  } catch {
    return {
      statusCode: "authorization-required",
      databaseReadable: false,
      statusMessage: "无法读取 chat.db，需要开启完全磁盘访问；同时需要允许自动化控制“信息”应用。",
    };
  }
}

// ── Typert wire schemas ───────────────────────────────────────────────────
function parseObj() {
  return {
    parse(value) {
      if (typeof value !== "object" || value === null) throw new Error("expected object");
      return value;
    },
  };
}
const listResultSchema = parseObj();
const savePayloadSchema = parseObj();
const saveResultSchema = parseObj();

/** Typert MANIFEST：注册给 API gateway 的远程方法。 */
const MANIFEST = {
  package: "harness-channel-config",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "harness-channel-config#channelConfig/list",
      service: "channelConfig",
      namespace: "channelConfig",
      method: "list",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "strict", typeSymbol: "harness-channel-config#ChannelList", schema: listResultSchema },
    },
    {
      id: "harness-channel-config#channelConfig/save",
      service: "channelConfig",
      namespace: "channelConfig",
      method: "save",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "harness-channel-config#SavePayload", schema: savePayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "harness-channel-config#SaveResult", schema: saveResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

/** 读取 settings.yaml 的通道段（真实落盘配置）。 */
async function readSettingsSection(settingsPath, section) {
  try {
    const raw = await readFile(settingsPath, "utf8");
    const lines = raw.split("\n");
    const out = {};
    let inSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = line.length - line.trimStart().length;
      if (indent === 0 && trimmed.endsWith(":")) {
        inSection = trimmed.slice(0, -1).trim() === section;
        continue;
      }
      if (inSection && indent >= 2) {
        const m = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (m) {
          const v = m[2].trim();
          if (v === "true") out[m[1]] = true;
          else if (v === "false") out[m[1]] = false;
          else if (/^-?\d+(\.\d+)?$/.test(v)) out[m[1]] = Number(v);
          else if (v.startsWith("[") || v.startsWith("{")) { try { out[m[1]] = JSON.parse(v); } catch { out[m[1]] = v; } }
          else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) out[m[1]] = v.slice(1, -1);
          else out[m[1]] = v;
        }
      } else if (inSection && indent < 2) {
        break;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 写入 settings.yaml 指定通道段（安全替换）。 */
async function writeSettingsSection(settingsPath, section, sectionData) {
  let raw = "";
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch {
    raw = "";
  }
  const lines = raw.split("\n");
  const newSectionLines = [`${section}:`];
  for (const [k, v] of Object.entries(sectionData)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean" || typeof v === "number") {
      newSectionLines.push(`  ${k}: ${v}`);
    } else if (typeof v === "string") {
      newSectionLines.push(`  ${k}: ${JSON.stringify(v)}`);
    } else if (Array.isArray(v) || typeof v === "object") {
      newSectionLines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  const outLines = [];
  let inSection = false;
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (indent === 0 && trimmed.endsWith(":") && trimmed.slice(0, -1).trim() === section) {
      inSection = true;
      replaced = true;
      outLines.push(...newSectionLines);
      continue;
    }
    if (inSection) {
      if (indent >= 2) continue;
      inSection = false;
    }
    outLines.push(line);
  }

  if (!replaced) {
    if (outLines.length > 0 && outLines[outLines.length - 1].trim() !== "") {
      outLines.push("");
    }
    outLines.push(...newSectionLines);
  }

  await writeFile(settingsPath, outLines.join("\n"), "utf8");
}

/** 读取 gateway 状态文件：sender→session 映射。 */
async function readStateFile(stateDir, fileName) {
  try {
    const parsed = JSON.parse(await readFile(join(stateDir, fileName), "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

class ChannelConfigService extends TypertRemoteService {
  constructor(ctx, config) {
    super(ctx, "channelConfig");
    this.config = config;
    this.ctx = ctx;
  }

  async list() {
    const items = [];
    for (const ch of CHANNELS) {
      if (!ch.verified) continue; // 仅暴露已完整验证的通道（飞书、iMessage），隐藏未验证通道
      // iMessage uses macOS Messages.app, chat.db, and AppleScript only.
      // Keep it out of the Windows configuration surface even if stale
      // settings were copied from another machine.
      if (process.platform === "win32" && ch.id === "imessage") continue;
      let namespace = {};
      try {
        namespace = this.ctx.settings?.get?.(ch.section) ?? {};
      } catch { /* 未注册该段 */ }
      const fileCfg = await readSettingsSection(this.config.settingsPath, ch.section);
      const state = await readStateFile(this.config.stateDir, ch.stateFile);
      const sessions = Object.keys(state).length;
      const merged = { ...namespace, ...fileCfg };
      const configured = isChannelConfigured(ch.id, merged, sessions);
      const status = ch.id === "imessage" ? inspectImessageStatus(merged) : {};

      items.push({
        id: ch.id,
        label: ch.label,
        desc: ch.desc,
        color: ch.color,
        tags: ch.tags ?? [],
        guide: ch.guide ?? "",
        fields: ch.fields ?? [],
        configured,
        ...status,
        sessions,
        state,
        namespace,
        fileConfig: fileCfg,
      });
    }
    return { items };
  }

  async save(payload) {
    const { section, config } = payload ?? {};
    if (!section || typeof config !== "object") {
      throw new Error("Invalid payload: section and config required");
    }
    try {
      if (this.ctx.settings?.replace) {
        await this.ctx.settings.replace(section, config);
      }
    } catch (e) {
      console.warn(`[channel-config] ctx.settings.replace warning for ${section}:`, e);
    }
    await writeSettingsSection(this.config.settingsPath, section, config);
    return { ok: true, section };
  }
}

export function apply(ctx, config) {
  ctx.logger.info("[channel-config] 通道配置面板插件已加载");
  try {
    new ChannelConfigService(ctx, config);
    ctx.effect(() => ctx.typert.register(MANIFEST), "harness-channel-config: typert manifest");
  } catch (e) {
    ctx.logger.error("[channel-config] APPLY ERROR: " + (e?.stack ?? e));
    throw e;
  }
}
