/**
 * adapters/relay.mjs — 云中继传输适配器（Claw Messenger / Sendblue 等消息 API）
 *
 * 与 Photon 不同，relay 是"纯消息中转"：agent 连的是第三方云 API，由第三方处理
 * Apple 协议。区别在于数据会经过第三方，但开箱即用、无需 Mac/SIM/Apple ID。
 *
 * provider 抽象：
 *   - "claw":     HTTP Base + 独立认证头（Bearer / X-Api-Key），JSON 收发送
 *   - "sendblue": 同构，统一 mapSend/mapInbound 由 gateway 传入
 *
 * 通过长轮询（poll）拉取入站 + POST 出站，避免常驻 WS 依赖。
 */
import { fetch } from "undici";
import { EventEmitter } from "node:events";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** provider 元数据：请求头、URL 模板、字段映射。 */
const PROVIDERS = {
  claw: {
    base: process.env.DSH_IM_RELAY_API_BASE || "",
    inboundPath: "/messages",
    sendPath: "/send",
    authHeaders: (cfg) => ({
      Authorization: `Bearer ${cfg.relayToken || ""}`,
      "Content-Type": "application/json",
    }),
    mapInbound: (m) => ({ sender: m.sender, text: m.text, images: m.images || [] }),
    mapSend: (to, text) => ({ to, text }),
  },
  sendblue: {
    base: process.env.DSH_IM_RELAY_API_BASE || "https://api.sendblue.co",
    inboundPath: "/messages",
    sendPath: "/send",
    authHeaders: (cfg) => ({
      "SendBlue-API-Key": cfg.relayApiKey || "",
      "SendBlue-API-Secret": cfg.relayApiSecret || "",
      "Content-Type": "application/json",
    }),
    mapInbound: (m) => ({ sender: m.from_number, text: m.text, images: [] }),
    mapSend: (to, text) => ({ number: to, text }),
  },
};

export class RelayAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._polling = null;
    this._handler = null;
    this._cursor = null;
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[relay] 开始轮询入站");
  }

  _provider() {
    const cfg = this.getConfig();
    const name = cfg.relayProvider || "claw";
    return PROVIDERS[name] || PROVIDERS.claw;
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const provider = this._provider();
        const url = `${provider.base.replace(/\/$/, "")}${provider.inboundPath}`;
        const res = await fetch(url, {
          headers: { ...provider.authHeaders(this.getConfig()) },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.messages || [];
        for (const msg of items) {
          const mapped = provider.mapInbound(msg);
          if (!mapped.sender || (!mapped.text && !(mapped.images?.length))) continue;
          if (mapped.sender === "self") continue;
          this._handler?.({
            sender: mapped.sender,
            text: String(mapped.text || ""),
            images: mapped.images || [],
            raw: msg,
            dedupeId: msg.id || `${mapped.sender}:${Date.now()}`,
          }).catch((e) => this.log.error?.(`[relay] 处理失败: ${e.message}`));
        }
        // 有消息则快速轮询，空闲则退避
        backoff = items.length ? 500 : Math.min(Math.max(backoff, 3000) * 1.5, 20000);
      } catch (e) {
        this.log.warn?.(`[relay] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 30000);
      }
      await sleep(backoff);
    }
  }

  async send(to, text) {
    const provider = this._provider();
    const url = `${provider.base.replace(/\/$/, "")}${provider.sendPath}`;
    const body = provider.mapSend(to, text);
    const res = await fetch(url, {
      method: "POST",
      headers: { ...provider.authHeaders(this.getConfig()) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`send HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // relay 不支持 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    return `云中继通道 (${this.getConfig().relayProvider})`;
  }
}
