/**
 * adapters/photon.mjs — Photon 云端托管线路传输适配器
 *
 * Photon 提供托管 iMessage 号码（hosted line），无需 Mac/SIM/Apple ID。用户经
 * RFC 8628 device flow 在浏览器授权后，agent 通过 Spectrum（WebSocket）与
 * Photon 云通信收发文本。
 *
 * v1 仅支持纯文本一对一私聊；不支持附件/图片/群聊/表情回复。Markdown 会被清理。
 */
import { WebSocket } from "ws";
import { EventEmitter } from "node:events";

/** 简单重试退避。 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PhotonAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this.socket = null;
    this._connected = false;
    this._stopped = false;
    this._backoff = 1000;
    this._handler = null;
  }

  get auth() {
    const cfg = this.getConfig();
    return cfg.photonCredential || null;
  }

  async start(handler) {
    this._handler = handler;
    await this._connect();
  }

  async _connect() {
    if (this._stopped) return;
    const cfg = this.getConfig();
    const cred = this.auth;
    if (!cred?.project?.secret || !cred?.accessToken) {
      this.log.warn?.("[photon] 未授权，等待用户完成 device flow 后重连");
      this.emit("state", { phase: "unauthorized" });
      this._backoff = Math.min(this._backoff * 2, 30000);
      setTimeout(() => this._connect(), this._backoff).unref?.();
      return;
    }
    const url = `${cfg.photonApiOrigin.replace(/\/$/, "")}/spectrum`;
    this.log.info?.(`[photon] 连接 Spectrum ${url}`);
    try {
      const socket = new WebSocket(url, {
        headers: { Authorization: `Bearer ${cred.accessToken}` },
      });
      this.socket = socket;
      socket.on("open", () => {
        this._connected = true;
        this._backoff = 1000;
        this.emit("state", { phase: "listening" });
        this.log.info?.("[photon] Spectrum 已连接");
      });
      socket.on("message", (raw) => this._onMessage(raw));
      socket.on("error", (e) => this.log.warn?.(`[photon] socket error ${e.message}`));
      socket.on("close", () => {
        this._connected = false;
        this.emit("state", { phase: "disconnected" });
        if (!this._stopped) setTimeout(() => this._connect(), this._backoff).unref?.();
      });
    } catch (e) {
      this.log.error?.(`[photon] 连接失败 ${e.message}`);
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
    const payload = msg.data || msg;
    const sender = payload.senderPhoneNumber || payload.from || null;
    if (!sender) return;
    const text = String(payload.text || payload.body || "").replace(/\uFFFC/g, "").trim();
    if (!text) return;
    this._handler?.({
      sender,
      text,
      images: [],
      raw: payload,
      dedupeId: payload.id || `${sender}:${Date.now()}`,
    }).catch((e) => this.log.error?.(`[photon] 处理失败: ${e.message}`));
  }

  async send(to, text) {
    if (!this._connected) throw new Error("photon 未连接");
    this.socket?.send(JSON.stringify({ type: "send", to, text }));
  }

  async setTyping() {
    // Photon v1 不支持 typing 指示器
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
    return `Photon 云端通道 (${this._connected ? "已连接" : "未连接"})`;
  }
}
