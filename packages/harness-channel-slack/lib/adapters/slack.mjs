/**
 * adapters/slack.mjs — Slack Socket Mode 传输适配器
 *
 * Socket Mode（apps.connections.open）走 WS，无需公开 HTTP 端点。
 * 简化：用 Web API 收/发。此处演示 chat.postMessage + 轮询拉取。
 * 实际生产应对接 Socket Mode 的 WS 事件流。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SlackAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._polling = null;
    this._channelId = process.env.SLACK_CHANNEL_ID || "";
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[slack] 开始轮询会话历史");
  }

  async _loop() {
    let backoff = 3000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        // 简化：拉取 conversations.history（需指定 channel）。实际用 Socket Mode 收事件。
        if (this._channelId) {
          const res = await fetch(`https://slack.com/api/conversations.history?channel=${this._channelId}&limit=1`, {
            headers: { Authorization: `Bearer ${cfg.botToken}` },
          });
          const data = await res.json();
          if (data.ok && data.messages?.length) {
            const m = data.messages[0];
            if (m.user && m.user !== "USLACKBOT" && m.subtype !== "bot_message" && !m.bot_id) {
              this._onMessage(m);
            }
          }
        }
        await sleep(backoff);
        backoff = 3000;
      } catch (e) {
        this.log.warn?.(`[slack] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  _onMessage(m) {
    const sender = String(m.user);
    const text = m.text || "";
    if (!text) return;
    this._handler?.({
      sender,
      text,
      images: [],
      raw: m,
      dedupeId: m.ts,
    }).catch((e) => this.log.error?.(`[slack] 处理失败: ${e.message}`));
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const res = await fetch(`https://slack.com/api/chat.postMessage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: to, text }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "postMessage 错误");
    return data;
  }

  async setTyping() {
    // Slack 无 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `Slack 通道 (${cfg.botToken ? "已配置" : "未配置 botToken"})`;
  }
}
