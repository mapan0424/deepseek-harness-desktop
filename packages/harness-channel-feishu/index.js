/**
 * index.js — harness-channel-feishu host 入口（薄壳，托管消息总线）
 *
 * 开放 API。应用事件订阅（webhook 收）+ 开放接口发消息。需创建企业自建应用拿 appId/appSecret/verifyToken。
 * 消息总线（GatewayCore）与 logger 均从共享包 `@anarkhgatsby/deepseek-harness-core` 导入，
 * 本插件只做"平台门面"：注册 feishu settings namespace、接适配器、注册 message 工具。
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { join } from "node:path";
import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";
import { FeishuAdapter } from "./lib/adapters/feishu.mjs";
import { normalizeSettings } from "./lib/config.mjs";

export const name = "harness-channel-feishu";

// 框架依赖：typert/settings（配置 remote）+ agents/agentPresets/workspaceRegistry/
// sessionPersistence/sessionTitle/tools（网关投递 + message 工具）。
export const inject = [
  "typert",
  "settings",
  "agents",
  "agentDefaultModel",
  "agentPresets",
  "sessions",
  "workspaceRegistry",
  "sessionPersistence",
  "sessionTitle",
  "tools",
  "userQuestions",
];

/** 插件自身 schema：settingsPath（settings.yaml）+ statePath（sender→session 映射）。 */
export const Config = z.object({
  settingsPath: z.string().default(join(homedir(), ".dsh", "settings.yaml")),
  statePath: z.string().default(join(homedir(), ".dsh", "feishu-gateway-state.json")),
});

/** `feishu` settings namespace schema。 */
const GatewaySchema = z.object({
  routes: z.dict(z.string()),
  appId: z.string(),
  appSecret: z.string(),
  verifyToken: z.string(),
  encryptKey: z.string(),
  defaultWorkspace: z.string(),
  autoReply: z.boolean(),
  streamReplies: z.boolean(),
  toolCallReplies: z.boolean(),
  cardReplies: z.boolean(),
  stepTimeoutSec: z.number(),
  allowlist: z.array(z.string()),
});

// ── Typert wire schemas ───────────────────────────────────────────────────
function parseObj() {
  return {
    parse(value) {
      if (typeof value !== "object" || value === null) throw new Error("expected object");
      return value;
    },
  };
}
const getResultSchema = parseObj();
const setPayloadSchema = parseObj();
const setResultSchema = parseObj();

/** Typert MANIFEST：注册给 API gateway 的远程方法。 */
const MANIFEST = {
  package: "harness-channel-feishu",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "harness-channel-feishu#feishuGateway/getConfig",
      service: "feishuGateway",
      namespace: "feishuGateway",
      method: "getConfig",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "strict", typeSymbol: "harness-channel-feishu#GatewayConfig", schema: getResultSchema },
    },
    {
      id: "harness-channel-feishu#feishuGateway/setConfig",
      service: "feishuGateway",
      namespace: "feishuGateway",
      method: "setConfig",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "harness-channel-feishu#SetPayload", schema: setPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "harness-channel-feishu#SetResult", schema: setResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

class GatewayService extends TypertRemoteService {
  constructor(ctx, scope, adapter) {
    super(ctx, "feishuGateway");
    this.scope = scope;
    this.adapter = adapter;
  }

  getConfig() {
    const snap = this.scope.get();
    return normalizeSettings(snap);
  }

  async setConfig(payload) {
    const current = this.scope.get() ?? {};
    // 用 replace（整体替换）避免 update 深合并导致删路由不生效。
    const section = normalizeSettings({ ...current, ...payload });
    await this.scope.replace(section);
    return { ok: true };
  }
}

export function apply(ctx, config) {
  const scope = ctx.settings.register("feishu", GatewaySchema, {
    base: {
      routes: {},
      appId: "",
      appSecret: "",
      verifyToken: "",
      encryptKey: "",
      defaultWorkspace: join(homedir(), "dsh", "default"),
      autoReply: true,
      streamReplies: true,
      toolCallReplies: true,
      cardReplies: true,
      stepTimeoutSec: 0,
      allowlist: [],
    },
  });

  const log = createChannelLogger("feishu", ctx.logger);

  const getConfig = () => normalizeSettings(scope.get());
  const adapter = new FeishuAdapter({ getConfig, log });
  const core = new GatewayCore({
    tag: "feishu",
    adapter,
    agents: ctx.get("agents"),
    defaultModel: ctx.get("agentDefaultModel"),
    sessions: ctx.get("sessions"),
    agentPresets: ctx.get("agentPresets"),
    workspaceRegistry: ctx.get("workspaceRegistry"),
    sessionPersistence: ctx.get("sessionPersistence"),
    sessionTitle: ctx.get("sessionTitle"),
    log,
    statePath: config.statePath,
  });

  // 配置 remote（配置页读写）
  new GatewayService(ctx, scope, adapter);
  ctx.effect(() => ctx.typert.register(MANIFEST), "harness-channel-feishu: typert manifest");

  // 包装全局 userQuestions provider：本通道会话的 ask 走飞书文本提问，GUI 会话仍走弹窗
  ctx.on("dispose", GatewayCore.wrapGlobalUserQuestions(ctx.userQuestions, log));
  // 包装全局 approval：本通道会话的沙箱权限申请走飞书文本确认（1=批准/2=拒绝）
  ctx.on("dispose", GatewayCore.wrapGlobalApproval(ctx, log));

  // 启动网关监听
  ctx.on("dispose", () => core.stopListener());
  core.startListener().then(() => log.info("网关监听已启动")).catch((e) => log.error(`启动监听失败 ${e instanceof Error ? e.message : e}`));

  // 配置热更新
  scope.watch((next) => {
    const normalized = normalizeSettings(next);
    core.applyConfig(normalized);
    if (normalized.appId && normalized.appSecret) {
      adapter.reconnect().catch((e) => log.warn(`飞书热重连失败: ${e instanceof Error ? e.message : e}`));
    }
    log.info(`配置热更新: routes=${Object.keys(core.routes).length}条 autoReply=${core.autoReply}`);
  });

  // 注册全局 `message` 工具（文本 + 附件，支持多文件与 URL 图片）
  const messageTool = defineTool({
    name: "message_feishu",
    description: "通过飞书向用户或群发送文本和/或文件（图片/文档）。支持本地文件、URL 图片、多种接收方类型。用于主动通知/提醒用户。",
    parameters: {
      action: { type: "string", required: true, description: "操作类型，目前仅支持 send" },
      channel: { type: "string", required: true, description: "发送渠道：feishu" },
      target: { type: "string", required: true, description: "目标标识（如 chat_id / open_id / user_id / email，与 targetType 对应）" },
      targetType: { type: "string", description: "目标类型：chat_id（默认）/ open_id / user_id / email" },
      message: { type: "string", required: true, description: "要发送的文本内容（可与文件同时发送；仅发文件时传空字符串）" },
      filePath: { type: "string", description: "可选。单个本地文件绝对路径（图片自动以图片消息发送）" },
      fileName: { type: "string", description: "可选。发送时的文件名，缺省取路径 basename" },
      filePaths: { type: "array", items: { type: "string" }, description: "可选。多个本地文件绝对路径，与 filePath 二选一" },
      imageUrls: { type: "array", items: { type: "string" }, description: "可选。图片 URL 列表，自动下载（SSRF 防护）后以图片消息发送" },
    },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean", required: true } } },
      render(args, value) {
        const target = (typeof args === "object" && args !== null && typeof args.target === "string") ? args.target : "?";
        return [{ type: "text", text: value.ok ? `已发送到 ${target}` : "发送失败" }];
      },
    },
    async execute(args) {
      let a = args;
      if (typeof args === "string") { try { a = JSON.parse(args); } catch { return { ok: false }; } }
      const action = a?.action ?? "send";
      const target = a?.target;
      const text = a?.message ?? "";
      const targetType = a?.targetType;
      if (action !== "send" || !target) return { ok: false };

      // 收集附件：单文件（兼容旧参数）+ 多文件 + URL 图片
      const files = [];
      if (a?.filePath) files.push({ path: String(a.filePath), name: a?.fileName || undefined });
      if (Array.isArray(a?.filePaths)) {
        for (const p of a.filePaths) {
          if (typeof p === "string" && p.trim()) files.push({ path: p.trim() });
        }
      }
      if (Array.isArray(a?.imageUrls)) {
        for (const u of a.imageUrls) {
          if (typeof u === "string" && u.trim()) files.push({ url: u.trim() });
        }
      }
      if (!text && files.length === 0) return { ok: false };

      const sendOpts = { files };
      if (targetType) sendOpts.targetType = String(targetType);
      try {
        await core.send(target, text, sendOpts);
        log.info(`message 工具已发送到 ${target}${files.length ? ` +${files.length}个附件` : ""}: ${String(text).slice(0, 40)}`);
        return { ok: true };
      } catch (e) {
        log.error(`message 工具发送失败: ${e instanceof Error ? e.message : e}`);
        return { ok: false };
      }
    },
  });
  ctx.tools.register(messageTool);
  log.info("已注册全局 message 工具（飞书 发送 文本+多附件+URL图片）");
}
