/**
 * adapters/feishu.mjs — 飞书开放 API 传输适配器
 *
 * 应用事件订阅（webhook 收）+ 开放接口发。通过长轮询拉取事件或对接飞书开放平台。
 * 仅演示纯文本 im 消息。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class FeishuAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._polling = null;
  }

  async _tenantAccessToken(cfg) {
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    });
    const data = await res.json();
    return data.tenant_access_token || data.access_token;
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[feishu] 开始轮询事件");
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        const token = await this._tenantAccessToken(cfg);
        // 简化：实际用飞书事件订阅 webhook 收消息。此处留接入点。
        // 通过 fetch 拉取需要特定权限，这里演示轮询心跳。
        void token;
        await sleep(backoff);
        backoff = 3000;
      } catch (e) {
        this.log.warn?.(`[feishu] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const token = await this._tenantAccessToken(cfg);
    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: to,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    });
    if (!res.ok) throw new Error(`sendMessage HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // 飞书 typing 需单独 API，此处 no-op
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `飞书通道 (${cfg.appId ? "已配置" : "未配置 appId"})`;
  }
}
