/**
 * adapters/wecom.mjs — 企业微信开放 API 传输适配器
 *
 * 自建应用：corpId/agentId/corpSecret 换 access_token，发送消息接口发。
 * 接收侧由企业微信回调 URL（callbackToken 验签）驱动，或长轮询拉取应用消息。
 * 此处实现 access_token + 发送路径，接收侧留回调接入点。
 */
import { EventEmitter } from "node:events";
import { fetch } from "undici";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = "https://qyapi.weixin.qq.com";

export class WecomAdapter extends EventEmitter {
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
    const res = await fetch(`${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.corpSecret)}`);
    const data = await res.json();
    if (data.errcode !== 0) throw new Error(data.errmsg || "gettoken 错误");
    this._token = data.access_token;
    this._tokenExpire = Date.now() + 7200 * 1000 - 60000;
    return this._token;
  }

  async start(handler) {
    this._handler = handler;
    if (this._polling) return;
    this._polling = this._loop();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[wecom] 开始监听（回调/轮询接入点）");
  }

  async _loop() {
    let backoff = 1000;
    while (!this._stopped) {
      try {
        const cfg = this.getConfig();
        await this._accessToken(cfg);
        // 回调 URL 收消息由企业微信推送驱动；此处轮询确保 token 刷新与心跳。
        await sleep(backoff);
        backoff = 3000;
      } catch (e) {
        this.log.warn?.(`[wecom] 轮询出错 ${e.message}`);
        backoff = Math.min(backoff * 2, 20000);
      }
      await sleep(backoff);
    }
  }

  async send(to, text) {
    const cfg = this.getConfig();
    const token = await this._accessToken(cfg);
    const res = await fetch(`${BASE}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: to,
        msgtype: "text",
        agentid: Number(cfg.agentId),
        text: { content: text },
        safe: 0,
      }),
    });
    const data = await res.json();
    if (data.errcode !== 0) throw new Error(data.errmsg || "send 错误");
    return data;
  }

  async setTyping() {
    // 企业微信无 typing
  }

  async stop() {
    this._stopped = true;
    this._polling = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `企业微信通道 (${cfg.corpId ? "已配置" : "未配置 corpId"})`;
  }
}
