/**
 * adapters/wecom.mjs — 企业微信智能机器人 WebSocket 长连接适配器
 *
 * 协议（对齐官方 @wecom/aibot-node-sdk v1.0.7 实测）：
 *   - 连接：wss://openws.work.weixin.qq.com（主动出站，无需公网 URL，无需加解密）
 *   - 认证：aibot_subscribe { bot_id, secret }，errcode=0 成功
 *   - 心跳：30s ping；服务端超时断开
 *   - 收消息：aibot_msg_callback { msgid, chattype, from.userid, msgtype, text/file/image... }
 *   - 回消息：aibot_respond_msg（必须透传回调的 headers.req_id，msgtype 只能是 stream）
 *   - 主动发：aibot_send_msg { chatid, msgtype:"markdown" }（不依赖回调，适合通知）
 *   - 流式窗口：同一次回调的回复须在 6 分钟内完成，超时 errcode=846608 → 降级主动发送
 */
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire(import.meta.url);

function getWebSocketImpl() {
  const candidates = [
    "ws",
    "./node_modules/ws",
    "../node_modules/ws",
    "../../node_modules/ws",
    "/Users/anarkh/.dsh/profiles/web/node_modules/ws",
    "/Users/anarkh/.dsh/profiles/node_modules/ws",
    "/Users/anarkh/.dsh/node_modules/ws",
    "/Applications/DeepSeek Harness.app/Contents/Resources/resources/dsh-runtime/node_modules/ws",
  ];
  for (const c of candidates) {
    try {
      const mod = require(c);
      if (mod && (typeof mod === "function" || mod.WebSocket)) {
        return mod.WebSocket || mod;
      }
    } catch {}
  }
  return globalThis.WebSocket;
}

const WebSocketImpl = getWebSocketImpl();

const WS_URL = "wss://openws.work.weixin.qq.com";
const HEARTBEAT_MS = 30_000;
const REPLY_WINDOW_MS = 5.5 * 60 * 1000; // 官方 6 分钟窗口，留 30s 余量
const STREAM_EXPIRED_ERRCODE = 846608;
const DEDUPE_TTL_MS = 10 * 60 * 1000;

const rand = () => randomBytes(5).toString("hex");
const reqId = (prefix) => `${prefix}_${Date.now()}_${rand()}`;

export class WecomAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._ws = null;
    this._heartbeat = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._authed = false;
    /** 每个会话最近一次回调上下文：sender → { reqId, at }，回复时透传 reqId */
    this._lastFrames = new Map();
    /** msgid 去重（带 TTL 清理） */
    this._seen = new Map();
  }

  /** 判断凭据是否配置完整 */
  static isConfigured(cfg) {
    return Boolean(String(cfg?.botId ?? "").trim() && String(cfg?.secret ?? "").trim());
  }

  async start(handler) {
    this._handler = handler;
    this._stopped = false;
    this._connect();
    this.emit("state", { phase: "listening" });
  }

  _connect() {
    if (this._stopped) return;
    const cfg = this.getConfig() ?? {};
    if (!WecomAdapter.isConfigured(cfg)) {
      this.log.warn?.("[wecom] botId/secret 未配置，无法建立长连接");
      return;
    }
    this._botId = cfg.botId.trim();
    this._secret = cfg.secret.trim();
    this._authed = false;
    this.log.info?.(`[wecom] 连接 ${WS_URL} ...`);
    try {
      this._ws = new WebSocketImpl(WS_URL, {});
    } catch (e) {
      this.log.warn?.(`[wecom] 建连失败: ${e.message}`);
      this._scheduleReconnect();
      return;
    }
    this._setupWs();
  }

  _setupWs() {
    const ws = this._ws;
    if (!ws) return;

    ws.on("open", () => {
      this.log.info?.("[wecom] ✓ 握手成功，发送订阅");
      this._send({
        cmd: "aibot_subscribe",
        headers: { req_id: reqId("aibot_subscribe") },
        body: { bot_id: this._botId, secret: this._secret },
      });
    });

    ws.on("message", (data) => {
      let frame;
      try {
        frame = JSON.parse(data.toString().replace(/[\x00-\x08\x0B-\x0D\x0E-\x1F]/g, ""));
      } catch (e) {
        this.log.warn?.(`[wecom] 帧解析失败: ${e.message}`);
        return;
      }
      this._handleFrame(frame);
    });

    ws.on("ping", () => ws.pong?.());
    ws.on("error", (e) => this.log.warn?.(`[wecom] WS 错误: ${e.message}`));
    ws.on("close", (code, reason) => {
      this._teardownHeartbeat();
      this._authed = false;
      if (this._stopped) return;
      this.log.warn?.(`[wecom] 连接断开 code=${code} ${reason || ""}，准备重连`);
      this._scheduleReconnect();
    });
  }

  _handleFrame(frame) {
    const cmd = frame.cmd ?? "";

    // 消息推送 → 入站
    if (cmd === "aibot_msg_callback") {
      this._onCallback(frame);
      return;
    }
    // 事件推送（enter_chat 等）——暂只记录
    if (cmd === "aibot_event_callback") {
      const evtype = frame.body?.event?.eventtype ?? "";
      this.log.info?.(`[wecom] 事件: ${evtype}`);
      if (evtype === "disconnected_event") {
        // 服务端因新连接踢掉本连接：不自动重连（避免互踢循环），等下次 start
        this.log.warn?.("[wecom] 服务端通知：新连接已建立，本连接即将断开");
      }
      return;
    }
    // 认证/心跳/回复回执（无 cmd，按 req_id 前缀分派）
    const rid = frame.headers?.req_id ?? "";
    if (rid.startsWith("aibot_subscribe")) {
      if (frame.errcode === 0) {
        this._authed = true;
        this._reconnectAttempts = 0;
        this._startHeartbeat();
        this.log.info?.("[wecom] ✓ 认证成功，开始接收消息");
        this.emit("state", { phase: "connected" });
      } else {
        this.log.error?.(`[wecom] ✗ 认证失败 errcode=${frame.errcode} ${frame.errmsg}`);
        this._ws?.terminate(); // 触发 close → 重连（认证失败会一直重试到上限）
      }
      return;
    }
    if (rid.startsWith("ping")) {
      if (frame.errcode !== 0) this.log.warn?.(`[wecom] 心跳异常 errcode=${frame.errcode}`);
      return;
    }
    // 回复回执
    if (frame.errcode !== undefined && frame.errcode !== 0) {
      this.log.warn?.(`[wecom] 回执 errcode=${frame.errcode} ${frame.errmsg} (req_id=${rid.slice(0, 40)})`);
    }
  }

  /** 入站消息：去重后交给网关 handler */
  _onCallback(frame) {
    const body = frame.body ?? {};
    const msgid = body.msgid ?? "";
    if (msgid && this._seen.has(msgid)) return;
    if (msgid) {
      this._seen.set(msgid, Date.now());
      this._pruneSeen();
    }
    // 记录回复窗口上下文（sender → 最近回调 reqId）
    const sender = String(body.chatid || body.from?.userid || "");
    if (!sender) return;
    this._lastFrames.set(sender, { reqId: frame.headers?.req_id ?? "", at: Date.now() });

    // 组装入站（text 为主；图片/文件留接入点，下一步接 media-cache）
    let text = "";
    const images = [];
    const files = [];
    switch (body.msgtype) {
      case "text":
        text = String(body.text?.content ?? "").trim();
        break;
      case "voice":
        text = String(body.voice?.content ?? "").trim(); // 语音已转文本
        break;
      case "image":
      case "file":
      case "mixed":
      default:
        text = `[${body.msgtype}]`; // 媒体消息先占位（下载/解密后续接入）
        break;
    }
    if (body.msgtype === "text" && !text) return;

    this.log.info?.(`[wecom] 收到消息 from=${body.from?.userid ?? "?"} chat=${sender} type=${body.msgtype}`);
    Promise.resolve(
      this._handler?.({
        sender,
        text,
        images,
        files,
        raw: frame,
        kind: "aibot",
        dedupeId: msgid || `${sender}:${Date.now()}`,
      }),
    ).catch?.((e) => this.log.error?.(`[wecom] 处理失败: ${e.message}`));
  }

  /**
   * 发送消息。
   * 优先被动回复（透传最近回调的 req_id，stream 格式）；
   * 无窗口/流式过期时降级 aibot_send_msg 主动发送（markdown）。
   */
  async send(to, text) {
    const content = String(text ?? "").trim();
    if (!content) return { ok: false };
    const ctx = this._lastFrames.get(to);
    const fresh = ctx && Date.now() - ctx.at < REPLY_WINDOW_MS;

    if (fresh && ctx.reqId) {
      try {
        await this._sendReply(ctx.reqId, content);
        return { ok: true };
      } catch (e) {
        const expired =
          e?.errcode === STREAM_EXPIRED_ERRCODE || String(e.message).includes(String(STREAM_EXPIRED_ERRCODE));
        this.log.warn?.(`[wecom] 被动回复失败（${expired ? "流式窗口过期" : e.message}），降级主动发送`);
      }
    }
    return this._sendActive(to, content);
  }

  /** 被动回复：透传回调 req_id + stream 格式（finish=true 单条完成） */
  _sendReply(callbackReqId, content) {
    return new Promise((resolve) => {
      if (this._ws?.readyState !== 1) return resolve({ ok: false, error: "WS 未连接" });
      this._send({
        cmd: "aibot_respond_msg",
        headers: { req_id: callbackReqId },
        body: {
          msgtype: "stream",
          stream: { id: `stream_${Date.now()}_${rand()}`, finish: true, content },
        },
      });
      // 回执异步到达（错误会打日志），短等后即返回，不阻塞网关
      setTimeout(() => resolve({ ok: true }), 1500);
    });
  }

  /** 主动发送：aibot_send_msg（单聊 chatid 填 userid，群聊填 chatid），支持 markdown */
  _sendActive(chatId, content) {
    return new Promise((resolve) => {
      if (this._ws?.readyState !== 1) return resolve({ ok: false, error: "WS 未连接" });
      this._send({
        cmd: "aibot_send_msg",
        headers: { req_id: reqId("aibot_send_msg") },
        body: { chatid: chatId, msgtype: "markdown", markdown: { content } },
      });
      setTimeout(() => resolve({ ok: true }), 1500);
    });
  }

  _send(obj) {
    try {
      this._ws?.send(JSON.stringify(obj));
    } catch (e) {
      this.log.warn?.(`[wecom] 发送失败: ${e.message}`);
    }
  }

  _startHeartbeat() {
    this._teardownHeartbeat();
    this._heartbeat = setInterval(() => {
      if (this._ws?.readyState === 1) this._send({ cmd: "ping", headers: { req_id: reqId("ping") } });
    }, HEARTBEAT_MS);
    this._heartbeat.unref?.();
  }

  _teardownHeartbeat() {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  }

  _scheduleReconnect() {
    if (this._stopped || this._reconnectTimer) return;
    this._reconnectAttempts += 1;
    if (this._reconnectAttempts > 10) {
      this.log.error?.("[wecom] 重连次数超限（10），停止重连；请检查网络/凭据后重启");
      return;
    }
    const delay = Math.min(1000 * 2 ** (this._reconnectAttempts - 1), 30000);
    this.log.info?.(`[wecom] ${delay}ms 后第 ${this._reconnectAttempts} 次重连`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
    this._reconnectTimer.unref?.();
  }

  _pruneSeen() {
    const now = Date.now();
    if (this._seen.size < 500) return;
    for (const [k, t] of this._seen) {
      if (now - t > DEDUPE_TTL_MS) this._seen.delete(k);
    }
  }

  async setTyping() {
    // 企微智能机器人无 typing
  }

  async stop() {
    this._stopped = true;
    this._teardownHeartbeat();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    try { this._ws?.removeAllListeners(); this._ws?.close(); } catch { /* noop */ }
    this._ws = null;
    this._lastFrames.clear();
    this._seen.clear();
  }

  describe() {
    const cfg = this.getConfig() ?? {};
    const state = this._authed ? "已连接" : WecomAdapter.isConfigured(cfg) ? "连接中" : "未配置 botId/secret";
    return `企业微信智能机器人通道 (${state})`;
  }
}
