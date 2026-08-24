/**
 * adapters/dingtalk.mjs — 钉钉开放 API 传输适配器
 *
 * 企业内部应用机器人：appKey/appSecret 换 accessToken，robot 接口收发。
 * 实际生产对接钉钉 Stream 模式（免公网 webhook）用 SDK；此处实现 accessToken + 发送路径，
 * 接收侧留 Stream/回调接入点（同云端 webhook 类通道一致，静态成型）。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = "https://api.dingtalk.com";

export class DingtalkAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._polling = null;
    this._token = null;
    this._tokenExpire = 0;
  }

  async _accessToken(cfg) {
    if (this._token && Date.now() < this._tokenExpire) return this._token;
    const res = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(cfg.appKey)}&appsecret=${encodeURIComponent(cfg.appSecret)}`,
    );
    const data = await res.json();
    if (data.errcode !== 0) throw new Error(data.errmsg || "gettoken 错误");
    this._token = data.access_token;
    this._tokenExpire = Date.now() + (data.expires_in || 7200) * 1000 - 60000;
    return this._token;
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[dingtalk] 开始监听（Stream/回调接入点）");
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        await this._accessToken(cfg);
        // Stream 模式收消息由 SDK/回调驱动；此处轮询确保 token 刷新与心跳。
        await sleep(backoff);
        backoff = 3000;
      } catch (e) {
        this.log.warn?.(`[dingtalk] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const token = await this._accessToken(cfg);
    const convId = to; // 目标：会话ID（chatId）或 userId
    const res = await fetch(`${BASE}/v1.0/im/robot/interactiveCards/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify({ conversationId: convId }),
    });
    if (!res.ok) throw new Error(`send HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // 钉钉无 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `钉钉通道 (${cfg.appKey ? "已配置" : "未配置 appKey"})`;
  }
}
