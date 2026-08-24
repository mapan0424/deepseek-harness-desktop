/**
 * index.js — harness-channel-qq host 入口（薄壳，托管消息总线）
 *
 * QQ 通过 OneBot v11（NapCat / Lagrange / LLOneBot）的 WebSocket 端点收发。
 * 消息总线（GatewayCore）与 logger 均从共享包 `@anarkhgatsby/deepseek-harness-core` 导入，
 * 本插件只做"平台门面"：注册 qq settings namespace、接 QQAdapter、注册 message 工具。
 *
 * 数据落盘：$DSH_HOME/settings.yaml 的 `qq` 段 + $DSH_HOME/qq-gateway-state.json
 * （sender→session 映射）。client 通过 Typert remote `qqGateway` 读写。
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { join } from "node:path";
import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";
import { QQAdapter } from "./lib/adapters/qq.mjs";
import { normalizeSettings } from "./lib/config.mjs";

export const name = "harness-channel-qq";

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
];

/** 插件自身 schema：settingsPath（settings.yaml）+ statePath（sender→session 映射）。 */
export const Config = z.object({
  settingsPath: z.string().default(join(homedir(), ".dsh", "settings.yaml")),
  statePath: z.string().default(join(homedir(), ".dsh", "qq-gateway-state.json")),
});

/** `qq` settings namespace schema。 */
const GatewaySchema = z.object({
  routes: z.dict(z.string()),
  wsUrl: z.string(),
  token: z.string(),
  defaultWorkspace: z.string(),
  autoReply: z.boolean(),
  streamReplies: z.boolean(),
  toolCallReplies: z.boolean(),
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
  package: "harness-channel-qq",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "harness-channel-qq#qqGateway/getConfig",
      service: "qqGateway",
      namespace: "qqGateway",
      method: "getConfig",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "strict", typeSymbol: "harness-channel-qq#GatewayConfig", schema: getResultSchema },
    },
    {
      id: "harness-channel-qq#qqGateway/setConfig",
      service: "qqGateway",
      namespace: "qqGateway",
      method: "setConfig",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "harness-channel-qq#SetPayload", schema: setPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "harness-channel-qq#SetResult", schema: setResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

class GatewayService extends TypertRemoteService {
  constructor(ctx, scope, adapter) {
    super(ctx, "qqGateway");
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
  const scope = ctx.settings.register("qq", GatewaySchema, {
    base: {
      routes: {},
      wsUrl: "ws://127.0.0.1:3001",
      token: "",
      defaultWorkspace: join(homedir(), "dsh", "default"),
      autoReply: true,
      streamReplies: true,
      toolCallReplies: true,
      stepTimeoutSec: 0,
      allowlist: [],
    },
  });

  const log = createChannelLogger("qq", ctx.logger);

  const getConfig = () => normalizeSettings(scope.get());
  const adapter = new QQAdapter({ getConfig, log });
  const core = new GatewayCore({
    tag: "qq",
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
  ctx.effect(() => ctx.typert.register(MANIFEST), "harness-channel-qq: typert manifest");

  // 启动网关监听
  ctx.on("dispose", () => core.stopListener());
  core.startListener().then(() => log.info("网关监听已启动")).catch((e) => log.error(`启动监听失败 ${e instanceof Error ? e.message : e}`));

  // 配置热更新
  scope.watch((next) => {
    const normalized = normalizeSettings(next);
    core.applyConfig(normalized);
    log.info(`配置热更新: wsUrl=${normalized.wsUrl} routes=${Object.keys(core.routes).length}条 autoReply=${core.autoReply}`);
  });

  // 注册全局 `message` 工具
  const messageTool = defineTool({
    name: "message",
    description: "通过当前激活的 QQ 通道（OneBot v11）向用户或群发送一条文本消息。用户为 QQ 号，群聊为 group:<群号>。用于主动通知/提醒用户。",
    parameters: {
      action: { type: "string", required: true, description: "操作类型，目前仅支持 send" },
      channel: { type: "string", required: true, description: "发送渠道：qq" },
      target: { type: "string", required: true, description: "目标 QQ 号（如 10001）或群聊 group:<群号>" },
      message: { type: "string", required: true, description: "要发送的文本内容" },
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
      const text = a?.message;
      if (action !== "send" || !target || !text) return { ok: false };
      try {
        await core.send(target, text);
        log.info(`message 工具已发送到 ${target}: ${String(text).slice(0, 40)}`);
        return { ok: true };
      } catch (e) {
        log.error(`message 工具发送失败: ${e instanceof Error ? e.message : e}`);
        return { ok: false };
      }
    },
  });
  ctx.tools.register(messageTool);
  log.info("已注册全局 message 工具（QQ 发送）");
}
