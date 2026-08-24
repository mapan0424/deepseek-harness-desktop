/**
 * adapters/telegram.mjs — Telegram Bot API 传输适配器
 *
 * 官方开放 Bot API，getUpdates 长轮询收，sendMessage 发。最简单、最稳。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TelegramAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._offset = null;
    this._handler = null;
    this._polling = null;
  }

  _api(cfg) {
    return (cfg.token && cfg.token.trim())
      ? `https://api.telegram.org/bot${cfg.token}`
      : (process.env.TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}` : "");
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[telegram] 开始长轮询 getUpdates");
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        const api = this._api(cfg);
        if (!api) throw new Error("telegram token 未配置");
        const url = `${api}/getUpdates?timeout=30&allowed_updates=["message"]${this._offset ? `&offset=${this._offset}` : ""}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || "getUpdates 错误");
        for (const u of data.result || []) {
          this._offset = u.update_id + 1;
          this._onUpdate(u);
        }
        backoff = (data.result?.length) ? 500 : 1000;
      } catch (e) {
        this.log.warn?.(`[telegram] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  _onUpdate(u) {
    if (!u || u.message?.from?.id === undefined) return;
    if (u.message.text === undefined && !u.message.photo) return;
    const from = u.message.from;
    const sender = String(from.id);
    const text = u.message.text || "";
    const images = (u.message.photo || []).slice(-1).map((p) => p.file_id);
    const dedupeId = u.message.message_id || `${sender}:${Date.now()}`;
    this._handler?.({
      sender,
      text,
      images,
      raw: u.message,
      dedupeId: String(dedupeId),
    }).catch((e) => this.log.error?.(`[telegram] 处理失败: ${e.message}`));
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const api = this._api(cfg);
    if (!api) throw new Error("telegram token 未配置");
    const res = await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(to), text }),
    });
    if (!res.ok) throw new Error(`sendMessage HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // Telegram 有 ChatAction；此处 no-op（避免过度调用）
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `Telegram 通道 (${cfg.token ? "已配置" : "未配置 token"})`;
  }
}
