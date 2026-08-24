/**
 * gateway-core.mjs — 通用通道消息总线（每个 channel 插件共享一份）
 *
 * 与具体协议解耦：核心只认识统一的适配器接口
 *   start(handler) / send(to,text) / setTyping(handle,on) / stop() / describe()
 * 以及统一入站消息 { sender, text, images, raw, dedupeId }。
 *
 * channel 插件（imessage/qq/telegram/feishu...）各自 import 本核心，把各自的
 * adapter 与 channel 配置传进来即可，核心不关心上层是哪个 channel。
 *
 * 功能：按 sender 路由工作区、去重、投递给 agent、取回复、回发、流式回复、
 * 工具提示、typing 指示器、会话持久化、per-session 串行队列（防并发竞态）。
 *
 * @param {string} tag  日志前缀（如 "im" / "qq"），用于区分通道输出
 * @param {object} opts 核心依赖与配置（见构造函数）
 */
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { installModelSelection } from "@deepseek-ai/dsh-agent";

/** 从事件取给定区间最后一条纯文本 assistant 回复。 */
function summarizeReply(events, firstSeq) {
  let text = "";
  let reason;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "assistant/message") {
      const joined = (event.data.message.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (joined !== "") text = joined;
    }
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason };
}

export class GatewayCore {
  constructor({ tag = "chan", adapter, agents, defaultModel, sessions, agentPresets, workspaceRegistry, sessionPersistence, sessionTitle, log = console, statePath }) {
    this.tag = tag;
    this.adapter = adapter;
    this.agents = agents;
    this.defaultModel = defaultModel;
    this.sessions = sessions;
    this.agentPresets = agentPresets;
    this.workspaceRegistry = workspaceRegistry;
    this.sessionPersistence = sessionPersistence;
    this.sessionTitle = sessionTitle;
    this.log = log;
    this.statePath = statePath;
    this.sessionMap = {};
    this.routes = {};
    this.autoReply = true;
    this.streamReplies = true;
    this.toolCallReplies = true;
    this.stepTimeoutSec = 0;
    this._streamSeenSeq = new Map();
    this._deliverChains = new Map();
    this._deliverPending = new Map();
    this._sendChain = Promise.resolve();
    this._typingChain = Promise.resolve();
    this._typingKeepalives = new Map();
    this._disposed = false;
    // 绑定适配器 handler
    this._onInbound = (msg) => this._handleInbound(msg);
  }

  // ── 配置 ────────────────────────────────────────────────────────────────
  applyConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    if (cfg.routes && typeof cfg.routes === "object") this.routes = cfg.routes;
    if (cfg.autoReply !== undefined) this.autoReply = !!cfg.autoReply;
    if (cfg.streamReplies !== undefined) this.streamReplies = !!cfg.streamReplies;
    if (cfg.toolCallReplies !== undefined) this.toolCallReplies = !!cfg.toolCallReplies;
    if (cfg.stepTimeoutSec !== undefined) this.stepTimeoutSec = Number(cfg.stepTimeoutSec) > 0 ? Number(cfg.stepTimeoutSec) : 0;
  }

  workspaceFor(handle) {
    if (typeof handle !== "string" || !handle) return "";
    const fallback = this.adapter.getConfig?.().defaultWorkspace || "";
    return this.routes[handle.trim()] || fallback;
  }

  // ── 状态持久化（sender→session 映射） ────────────────────────────────────
  async loadState() {
    if (!this.statePath) return;
    try {
      const { readFile } = await import("node:fs/promises");
      const parsed = JSON.parse(await readFile(this.statePath, "utf8"));
      this.sessionMap = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      this.sessionMap = {};
    }
  }

  async saveState() {
    if (!this.statePath) return;
    try {
      const { writeFile, rename } = await import("node:fs/promises");
      const tmp = `${this.statePath}.tmp`;
      await writeFile(tmp, JSON.stringify(this.sessionMap, null, 2), "utf8");
      await rename(tmp, this.statePath);
    } catch (e) {
      this.log?.warn?.(`[${this.tag}] 保存状态失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 会话归属 ────────────────────────────────────────────────────────────
  async attachWorkspace(sessionId, cwd) {
    const registry = this.workspaceRegistry;
    if (registry === void 0) return;
    try {
      let workspace = await registry.resolveByPath(cwd);
      if (workspace === void 0) workspace = await registry.create(cwd);
      await workspace.attachSession(sessionId);
    } catch (e) {
      this.log?.warn?.(`[${this.tag}] attach workspace ${cwd} 失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  isArchived(id) {
    const set = this.workspaceRegistry?.archivedSessionIds;
    return Array.isArray(set) && set.includes(id);
  }

  async isPersisted(id) {
    try {
      const headers = await this.sessionPersistence?.list?.();
      return !!headers?.some((h) => String(h.id) === String(id));
    } catch {
      return false;
    }
  }

  newSessionId() {
    return SessionId(`gateway-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-gw`);
  }

  sessionIdFor(sender) {
    const h = String(sender ?? "").trim().toLowerCase();
    let h1 = 5381;
    for (let i = 0; i < h.length; i++) h1 = ((h1 << 5) + h1 + h.charCodeAt(i)) >>> 0;
    let h2 = 52711;
    for (let i = 0; i < h.length; i++) h2 = ((h2 << 7) + h2 * 31 + h.charCodeAt(i) + i) >>> 0;
    return SessionId(`gateway-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}-gw`);
  }

  async composeSetup(presetId) {
    const presets = this.agentPresets;
    if (presets === void 0) {
      return {
        setup: (agentCtx) => {
          const selection = this.defaultModel.currentSelection();
          installModelSelection(agentCtx, { current: selection, assembled: void 0 });
          return Promise.resolve();
        },
      };
    }
    const resolvedId = (await presets.resolve(presetId)).id;
    const selection = this.defaultModel.currentSelection();
    return {
      agentPreset: resolvedId,
      setup: async (agentCtx) => {
        installModelSelection(agentCtx, { current: selection, assembled: void 0 });
        await presets.mount(agentCtx, resolvedId);
      },
    };
  }

  // ── typing（keepalive，委托适配器） ──────────────────────────────────────
  async startTyping(sender) {
    const entry = this._typingKeepalives.get(sender);
    if (entry) { entry.refs += 1; return; }
    const timer = setInterval(() => { this.adapter.setTyping(sender, true).catch(() => {}); }, 3000);
    timer.unref?.();
    this._typingKeepalives.set(sender, { timer, refs: 1 });
    this.adapter.setTyping(sender, true).catch(() => {});
  }

  async stopTyping(sender) {
    const entry = this._typingKeepalives.get(sender);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    clearInterval(entry.timer);
    this._typingKeepalives.delete(sender);
    await this.adapter.setTyping(sender, false).catch(() => {});
  }

  // ── 监听 ────────────────────────────────────────────────────────────────
  async startListener() {
    await this.loadState();
    if (this._disposed) return;
    await this.adapter.start(this._onInbound);
    this.log?.info?.(`[${this.tag}] ${this.adapter.describe()}`);
  }

  stopListener() {
    this._disposed = true;
    this.adapter.stop().catch(() => {});
    for (const [sender, entry] of this._typingKeepalives) {
      clearInterval(entry.timer);
      this._typingKeepalives.delete(sender);
    }
    // 断开串行链
    this._deliverChains.clear();
    this._deliverPending.clear();
    this._streamSeenSeq.clear();
  }

  // ── 入站处理 ────────────────────────────────────────────────────────────
  async _handleInbound(inbound) {
    if (!inbound || typeof inbound !== "object") return;
    const { sender, text, images, dedupeId } = inbound;
    if (!sender) return;
    if (!this.autoReply) return;

    let content = text || "";
    if (Array.isArray(images) && images.length > 0) {
      const imgRef = images.map((p) => `[图片: ${p}]`).join(" ");
      content = content ? `${content} ${imgRef}` : `用户发来图片：${images.join("、")}`;
    }
    if (!content) return;

    const queueLen = (this._deliverPending.get(sender) ?? 0) + 1;
    this.log?.info?.(`[${this.tag}] 收到来自 ${sender}: ${String(content).slice(0, 80)}...（队列 ${queueLen}）`);

    try {
      const workspace = this.workspaceFor(sender);
      const reply = await this.deliver(sender, workspace, content);
      if (reply && this.autoReply) {
        const t0 = Date.now();
        await this.adapter.send(sender, reply);
        this.log?.info?.(`[${this.tag}] send ok ${Date.now() - t0}ms`);
      }
    } catch (e) {
      this.log?.error?.(`[${this.tag}] 处理消息失败 ${e instanceof Error ? e.message : e}`);
    }
  }

  deliver(sender, workspace, message) {
    const pending = (this._deliverPending.get(sender) ?? 0) + 1;
    this._deliverPending.set(sender, pending);
    const chain = this._deliverChains.get(sender) ?? Promise.resolve();
    const task = chain.then(() => this._deliver(sender, workspace, message));
    this._deliverChains.set(sender, task.then(() => void 0, () => void 0));
    task.finally(() => {
      const left = (this._deliverPending.get(sender) ?? 1) - 1;
      if (left <= 0) this._deliverPending.delete(sender);
      else this._deliverPending.set(sender, left);
    });
    return task;
  }

  async _deliver(sender, workspace, message) {
    const selection = this.defaultModel.currentSelection();
    const agentOptionsArg = { provider: selection.provider, model: selection.model };
    const stableId = this.sessionIdFor(sender);
    let id = null;
    for (const candidate of [this.sessionMap[sender], stableId]) {
      if (!candidate || this.isArchived(candidate)) continue;
      const live = this.agents.get(candidate);
      const persisted = await this.isPersisted(candidate);
      if (live || persisted) { id = candidate; break; }
    }
    if (!id) {
      id = this.newSessionId();
      this.sessionMap[sender] = id;
      await this.saveState().catch(() => {});
      this.log?.info?.(`[${this.tag}] 新会话 ${id} 绑定 ${sender}`);
    }

    const setup = await this.composeSetup(void 0);
    const agent = this.agents.create({
      ...agentOptionsArg,
      session: id,
      ...(setup.agentPreset ? { preset: setup.agentPreset } : {}),
    });
    if (setup.setup) await setup.setup(agent.ctx);

    // 归属 workspace
    if (workspace) await this.attachWorkspace(id, workspace).catch(() => {});

    this.startTyping(sender).catch(() => {});

    let streamPoller = null;
    if (this.streamReplies || this.toolCallReplies) {
      this._streamSeenSeq.set(agent.session.id, agent.session.events.at(-1)?.seq ?? 0);
      streamPoller = setInterval(() => this._syncStream(agent, sender), 200);
    }

    try {
      await agent.whenIdle();
      const firstSeq = agent.session.seq;
      agent.followup(createUserMessage({
        content: [{ type: "text", text: message }],
        source: { kind: "user" },
      }));
      await agent.whenIdle();
      await this.sessions.flush(agent.session);
      if (streamPoller !== null) this._syncStream(agent, sender);
      const { text } = summarizeReply(agent.session.events, firstSeq);
      this.log?.info?.(`[${this.tag}] deliver 完成 id=${id} reply=${text?.length ?? 0}字 stream=${this.streamReplies}`);
      return this.streamReplies ? null : text;
    } finally {
      if (streamPoller !== null) clearInterval(streamPoller);
      this._streamSeenSeq.delete(id);
      await this.stopTyping(sender);
    }
  }

  // ── 流式事件消费 ────────────────────────────────────────────────────────
  _syncStream(agent, sender) {
    const key = agent.session.id;
    const seen = this._streamSeenSeq.get(key) ?? 0;
    let max = seen;
    for (const evt of agent.session.events) {
      if (evt.seq <= seen) continue;
      if (evt.type === "assistant/message" && this.streamReplies) this._sendReply(sender, evt);
      else if (evt.type === "tool/call" && this.toolCallReplies) this._sendToolCall(sender, evt);
      if (evt.seq > max) max = evt.seq;
    }
    this._streamSeenSeq.set(key, max);
  }

  _extractMessageText(evt) {
    const content = evt?.data?.message?.content;
    if (!Array.isArray(content)) return "";
    return content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("").trimEnd();
  }

  _sendReply(sender, evt) {
    const text = this._extractMessageText(evt);
    if (!text) return;
    this.log?.info?.(`[${this.tag}] 流式发送 ${text.length}字 给 ${sender}`);
    this._sendChain = this._sendChain
      .then(() => this.adapter.send(sender, text))
      .catch((e) => this.log?.warn?.(`[${this.tag}] 流式发送失败: ${e instanceof Error ? e.message : e}`));
  }

  _extractToolDescription(raw) {
    if (!raw) return "";
    let parsed = raw;
    if (typeof parsed === "string") { try { parsed = JSON.parse(raw); } catch { return ""; } }
    if (parsed && typeof parsed.description === "string" && parsed.description.trim()) return parsed.description.trim();
    return "";
  }

  _sendToolCall(sender, evt) {
    const data = evt?.data ?? {};
    const name = typeof data.name === "string" ? data.name : "";
    const desc = this._extractToolDescription(data.arguments);
    if (!desc) return;
    this.log?.info?.(`[${this.tag}] 工具提示 ${name}: ${desc.slice(0, 60)}`);
    this._sendChain = this._sendChain
      .then(() => this.adapter.send(sender, `🔧 ${desc}`))
      .catch((e) => this.log?.warn?.(`[${this.tag}] 工具提示发送失败: ${e instanceof Error ? e.message : e}`));
  }

  /** 主动出站（message 工具用）。 */
  async send(to, text) {
    return this.adapter.send(to, text);
  }

  describe() {
    return this.adapter.describe();
  }
}
