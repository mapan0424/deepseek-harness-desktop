/**
 * adapters/whatsapp.mjs — WhatsApp Meta Cloud API 传输适配器
 *
 * Webhook 收（由 Meta 回调）+ Graph API 发（POST）。
 * 简化：用 Graph API 发送。接收侧通过 webhook（v19.0）回调事件。
 * 实际生产应对接 Meta 的 webhook 验证 + 事件解耦。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GRAPH = "https://graph.facebook.com/v19.0";

export class WhatsAppAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._polling = null;
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[whatsapp] 开始运行");
  }

  async _loop() {
    let backoff = 3000;
    while (!this._stopped) {
      try {
        await sleep(backoff);
        backoff = 3000;
      } catch (e) {
        this.log.warn?.(`[whatsapp] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    if (!res.ok) throw new Error(`send HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // WhatsApp 无 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `WhatsApp 通道 (${cfg.phoneNumberId ? "已配置" : "未配置 phoneNumberId"})`;
  }
}
