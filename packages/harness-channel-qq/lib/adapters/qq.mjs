/**
 * adapters/qq.mjs — OneBot v11 QQ 传输适配器
 *
 * 通过 OneBot v11 实现（NapCat / Lagrange / LLOneBot）的 WebSocket 端点收发 QQ 消息。
 * 一条 WS 连接同时接收事件推送（post_type=message）与调用 API（send_private_msg /
 * send_group_msg），无需额外 HTTP。
 *
 * 接口约定（与 imessage 的 imsg/photon/relay 一致）：
 *   start(handler)     连接并监听；handler({ sender, text, images, raw, dedupeId })
 *   send(to,text)      向单个 user_id 或群发送文本
 *   setTyping()        OneBot v11 无 typing 指示器（no-op）
 *   stop()             断开连接
 *   describe()         -> string 状态描述
 *
 * 出站目标 `to` 约定：
 *   - 私聊目标：QQ 号字符串（如 "10001"）
 *   - 群聊目标："group:<群号>"（如 "group:123456"）
 * 群聊目标由调用方（message 工具 / 路由）构造，适配器负责任何目标都能发。
 */
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 从 OneBot v11 的 message 段数组中提取 [文本, 图片URL数组]。 */
export function parseMessageSegments(segments) {
  let text = "";
  const images = [];
  if (!Array.isArray(segments)) return { text, images };
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg.data || {};
    switch (seg.type) {
      case "text":
        text += typeof s.text === "string" ? s.text : "";
        break;
      case "image":
        if (typeof s.url === "string" && s.url) images.push(s.url);
        else if (typeof s.file === "string" && s.file) images.push(s.file);
        break;
      case "face":
        text += "[表情]";
        break;
      case "at":
        text += s.qq === "all" ? "[at所有人]" : `[at:${s.qq || "?"}]`;
        break;
      case "reply":
        text += `[回复:${s.id || "?"}]`;
        break;
      default:
        text += segmentToText(seg.type, s);
    }
  }
  return { text, images };
}

/** 兜底：把未知段转成可读文本。 */
function segmentToText(type, data) {
  if (!type) return "";
  const known = ["file", "record", "video", "music", "forward", "json", "card"];
  if (known.includes(type)) return `[${type}]`;
  return "";
}

export class QQAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this.socket = null;
    this._connected = false;
    this._stopped = false;
    this._backoff = 1000;
    this._handler = null;
    this._msgId = 0;
    this._pending = new Map();
  }

  /** 连接端点归一化：补 ws:// 前缀。 */
  _endpoint(cfg) {
    const raw = cfg.wsUrl || cfg.wsAddr || "ws://127.0.0.1:3001";
    if (/^wss?:\/\//i.test(raw)) return raw;
    return `ws://${raw}`;
  }

  async start(handler) {
    this._handler = handler;
    await this._connect();
  }

  async _connect() {
    if (this._stopped) return;
    const cfg = this.getConfig();
    const url = this._endpoint(cfg);
    const headers = {};
    if (cfg.token) headers["Authorization"] = `Bearer ${cfg.token}`;

    this.log.info?.(`[qq] 连接 OneBot ${url}`);
    try {
      const socket = new WebSocket(url, { headers });
      this.socket = socket;
      this._backoff = 1000;
      socket.on("open", () => {
        this._connected = true;
        this.emit("state", { phase: "listening" });
        this.log.info?.("[qq] OneBot WS 已连接");
      });
      socket.on("message", (raw) => this._onMessage(raw));
      socket.on("error", (e) => this.log.warn?.(`[qq] socket error ${e.message}`));
      socket.on("close", () => {
        this._connected = false;
        this.emit("state", { phase: "disconnected" });
        if (!this._stopped) setTimeout(() => this._connect(), this._backoff).unref?.();
      });
    } catch (e) {
      this.log.error?.(`[qq] 连接失败 ${e.message}`);
      this.emit("state", { phase: "failed", error: e.message });
      if (!this._stopped) setTimeout(() => this._connect(), this._backoff).unref?.();
    }
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    // API 响应（带 echo）：匹配 pending
    if (msg?.echo !== undefined && this._pending.has(String(msg.echo))) {
      const { resolve, reject } = this._pending.get(String(msg.echo));
      this._pending.delete(String(msg.echo));
      if (msg.retcode && msg.retcode !== 0) reject(new Error(msg.wording || JSON.stringify(msg)));
      else resolve(msg.data);
      return;
    }

    // 事件推送
    if (msg.post_type !== "message") return;
    // 只处理自己账号之外的消息（避免回声）
    if (String(msg.self_id) === String(msg.user_id)) return;

    const messageType = msg.message_type; // private | group
    const senderUserId = msg.user_id || msg.sender?.user_id || null;
    if (!senderUserId) return;

    const { text, images } = parseMessageSegments(msg.message);
    if (!text && images.length === 0) return;

    const dedupeId = msg.message_id || `${messageType}:${senderUserId}:${Date.now()}`;
    const sender = messageType === "group" ? `group:${msg.group_id}` : String(senderUserId);

    this._handler?.({
      sender,
      text,
      images,
      raw: msg,
      dedupeId: String(dedupeId),
    }).catch((e) => this.log.error?.(`[qq] 处理失败: ${e.message}`));
  }

  async _call(action, params) {
    if (!this._connected) throw new Error("qq 未连接");
    const echo = `req_${this._msgId++}`;
    const req = { action, params: params || {}, echo };
    return new Promise((resolve, reject) => {
      this._pending.set(String(echo), { resolve, reject });
      this.socket?.send(JSON.stringify(req));
      // 超时兜底
      setTimeout(() => {
        if (this._pending.has(String(echo))) {
          this._pending.delete(String(echo));
          reject(new Error(`qq 调用 ${action} 超时`));
        }
      }, 15000).unref?.();
    });
  }

  async send(to, text) {
    const target = String(to || "").trim();
    if (!target) throw new Error("qq 无目标");
    if (target.startsWith("group:")) {
      const groupId = target.slice("group:".length);
      return this._call("send_group_msg", { group_id: Number(groupId), message: text });
    }
    // 私聊（默认）
    return this._call("send_private_msg", { user_id: Number(target), message: text });
  }

  /** OneBot v11 无 typing 指示器。 */
  async setTyping() {
    // no-op
  }

  async stop() {
    this._stopped = true;
    try {
      this.socket?.close();
    } catch {}
    this.socket = null;
    this._connected = false;
  }

  describe() {
    const cfg = this.getConfig();
    return `QQ OneBot v11 通道 (${this._endpoint(cfg)}) ${this._connected ? "已连接" : "未连接"}`;
  }
}
