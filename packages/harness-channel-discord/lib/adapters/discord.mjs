/**
 * adapters/discord.mjs — Discord Bot 网关传输适配器
 *
 * 通过 REST + Gateway WS 收发。简化：用 REST 拉取频道消息 + 发送。
 * 实际生产应对接 Gateway（websocket）收事件。此处演示 REST 发送 + 简化接收。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API = "https://discord.com/api/v10";

export class DiscordAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._lastId = null;
    this._polling = null;
    this._channelId = process.env.DISCORD_CHANNEL_ID || "";
  }

  _headers(cfg) {
    return { Authorization: `Bot ${cfg.token}` };
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[discord] 开始轮询频道消息");
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        const params = new URLSearchParams({ limit: "1" });
        if (this._lastId) params.set("after", this._lastId);
        const res = await fetch(`${API}/channels/${this._channelId}/messages?${params}`, {
          headers: this._headers(cfg),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const msgs = await res.json();
        for (const m of msgs || []) {
          if (m.author?.bot) continue;
          if (m.id === this._lastId) continue;
          this._lastId = m.id;
          this._onMessage(m);
        }
        backoff = (msgs?.length) ? 500 : 3000;
      } catch (e) {
        this.log.warn?.(`[discord] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  _onMessage(m) {
    const sender = String(m.author?.id);
    const text = m.content || "";
    const images = (m.attachments || []).filter((a) => a.content_type?.startsWith("image/")).map((a) => a.url);
    if (!text && images.length === 0) return;
    this._handler?.({
      sender,
      text,
      images,
      raw: m,
      dedupeId: m.id,
    }).catch((e) => this.log.error?.(`[discord] 处理失败: ${e.message}`));
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const res = await fetch(`${API}/channels/${to}/messages`, {
      method: "POST",
      headers: { ...this._headers(cfg), "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) throw new Error(`send HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // Discord 无 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `Discord 通道 (${cfg.token ? "已配置" : "未配置 token"})`;
  }
}
