/**
 * adapters/dingtalk.mjs — 钉钉智能机器人 Stream 长连接适配器
 *
 * 协议与规范：
 *   - 连网关：POST https://api.dingtalk.com/v1.0/gateway/connections/open
 *     订阅 /v1.0/im/bot/messages/get 回调和 EVENT。
 *   - 建立 WebSocket 长连接至返回的 endpoint wss://...
 *   - 接收 SYSTEM ping 自动回复 200 pong；
 *   - 接收 CALLBACK /v1.0/im/bot/messages/get：
 *     1. 立即返回 ACK 避免服务端 60s 重复推送；
 *     2. 记录 sessionWebhook 上下文；
 *     3. 去重并提交给 GatewayCore 消息总线；
 *   - 发送：优先使用带会话时效的 sessionWebhook（支持 markdown 渲染）；
 *     若无上下文或过期则降级通过 OpenAPI (robot/oToMessages 或 groupMessages) 发送。
 */
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function getWebSocketImpl() {
  const candidates = [
    "ws",
    "./node_modules/ws",
    "../node_modules/ws",
    "../../node_modules/ws",
    "/Applications/DeepSeek Harness.app/Contents/Resources/resources/dsh-runtime/node_modules/ws",
  ];
  for (const c of candidates) {
    try {
      const mod = require(c);
      if (mod && (typeof mod === "function" || mod.WebSocket)) {
        return mod.WebSocket || mod;
      }
    } catch {}
  }
  return globalThis.WebSocket;
}

const WebSocketImpl = getWebSocketImpl();
const DINGTALK_OPEN_API = "https://api.dingtalk.com";
const DINGTALK_OAPI = "https://oapi.dingtalk.com";
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const SESSION_WEBHOOK_TTL_MS = 90 * 60 * 1000; // 钉钉临时 webhook 时效约 90 分钟

export class DingtalkAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._ws = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._token = null;
    this._tokenExpire = 0;
    /** 每个会话的最近 sessionWebhook 上下文：target -> { sessionWebhook, at, openConversationId } */
    this._lastSessions = new Map();
    /** msgid 去重 */
    this._seen = new Map();
  }

  static isConfigured(cfg) {
    return Boolean(String(cfg?.appKey ?? "").trim() && String(cfg?.appSecret ?? "").trim());
  }

  async _accessToken(cfg) {
    if (this._token && Date.now() < this._tokenExpire) return this._token;
    const res = await fetch(
      `${DINGTALK_OAPI}/gettoken?appkey=${encodeURIComponent(cfg.appKey)}&appsecret=${encodeURIComponent(cfg.appSecret)}`,
    );
    const data = await res.json();
    if (data.errcode !== 0) throw new Error(data.errmsg || "获取 access_token 失败");
    this._token = data.access_token;
    this._tokenExpire = Date.now() + (data.expires_in || 7200) * 1000 - 60000;
    return this._token;
  }

  async start(handler) {
    this._handler = handler;
    this._stopped = false;
    this._connect();
    this.emit("state", { phase: "listening" });
  }

  async _connect() {
    if (this._stopped) return;
    const cfg = this.getConfig() ?? {};
    if (!DingtalkAdapter.isConfigured(cfg)) {
      this.log.warn?.("[dingtalk] appKey/appSecret 未配置，无法建立 Stream 长连接");
      return;
    }

    try {
      this.log.info?.("[dingtalk] 向网关申请 Stream 端点...");
      const res = await fetch(`${DINGTALK_OPEN_API}/v1.0/gateway/connections/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          clientId: cfg.appKey.trim(),
          clientSecret: cfg.appSecret.trim(),
          subscriptions: [
            { type: "CALLBACK", topic: "/v1.0/im/bot/messages/get" },
            { type: "EVENT", topic: "*" }
          ]
        })
      });

      const body = await res.json();
      if (!body.endpoint || !body.ticket) {
        throw new Error(body.message || body.errmsg || "返回端点为空");
      }

      const wsUrl = `${body.endpoint}?ticket=${body.ticket}`;
      this.log.info?.("[dingtalk] 正在建立 WebSocket 长连接...");

      this._ws = new WebSocketImpl(wsUrl);
      this._setupWs();
    } catch (e) {
      this.log.warn?.(`[dingtalk] 建连申请失败: ${e.message}`);
      this._scheduleReconnect();
    }
  }

  _setupWs() {
    const ws = this._ws;
    if (!ws) return;

    const onOpen = () => {
      this._reconnectAttempts = 0;
      this.log.info?.("[dingtalk] ✓ Stream 长连接已连接成功，开始接收消息");
      this.emit("state", { phase: "connected" });
    };

    const onMessage = (event) => {
      const raw = typeof event === "object" && "data" in event ? event.data : event;
      try {
        const msg = JSON.parse(raw.toString());
        this._handleFrame(msg);
      } catch (err) {
        this.log.warn?.(`[dingtalk] 消息解析异常: ${err.message}`);
      }
    };

    const onError = (err) => {
      this.log.warn?.(`[dingtalk] 连接异常: ${err?.message || err}`);
    };

    const onClose = (code, reason) => {
      this.log.info?.(`[dingtalk] 连接关闭 code=${code}`);
      this.emit("state", { phase: "disconnected" });
      if (!this._stopped) {
        this._scheduleReconnect();
      }
    };

    if (typeof ws.on === "function") {
      ws.on("open", onOpen);
      ws.on("message", onMessage);
      ws.on("error", onError);
      ws.on("close", onClose);
    } else if (typeof ws.addEventListener === "function") {
      ws.addEventListener("open", onOpen);
      ws.addEventListener("message", onMessage);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", (e) => onClose(e.code, e.reason));
    }
  }

  _sendWs(data) {
    if (!this._ws) return;
    const str = typeof data === "string" ? data : JSON.stringify(data);
    try {
      this._ws.send(str);
    } catch (e) {
      this.log.warn?.(`[dingtalk] 发送帧失败: ${e.message}`);
    }
  }

  _handleFrame(msg) {
    const { type, headers, data: rawData } = msg;

    // 心跳回应
    if (type === "SYSTEM") {
      if (headers?.topic === "ping") {
        this._sendWs({
          code: 200,
          headers,
          message: "OK",
          data: rawData
        });
      }
      return;
    }

    // 机器人消息回调
    if (type === "CALLBACK" && headers?.topic === "/v1.0/im/bot/messages/get") {
      // 立即回复 ACK
      this._sendWs({
        code: 200,
        headers: {
          contentType: "application/json",
          messageId: headers.messageId
        },
        message: "OK",
        data: JSON.stringify({ response: {} })
      });

      const payload = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      this._onCallback(payload, headers.messageId);
    }
  }

  _onCallback(payload, messageId) {
    const msgId = payload.msgId || messageId;
    if (msgId && this._seen.has(msgId)) return;
    if (msgId) {
      this._seen.set(msgId, Date.now());
      this._pruneSeen();
    }

    const conversationType = String(payload.conversationType ?? "1"); // 1: 单聊, 2: 群聊
    const conversationId = String(payload.conversationId ?? "");
    const senderId = String(payload.senderId || payload.senderStaffId || "");
    const senderNick = String(payload.senderNick || "钉钉用户");

    // 单聊目标记为 senderId，群聊记为 group:conversationId
    const target = conversationType === "2" ? `group:${conversationId}` : (senderId || conversationId);
    if (!target) return;

    if (payload.sessionWebhook) {
      this._lastSessions.set(target, {
        sessionWebhook: payload.sessionWebhook,
        openConversationId: conversationId,
        senderId,
        at: Date.now()
      });
    }

    const text = String(payload.text?.content ?? "").trim();
    if (!text) return;

    this.log.info?.(`[dingtalk] 收到消息 from=${senderNick}(${senderId}) conv=${conversationId} type=${conversationType}: ${text.slice(0, 50)}`);

    Promise.resolve(
      this._handler?.({
        sender: target,
        text,
        images: [],
        files: [],
        raw: payload,
        kind: "dingtalk",
        dedupeId: msgId || `${target}:${Date.now()}`
      })
    ).catch?.((e) => this.log.error?.(`[dingtalk] 处理失败: ${e.message}`));
  }

  _pruneSeen() {
    const now = Date.now();
    for (const [k, v] of this._seen.entries()) {
      if (now - v > DEDUPE_TTL_MS) this._seen.delete(k);
    }
    for (const [k, v] of this._lastSessions.entries()) {
      if (now - v.at > SESSION_WEBHOOK_TTL_MS) this._lastSessions.delete(k);
    }
  }

  _scheduleReconnect() {
    if (this._stopped || this._reconnectTimer) return;
    this._reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(1.5, this._reconnectAttempts - 1), 30000);
    this.log.info?.(`[dingtalk] ${Math.round(delay / 1000)} 秒后尝试重新连接 (第 ${this._reconnectAttempts} 次)...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
  }

  /**
   * 发送回复消息。
   * 优先使用 sessionWebhook（支持 markdown），时效过期或无上下文时降级为 OpenAPI 发送。
   */
  async send(to, text) {
    const content = String(text ?? "").trim();
    if (!content) return { ok: false };
    const target = String(to || "").trim();
    const ctx = this._lastSessions.get(target);

    // 1. 优先使用最近活跃会话的 sessionWebhook
    if (ctx && ctx.sessionWebhook && (Date.now() - ctx.at < SESSION_WEBHOOK_TTL_MS)) {
      try {
        let res = await fetch(ctx.sessionWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msgtype: "markdown",
            markdown: {
              title: "DeepSeek Harness",
              text: content
            }
          })
        });
        let data = await res.json().catch(() => ({}));
        if (data.errcode === 0) {
          return { ok: true };
        }
        // 若 markdown 格式被拒，自动降级为 text 重试
        this.log.warn?.(`[dingtalk] sessionWebhook markdown 失败 errcode=${data.errcode}, 降级 text 重试`);
        res = await fetch(ctx.sessionWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msgtype: "text",
            text: { content }
          })
        });
        data = await res.json().catch(() => ({}));
        if (data.errcode === 0) {
          return { ok: true };
        }
        this.log.warn?.(`[dingtalk] sessionWebhook text 回复失败 errcode=${data.errcode}, 尝试 OpenAPI 降级`);
      } catch (e) {
        this.log.warn?.(`[dingtalk] sessionWebhook 请求异常: ${e.message}, 降级 OpenAPI`);
      }
    }

    // 2. 降级 OpenAPI 发送
    const cfg = this.getConfig() ?? {};
    const token = await this._accessToken(cfg);
    const headers = {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    };
    const msgParam = JSON.stringify({ content });

    if (target.startsWith("group:")) {
      const openConversationId = target.slice("group:".length);
      const res = await fetch(`${DINGTALK_OPEN_API}/v1.0/im/robot/groupMessages/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          msgKey: "sampleText",
          msgParam,
          openConversationId,
        }),
      });
      return await res.json().catch(() => ({}));
    }

    const res = await fetch(`${DINGTALK_OPEN_API}/v1.0/im/robot/oToMessages/batchSend`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        msgKey: "sampleText",
        msgParam,
        userIds: [target],
      }),
    });
    return await res.json().catch(() => ({}));
  }

  async setTyping() {
    // 钉钉机器人不支持输入中状态
  }

  async stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      try {
        if (typeof this._ws.close === "function") this._ws.close();
        if (typeof this._ws.terminate === "function") this._ws.terminate();
      } catch {}
      this._ws = null;
    }
  }

  describe() {
    const cfg = this.getConfig();
    return `钉钉通道 (${cfg?.appKey ? "已配置" : "未配置 appKey"})`;
  }
}
