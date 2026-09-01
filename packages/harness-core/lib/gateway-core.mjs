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
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";

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

/**
 * 从回复文本中提取文件引用（[文件: path] / [图片: path] / [附件: path] 标记，
 * 或文本中的存在的本地文件路径），返回 { files, text } —— files 为去重后的
 * { path, name?, mime? } 列表，text 为移除标记后的纯文本。
 */
export function extractFilesFromText(text) {
  const raw = String(text ?? "");
  const files = [];
  let cleaned = raw;

  // 1) 显式标记：[文件: /path]、[图片: /path]、[附件: /path]
  const markerRe = /\[(?:文件|图片|附件):\s*([^\]]+)\]/g;
  cleaned = cleaned.replace(markerRe, (whole, p) => {
    const path = String(p ?? "").trim().replace(/^["']|["']$/g, "");
    if (path) files.push({ path, name: basename(path) });
    return "";
  });

  // 2) 兜底：文本中独立的本地文件路径（/Users/... 或 ~/...）
  const bareRe = /((?:\/Users\/|\/~\/)[^\s)，。、；;：:）)\]]+)/g;
  cleaned = cleaned.replace(bareRe, (whole, p) => {
    const path = String(p ?? "").trim().replace(/[，。、；;：:）)\]'"`]+$/g, "");
    if (path && (existsSync(path) || existsSync(path.replace(/^~/, homedir())))) {
      files.push({ path, name: basename(path) });
      return "";
    }
    return whole;
  });

  // 去重 + 只保留存在的文件
  const seen = new Set();
  const unique = [];
  for (const f of files) {
    const p = f.path.replace(/^~/, homedir());
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      if (existsSync(p) && statSync(p).isFile()) unique.push({ path: p, name: f.name || basename(p) });
    } catch { /* 忽略不可读 */ }
  }
  return { files: unique, text: cleaned.replace(/\n{3,}/g, "\n\n").trim() };
}

export class GatewayCore {
  /** 所有通道实例的注册表，供全局 userQuestions provider 路由用。 */
  static _instances = [];
  static registerInstance(core) {
    GatewayCore._instances.push(core);
  }
  static unregisterInstance(core) {
    const i = GatewayCore._instances.indexOf(core);
    if (i >= 0) GatewayCore._instances.splice(i, 1);
  }

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
    this._questionWaiters = new Map();
    this._approvalWaiters = new Map();
    this.questionTimeoutMs = 10 * 60 * 1000; // 等待用户选择超时
    this._disposed = false;
    // 绑定适配器 handler
    this._onInbound = (msg) => this._handleInbound(msg);
    GatewayCore.registerInstance(this);
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

  // ── 通道提问（ask_user_question 的通道侧 provider） ─────────────────────
  /**
   * 把"需要用户选择"的问题以文本+编号发到聊天，挂起等待用户回复编号。
   * 多个问题逐个询问（编号从 1 重新开始），避免编号歧义。
   * 用户回复由 _handleInbound 解析并 resolve。
   */
  async _askChannelQuestion(request) {
    const sender = this._senderForSession(request);
    if (!sender) {
      throw new Error("无法确定提问对应的会话");
    }
    const answers = [];
    for (const q of request.questions) {
      const answer = await this._askOneQuestion(sender, q);
      answers.push(answer);
    }
    return { answers };
  }

  /** 问单个问题并等待回复。优先适配器的卡片提问（点击按钮直接返回选项），失败回退文本编号。 */
  async _askOneQuestion(sender, q) {
    const text = this._formatQuestionText([q]);
    // 适配器若支持卡片提问（飞书等），点击按钮即可返回选项，体验更佳
    if (typeof this.adapter.sendQuestion === "function") {
      try {
        const picked = await this.adapter.sendQuestion(sender, text, q);
        return this._parseSingleAnswer(q, picked);
      } catch (e) {
        this.log?.warn?.(`[${this.tag}] 卡片提问失败，回退文本提问: ${e instanceof Error ? e.message : e}`);
      }
    }
    await this.adapter.send(sender, text, { plain: true }).catch((e) => this.log?.warn?.(`[${this.tag}] 提问发送失败: ${e instanceof Error ? e.message : e}`));
    const answer = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._questionWaiters.delete(sender);
        reject(new Error("等待用户选择超时"));
      }, this.questionTimeoutMs > 0 ? this.questionTimeoutMs : 10 * 60 * 1000);
      timer.unref?.();
      this._questionWaiters.set(sender, { question: q, resolve, reject, timer });
      this.log?.info?.(`[${this.tag}] 提问已挂起等待 ${sender} 选择`);
    });
    return this._parseSingleAnswer(q, answer);
  }

  /** 从 ask 请求的 agent 反查 sender（sessionMap[sender] === agent.session.id）。 */
  _senderForSession(request) {
    const sid = String(request?.agent?.session?.id ?? "");
    if (!sid) return "";
    for (const [sender, id] of Object.entries(this.sessionMap)) {
      if (String(id) === sid) return sender;
    }
    return "";
  }

  /** 判断 sessionId 是否属于本通道（在 sessionMap 中）。 */
  _isChannelSession(sid) {
    if (!sid) return false;
    for (const id of Object.values(this.sessionMap)) {
      if (String(id) === sid) return true;
    }
    return false;
  }

  /** 判断 sessionId 是否属于任一通道实例。 */
  static _channelForSession(sid) {
    if (!sid) return null;
    for (const core of GatewayCore._instances) {
      if (core._isChannelSession(sid)) return core;
    }
    return null;
  }

  /**
   * 包装全局 userQuestions 服务。
   * 通道 agent 的 ask 请求会话属于某个通道实例时，路由到该通道的文本提问；
   * 其余（GUI 会话）仍走原 ask 逻辑（GUI 原生弹窗）。
   * 采用无侵入包装 uq.ask，绝不调用 uq.registerProvider，避免与官方 api-gateway 的 DUPLICATE_PROVIDER 冲突。
   */
  static wrapGlobalUserQuestions(uq, log = console) {
    if (!uq || typeof uq.ask !== "function") {
      log?.debug?.("[gateway-core] userQuestions 不可用，跳过全局提问路由包装");
      return () => {};
    }
    if (!uq._gatewayOriginalAsk) {
      const origAsk = uq.ask.bind(uq);
      uq._gatewayOriginalAsk = origAsk;
      uq.ask = async function (request) {
        const sid = String(request?.agent?.session?.id ?? request?.agent?.id ?? "");
        const core = GatewayCore._channelForSession(sid);
        if (core) {
          return core._askChannelQuestion(request);
        }
        return origAsk(request);
      };
      log?.info?.("[gateway-core] 已包装全局 userQuestions 路由（通道会话→通道提问，其余→GUI 弹窗）");
    }
    return () => {
      if (uq._gatewayOriginalAsk) {
        uq.ask = uq._gatewayOriginalAsk;
        delete uq._gatewayOriginalAsk;
      }
    };
  }

  /**
   * 包装全局 approval 服务（沙箱权限申请等）。
   * 通道会话的审批请求 → 发到通道文本确认（回复 1=批准 / 2=拒绝 / 其他=拒绝）；
   * 其余（GUI 会话）next() 交给 GUI 弹窗。
   * 注册为 approval/request waterfall 监听器（可与 GUI 共存）。
   */
  static wrapGlobalApproval(ctx, log = console) {
    let hasApproval = false;
    try {
      hasApproval = ctx.get("approval") !== void 0;
    } catch (e) {
      log?.debug?.(`[gateway-core] approval 服务未注入（${e instanceof Error ? e.message : e}），跳过全局审批路由包装`);
      return () => {};
    }
    if (!ctx || typeof ctx.on !== "function" || !hasApproval) {
      log?.debug?.("[gateway-core] approval 服务不可用，跳过全局审批路由包装");
      return () => {};
    }
    if (ctx._gatewayApprovalWrapped) return () => {};
    ctx._gatewayApprovalWrapped = true;
    const handler = (req, next) => {
      const sid = String(req?.agent?.session?.id ?? "");
      const core = GatewayCore._channelForSession(sid);
      if (!core) return next();
      // 通道会话：发审批确认到通道，等待用户回复
      return core._askApproval(req).catch((e) => {
        log?.warn?.(`[gateway-core] 通道审批失败，回退 GUI: ${e instanceof Error ? e.message : e}`);
        return next();
      });
    };
    ctx.on("approval/request", handler);
    log?.info?.("[gateway-core] 已注册全局 approval 路由（通道会话→通道确认，其余→GUI 弹窗）");
    return () => {
      // cordis ctx.on 返回 disposer，直接调用即可卸载
      ctx.off?.("approval/request", handler);
      ctx._gatewayApprovalWrapped = false;
    };
  }

  /** 通道侧审批：把审批请求发到聊天，等待用户回复 1/2。 */
  async _askApproval(req) {
    const sender = this._senderForSession({ agent: req.agent });
    if (!sender) throw new Error("无法确定审批对应的会话");
    const toolName = req.toolName ?? "工具";
    const reason = req.reason ?? "";
    const text =
      `🔐 权限申请\n\n` +
      `${toolName} 请求提升权限：\n` +
      `${reason || "（无说明）"}\n\n` +
      `回复 1 = 批准，回复 2 = 拒绝。`;
    await this.adapter.send(sender, text, { plain: true }).catch((e) => this.log?.warn?.(`[${this.tag}] 审批发送失败: ${e instanceof Error ? e.message : e}`));
    const answer = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._approvalWaiters.delete(sender);
        reject(new Error("等待审批超时"));
      }, this.questionTimeoutMs > 0 ? this.questionTimeoutMs : 10 * 60 * 1000);
      timer.unref?.();
      this._approvalWaiters.set(sender, { resolve, reject, timer });
      this.log?.info?.(`[${this.tag}] 审批已挂起等待 ${sender}`);
    });
    const t = String(answer ?? "").trim();
    if (t === "1" || /^(批准|同意|允许|yes|approve|ok|好的|可以)$/i.test(t)) return "allowed-once";
    return "rejected";
  }

  /** 把 questions 结构格式化为带编号的可读文本。 */
  _formatQuestionText(questions) {
    const parts = [];
    for (const q of questions) {
      const lines = [];
      if (q.header) lines.push(`【${q.header}】`);
      lines.push(q.question ?? "请选择");
      // detail（如 plan 全文）渲染为引用块，让用户看到审批内容
      if (typeof q.detail === "string" && q.detail.trim()) {
        const detailLines = q.detail.split("\n").map((l) => `> ${l}`).join("\n");
        lines.push(detailLines);
      }
      if (Array.isArray(q.options) && q.options.length > 0) {
        q.options.forEach((opt, i) => {
          lines.push(`${i + 1}. ${opt.label}${opt.description ? `（${opt.description}）` : ""}`);
        });
      }
      parts.push(lines.join("\n"));
    }
    if (parts.length > 1) return `❓ 需要你选择：\n\n${parts.join("\n\n")}\n\n请回复编号（多个用逗号分隔，如 1,2）。`;
    const single = parts[0] ?? "请选择";
    return `❓ ${single}\n\n请回复编号。`;
  }

  /** 解析用户对单个问题的回复。 */
  _parseSingleAnswer(q, replyText) {
    const t = String(replyText ?? "").trim();
    const opts = Array.isArray(q.options) ? q.options : [];
    const selected = [];
    let custom;
    if (opts.length > 0) {
      const picks = (t.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= opts.length);
      for (const pick of picks) {
        const opt = opts[pick - 1];
        if (opt && !selected.includes(opt.label)) selected.push(opt.label);
      }
      if (selected.length === 0) {
        const hit = opts.find((o) => t.includes(o.label));
        if (hit) selected.push(hit.label);
        else if (t) custom = t;
      }
    } else if (t) {
      custom = t;
    }
    return { id: q.id, selected, ...(custom !== void 0 ? { custom } : {}) };
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
    GatewayCore.unregisterInstance(this);
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
    const { sender, text, images, files, dedupeId } = inbound;
    if (!sender) return;

    // 有挂起的提问 → 用户回复作为答案，不再进入新对话
    const waiter = this._questionWaiters.get(sender);
    if (waiter) {
      this.log?.info?.(`[${this.tag}] 收到选择回复 from=${sender}: ${String(text ?? "").slice(0, 40)}`);
      clearTimeout(waiter.timer);
      this._questionWaiters.delete(sender);
      waiter.resolve(text ?? "");
      return;
    }

    // 有挂起的审批 → 用户回复作为审批决定，不再进入新对话
    const approvalWaiter = this._approvalWaiters.get(sender);
    if (approvalWaiter) {
      this.log?.info?.(`[${this.tag}] 收到审批回复 from=${sender}: ${String(text ?? "").slice(0, 40)}`);
      clearTimeout(approvalWaiter.timer);
      this._approvalWaiters.delete(sender);
      approvalWaiter.resolve(text ?? "");
      return;
    }

    if (!this.autoReply) return;

    let content = text || "";
    if (Array.isArray(images) && images.length > 0) {
      const imgRef = images.map((p) => `[图片: ${p}]`).join(" ");
      content = content ? `${content} ${imgRef}` : `用户发来图片：${images.join("、")}`;
    }
    if (Array.isArray(files) && files.length > 0) {
      const fileRef = files.map((p) => `[文件: ${p}]`).join(" ");
      content = content ? `${content} ${fileRef}` : `用户发来文件：${files.join("、")}`;
    }
    if (!content) return;

    const queueLen = (this._deliverPending.get(sender) ?? 0) + 1;
    this.log?.info?.(`[${this.tag}] 收到来自 ${sender}: ${String(content).slice(0, 80)}...（队列 ${queueLen}）`);

    try {
      const workspace = this.workspaceFor(sender);
      const reply = await this.deliver(sender, workspace, content);
      if (reply && this.autoReply) {
        const t0 = Date.now();
        // 从回复中提取文件引用（[文件: path] 等），有则随文本一起发送
        const { files, text: replyText } = extractFilesFromText(reply);
        if (files.length > 0) {
          this.log?.info?.(`[${this.tag}] 回复附带 ${files.length} 个文件`);
        }
        await this.adapter.send(sender, replyText || reply, files.length > 0 ? { files } : undefined);
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
    }).catch(() => {});
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
    // 会话归属：live agent 直接复用；持久化会话 resume；都没有才 create 新 agent。
    const live = this.agents.get(id);
    let agent = live;
    if (agent === void 0) {
      if (await this.isPersisted(id)) {
        const resumed = await this.agents.resume({
          resumeSessionId: id,
          agentOptions: agentOptionsArg,
          ...(setup.setup === void 0 ? {} : { setup: setup.setup }),
        });
        agent = resumed.agent;
      } else {
        const created = await this.agents.create({
          sessionId: id,
          agentOptions: agentOptionsArg,
          meta: {
            ...(workspace ? { cwd: workspace } : {}),
            ...(setup.agentPreset === void 0 ? {} : { agentPreset: setup.agentPreset }),
          },
          ...(setup.setup === void 0 ? {} : { setup: setup.setup }),
        });
        agent = created.agent;
      }
    }

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
  async send(to, text, opts) {
    return this.adapter.send(to, text, opts);
  }

  describe() {
    return this.adapter.describe();
  }
}
