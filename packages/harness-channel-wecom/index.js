/**
 * index.js — harness-channel-wecom host 入口（薄壳，托管消息总线）
 *
 * 开放 API。自建应用回调收消息 + 发送接口发。需 corpId/agentId/corpSecret/callbackToken。
 * 消息总线（GatewayCore）与 logger 均从共享包 `@anarkhgatsby/deepseek-harness-core` 导入，
 * 本插件只做"平台门面"：注册 wecom settings namespace、接适配器、注册 message 工具。
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { join } from "node:path";
import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";
import { WecomAdapter } from "./lib/adapters/wecom.mjs";
import { normalizeSettings } from "./lib/config.mjs";

export const name = "harness-channel-wecom";

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

export const Config = z.object({
  settingsPath: z.string().default(join(homedir(), ".dsh", "settings.yaml")),
  statePath: z.string().default(join(homedir(), ".dsh", "wecom-gateway-state.json")),
});

/** `wecom` settings namespace schema。 */
const GatewaySchema = z.object({
  routes: z.dict(z.string()),
  botId: z.string(),
  secret: z.string(),
  corpId: z.string(),
  agentId: z.string(),
  corpSecret: z.string(),
  callbackToken: z.string(),
  defaultWorkspace: z.string(),
  autoReply: z.boolean(),
  streamReplies: z.boolean(),
  toolCallReplies: z.boolean(),
  stepTimeoutSec: z.number(),
  allowlist: z.array(z.string()),
});

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

const MANIFEST = {
  package: "harness-channel-wecom",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "harness-channel-wecom#wecomGateway/getConfig",
      service: "wecomGateway",
      namespace: "wecomGateway",
      method: "getConfig",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "strict", typeSymbol: "harness-channel-wecom#GatewayConfig", schema: getResultSchema },
    },
    {
      id: "harness-channel-wecom#wecomGateway/setConfig",
      service: "wecomGateway",
      namespace: "wecomGateway",
      method: "setConfig",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "harness-channel-wecom#SetPayload", schema: setPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "harness-channel-wecom#SetResult", schema: setResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

class GatewayService extends TypertRemoteService {
  constructor(ctx, scope, adapter) {
    super(ctx, "wecomGateway");
    this.scope = scope;
    this.adapter = adapter;
  }

  getConfig() {
    const snap = this.scope.get();
    return normalizeSettings(snap);
  }

  async setConfig(payload) {
    const current = this.scope.get() ?? {};
    const section = normalizeSettings({ ...current, ...payload });
    await this.scope.replace(section);
    return { ok: true };
  }
}

export function apply(ctx, config) {
  const scope = ctx.settings.register("wecom", GatewaySchema, {
    base: {
      routes: {},
      botId: "",
      secret: "",
      corpId: "",
      agentId: "",
      corpSecret: "",
      callbackToken: "",
      defaultWorkspace: join(homedir(), "dsh", "default"),
      autoReply: true,
      streamReplies: true,
      toolCallReplies: true,
      stepTimeoutSec: 0,
      allowlist: [],
    },
  });

  const log = createChannelLogger("wecom", ctx.logger);

  const getConfig = () => normalizeSettings(scope.get());
  const adapter = new WecomAdapter({ getConfig, log });
  const core = new GatewayCore({
    tag: "wecom",
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

  new GatewayService(ctx, scope, adapter);
  ctx.effect(() => ctx.typert.register(MANIFEST), "harness-channel-wecom: typert manifest");

  ctx.on("dispose", () => core.stopListener());
  core.startListener().then(() => log.info("网关监听已启动")).catch((e) => log.error(`启动监听失败 ${e instanceof Error ? e.message : e}`));

  scope.watch((next) => {
    const normalized = normalizeSettings(next);
    core.applyConfig(normalized);
    log.info(`配置热更新: routes=${Object.keys(core.routes).length}条 autoReply=${core.autoReply}`);
  });

  const messageTool = defineTool({
    name: "message_wecom",
    description: "通过企业微信向用户或群发送文本。用于主动通知/提醒用户。",
    parameters: {
      action: { type: "string", required: true, description: "操作类型，目前仅支持 send" },
      channel: { type: "string", required: true, description: "发送渠道：wecom" },
      target: { type: "string", required: true, description: "目标：用户/群标识" },
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
  log.info("已注册全局 message 工具（企业微信 发送）");
}
