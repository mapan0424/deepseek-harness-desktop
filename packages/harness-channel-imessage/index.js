/**
 * index.js — harness-channel-imessage host 入口（薄壳，托管消息总线）
 *
 * iMessage 仅使用本机 local 传输：通过 chat.db 监听，并由 Messages.app 发送消息。
 * 消息总线（GatewayCore）与 logger 均从共享包 `@anarkhgatsby/deepseek-harness-core` 导入，
 * 本插件只做"平台门面"：注册 imessage settings namespace、选适配器、注册 message 工具。
 *
 * 数据落盘：$DSH_HOME/settings.yaml 的 `imessage` 段 + $DSH_HOME/imessage-gateway-state.json
 * （sender→session 映射）。client 通过 Typert remote `imessageGateway` 读写。
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { join } from "node:path";
import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";
import { LocalAdapter } from "./lib/adapters/local.mjs";
import { MODES, DEFAULT_MODE, normalizeSettings } from "./lib/config.mjs";

export const name = "harness-channel-imessage";

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
  statePath: z.string().default(join(homedir(), ".dsh", "imessage-gateway-state.json")),
});

/** `imessage` settings namespace schema（路由 + 通用开关 + 各通道专属配置）。 */
const GatewaySchema = z.object({
  routes: z.dict(z.string()),
  mode: z.string(), // 兼容旧配置，当前仅支持 local
  chatDb: z.string(),
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
  package: "harness-channel-imessage",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "harness-channel-imessage#imessageGateway/getConfig",
      service: "imessageGateway",
      namespace: "imessageGateway",
      method: "getConfig",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "strict", typeSymbol: "harness-channel-imessage#GatewayConfig", schema: getResultSchema },
    },
    {
      id: "harness-channel-imessage#imessageGateway/setConfig",
      service: "imessageGateway",
      namespace: "imessageGateway",
      method: "setConfig",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "harness-channel-imessage#SetPayload", schema: setPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "harness-channel-imessage#SetResult", schema: setResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

class GatewayService extends TypertRemoteService {
  constructor(ctx, scope, adapter) {
    super(ctx, "imessageGateway");
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
  const scope = ctx.settings.register("imessage", GatewaySchema, {
    base: {
      routes: {},
      mode: DEFAULT_MODE,
      chatDb: join(homedir(), "Library/Messages/chat.db"),
      defaultWorkspace: join(homedir(), "dsh", "default"),
      autoReply: true,
      streamReplies: true,
      toolCallReplies: true,
      stepTimeoutSec: 0,
      allowlist: [],
    },
  });

  const log = createChannelLogger("im", ctx.logger);

  // iMessage 仅允许本机 local 适配器；热更新时由 scope.watch 重载配置。
  const resolveAdapter = () => {
    const getConfig = () => normalizeSettings(scope.get());
    return new LocalAdapter({ getConfig, log });
  };

  const adapter = resolveAdapter();
  const core = new GatewayCore({
    tag: "im",
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
  ctx.effect(() => ctx.typert.register(MANIFEST), "harness-channel-imessage: typert manifest");

  // 启动网关监听
  ctx.on("dispose", () => core.stopListener());
  core.startListener().then(() => log.info("网关监听已启动")).catch((e) => log.error(`启动监听失败 ${e instanceof Error ? e.message : e}`));

  // 配置热更新：配置页保存后立即推给运行中的网关
  scope.watch((next) => {
    const normalized = normalizeSettings(next);
    core.applyConfig(normalized);
    log.info(`配置热更新: mode=${normalized.mode} routes=${Object.keys(core.routes).length}条 autoReply=${core.autoReply}`);
  });

  // 注册全局 `message_imessage` 工具
  const messageTool = defineTool({
    name: "message_imessage",
    description: "通过本机 Messages.app 的 iMessage 通道向联系人发送一条文本消息。用于主动通知/提醒用户。",
    parameters: {
      action: { type: "string", required: true, description: "操作类型，目前仅支持 send" },
      channel: { type: "string", required: true, description: "发送渠道：imessage/local" },
      target: { type: "string", required: true, description: "目标 handle（号码如 +8613800000000 或 email）" },
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
  log.info("已注册全局 message 工具（iMessage 发送）");
}

export { MODES, DEFAULT_MODE };
