/**
 * adapters/feishu.mjs — 飞书开放 API 传输适配器
 *
 * 应用事件订阅（长连接 WebSocket 收）+ 开放接口发。
 * 长连接模式：无需公网 URL，向飞书申请临时 wss 端点，通过 protobuf
 * pbbp2.Frame 帧接收事件（im.message.receive_v1），事件 3s 内 ACK。
 */
import { EventEmitter } from "node:events";
import { basename } from "node:path";
import { encodeFrame, decodeFrame, headerMap, payloadJson } from "./feishu-ws-frame.mjs";
import { cacheMediaBytes, classifyMedia } from "../media-cache.mjs";

const FEISHU_OPEN = "https://open.feishu.cn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 解析飞书消息 content JSON（content 可能是字符串或已解析对象）。 */
export function parseMsgContent(msg) {
  const raw = msg?.content;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** SSRF 防护：判断 host 是否为内网/回环/链路本地地址（含常见云元数据段）。 */
export function isPrivateHost(host) {
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const ipv4 = h.split(".");
  if (ipv4.length === 4 && ipv4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
    const [a, b] = ipv4.map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 基准测试网段
  }
  return false;
}

/** 校验并下载 URL 字节（SSRF 防护：协议白名单 + 内网 host 拒绝 + 重定向复查 + 限时）。 */
export async function downloadUrlBytes(url, { timeoutMs = 30_000, maxBytes = 25 * 1024 * 1024 } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("invalid url");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error(`unsupported protocol ${u.protocol}`);
  if (isPrivateHost(u.hostname)) throw new Error("blocked private host (SSRF)");
  const res = await fetch(u, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "DeepSeekHarness/1.0", "Accept": "*/*" },
  });
  if (!res.ok) throw new Error(`download url HTTP ${res.status}`);
  // 重定向后的最终地址复查
  if (res.url) {
    try {
      const finalUrl = new URL(res.url);
      if (isPrivateHost(finalUrl.hostname)) throw new Error("blocked private redirect (SSRF)");
    } catch (e) {
      if (e instanceof Error && e.message.includes("SSRF")) throw e;
    }
  }
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new Error(`download exceeds ${maxBytes} bytes`);
  const contentType = String(res.headers.get("content-type") ?? "").split(";")[0].trim();
  const name = basename(u.pathname) || "download.bin";
  return { data, mime: contentType, name };
}

/**
 * 从回复文本中解析"选择问题"的候选选项。
 * 识别行首编号列表（1. / 1、 / 1) / ①②③ 等），2~8 项视为可点选选项。
 * @returns {Array<{label: string, content: string}> | null}
 */
export function parseChoiceOptions(text) {
  const re = /^\s*(?:(\d{1,2})[.、)）]|([①②③④⑤⑥⑦⑧⑨⑩]))\s*(.+?)\s*$/gm;
  const options = [];
  let m;
  while ((m = re.exec(String(text ?? ""))) !== null) {
    const label = (m[1] ?? m[2] ?? "").trim();
    const content = (m[3] ?? "").trim();
    if (!content) continue;
    options.push({ label, content });
    if (options.length >= 8) break;
  }
  return options.length >= 2 ? options : null;
}

/**
 * 飞书卡片 v2 markdown 兼容层：v2 原生支持标题/表格/列表/引用/代码块，
 * 这里只降级 v2 不支持的语法（内嵌图片 → 链接），其余原样保留。
 */
export function feishuMarkdown(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => (alt ? `[${alt}](${url})` : url)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 把一段回复文本构造成飞书交互卡片（interactive card）。
 * markdown 元素支持加粗/斜体/链接/行内代码/列表等基础语法；
 * 若文本含编号选项列表，自动追加可点击按钮（点击回调 card.action.trigger）。
 * 超长文本截断，避免超出卡片元素上限。
 */
export function buildCard(text, { title = "DeepSeek Harness", template = "blue", footer, questionId, renderOptions = false } = {}) {
  const MAX_MD = 28_000;
  const body = String(text ?? "").trim();
  const truncated = body.length > MAX_MD;
  const raw = truncated ? `${body.slice(0, MAX_MD)}\n\n…（内容过长已截断）` : body;
  const content = feishuMarkdown(raw);
  const elements = [{ tag: "markdown", content }];
  if (renderOptions) {
    const options = parseChoiceOptions(body);
    if (options) {
      for (const [i, o] of options.entries()) {
        // 按钮 value 携带 option；若属于 userQuestions 等待中的问题，额外带 qid 以便回调 resolve
        elements.push({
          tag: "button",
          text: { tag: "plain_text", content: `${o.label}. ${o.content}`.slice(0, 20) },
          type: i === 0 ? "primary" : "default",
          value: questionId ? { option: o.content, qid: questionId } : { option: o.content },
        });
      }
    }
  }
  if (footer) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "markdown", content: footer });
  }
  return {
    schema: "2.0",
    header: { template, title: { tag: "plain_text", content: title } },
    body: { elements },
  };
}

/** 飞书 API 信封报错时立即失败。 */
function envelope(json) {
  if (json?.code !== 0) {
    throw new Error(`feishu api: ${json?.code ?? "?"} ${json?.msg ?? json?.message ?? "unknown error"}`);
  }
  return json;
}

/** 从 im.message.receive_v1 事件提取纯文本。 */
export function extractTextEvent(event) {
  const message = event?.event?.message;
  if (message === undefined) return undefined;
  if (message.message_type !== "text") return undefined;
  try {
    const content = typeof message.content === "string" ? JSON.parse(message.content) : message.content;
    return typeof content?.text === "string" ? content.text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 从 post 富文本消息 content 提取可读文本。
 * 结构：{ title, content: [[{tag:"text",text:"..."},{tag:"a",text:".."},...], ...] }
 * 只拼 text 段与 title，链接/a 段取其 text。
 */
export function extractPostText(raw) {
  const c = typeof raw === "string" ? parseMsgContent({ content: raw }) : raw;
  if (!c || typeof c !== "object") return "";
  const parts = [];
  if (typeof c.title === "string" && c.title.trim()) parts.push(c.title);
  const rows = Array.isArray(c.content) ? c.content : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const line = [];
    for (const seg of row) {
      if (seg && typeof seg === "object" && typeof seg.text === "string" && seg.text) line.push(seg.text);
    }
    if (line.length > 0) parts.push(line.join(" "));
  }
  return parts.join("\n").trim();
}

/** 检查消息是否 @ 了本机器人（飞书 mention 列表）。 */
export function isMentioned(event, selfOpenId = "") {
  const mentions = event?.event?.message?.mentions;
  if (!Array.isArray(mentions)) return false;
  return mentions.some((m) => {
    const id = m?.id?.open_id ?? m?.open_id ?? m?.id ?? "";
    return id && (id === selfOpenId || id === "all");
  });
}

export class FeishuAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this._stopped = false;
    this._handler = null;
    this._ws = null;
    this._wsRetryTimer = null;
    this._pingTimer = null;
    this._seenMessages = new Set();
    this._pingIntervalMs = 120_000;
    // userQuestions provider 挂起的卡片问题：qid → resolve(option)
    this._pendingQuestions = new Map();
    // 反向引用 GatewayCore（index.js 在 core 创建后挂载），用于 session→sender 反查
    this.gatewayCore = null;
  }

  async _tenantAccessToken(cfg) {
    const res = await fetch(`${FEISHU_OPEN}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    });
    const data = await res.json();
    return data.tenant_access_token || data.access_token;
  }

  /** 给指定消息加表情回应（收到消息时的"已读"标记）。静默失败。 */
  async _react(messageId, emojiType = "THUMBSUP") {
    try {
      const cfg = this.getConfig() ?? {};
      const token = await this._tenantAccessToken(cfg);
      await fetch(`${FEISHU_OPEN}/open-apis/im/v1/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reaction_type: { emoji_type: emojiType } }),
      });
    } catch (e) {
      this.log?.warn?.(`[feishu] 表情回应失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  async start(handler) {
    this._handler = handler;
    if (this._ws) return;
    this._connect();
    this.emit("state", { phase: "listening" });
    this.log.info?.("[feishu] 长连接监听启动");
  }

  /** 申请临时 wss 端点并连接。 */
  async _connect() {
    if (this._stopped) return;
    try {
      const cfg = this.getConfig();
      if (!cfg.appId || !cfg.appSecret) {
        this.log.warn?.("[feishu] 未配置 appId/appSecret，等待配置后重连");
        this._scheduleRetry(10_000);
        return;
      }
      const res = await fetch(`${FEISHU_OPEN}/callback/ws/endpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ AppID: cfg.appId, AppSecret: cfg.appSecret }),
      });
      const json = envelope(await res.json());
      const url = json.data?.URL;
      if (typeof url !== "string") throw new Error("feishu ws handshake returned no URL");
      const serviceId = Number(new URL(url).searchParams.get("service_id") ?? 0);
      const clientConfig = json.data?.ClientConfig;
      if (Number.isFinite(clientConfig?.PingInterval) && clientConfig.PingInterval > 0) {
        this._pingIntervalMs = clientConfig.PingInterval * 1000;
      }
      this.log.info?.(`[feishu] 长连接已申请 (service ${serviceId})`);

      const ws = new WebSocket(url);
      this._ws = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.log.info?.("[feishu] WebSocket 已连接");
        clearInterval(this._pingTimer);
        this._pingTimer = setInterval(() => {
          try {
            ws.send(encodeFrame({
              seqID: 0,
              logID: 0,
              service: serviceId,
              method: 0,
              headers: [{ key: "type", value: "ping" }],
            }));
          } catch {
            /* socket mid-close */
          }
        }, this._pingIntervalMs);
        this._pingTimer.unref?.();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") return; // 无文本帧
        let frame;
        try {
          frame = decodeFrame(ev.data);
        } catch (e) {
          this.log.warn?.(`[feishu] 帧解码失败 ${e instanceof Error ? e.message : e}`);
          return;
        }
        if (frame.method === 1) {
          this._handleEventFrame(frame, serviceId);
        } else {
          const headers = headerMap(frame);
          if (headers.type === "pong") {
            const cfg = payloadJson(frame);
            if (Number.isFinite(cfg?.PingInterval) && cfg.PingInterval > 0) {
              this._pingIntervalMs = cfg.PingInterval * 1000;
            }
          }
        }
      };

      ws.onclose = () => {
        clearInterval(this._pingTimer);
        this._ws = null;
        if (!this._stopped) {
          this.log.warn?.("[feishu] WebSocket 已关闭，5s 后重连");
          this._scheduleRetry(5000);
        }
      };

      ws.onerror = (ev) => {
        this.log.warn?.(`[feishu] WebSocket 错误: ${ev?.message ?? "unknown"}`);
      };
    } catch (e) {
      this.log.warn?.(`[feishu] 连接失败 ${e instanceof Error ? e.message : e}，10s 后重试`);
      this._scheduleRetry(10_000);
    }
  }

  _scheduleRetry(ms) {
    if (this._stopped || this._wsRetryTimer) return;
    this._wsRetryTimer = setTimeout(() => {
      this._wsRetryTimer = null;
      this._connect();
    }, ms);
    this._wsRetryTimer.unref?.();
  }

  /** 处理一个数据帧（method=1），携带事件负载。 */
  _handleEventFrame(frame, serviceId) {
    const headers = headerMap(frame);
    if (headers.type !== "event") return;
    const messageId = headers.message_id ?? "";
    if (messageId !== "") {
      if (this._seenMessages.has(messageId)) return;
      this._seenMessages.add(messageId);
      if (this._seenMessages.size > 10_000) {
        const first = this._seenMessages.values().next().value;
        this._seenMessages.delete(first);
      }
    }
    const event = payloadJson(frame);
    if (event !== undefined) this._dispatch(event);
    // 3s 内 ACK：回显 seq/log/service/method/headers + payload {"code":200}
    try {
      this._ws?.send(encodeFrame({
        seqID: frame.seqID,
        logID: frame.logID,
        service: serviceId,
        method: frame.method,
        headers: frame.headers ?? [],
        payloadType: "json",
        payload: Buffer.from(JSON.stringify({ code: 200 }), "utf8"),
      }));
    } catch {
      /* socket mid-close */
    }
  }

  /** 分发事件给网关。 */
  _dispatch(event) {
    const eventType = event?.header?.event_type;
    if (eventType === "im.message.receive_v1") {
      this._handleMessage(event).catch((e) => this.log.warn?.(`[feishu] 消息处理失败: ${e instanceof Error ? e.message : e}`));
      return;
    }
    if (eventType === "card.action.trigger") {
      this._handleCardAction(event);
      return;
    }
  }

  /**
   * 处理卡片按钮点击回调。
   * 若按钮属于 userQuestions 挂起的问题（value.qid 命中 _pendingQuestions），
   * 直接 resolve 回 ask()，不注入新消息；否则按旧逻辑把选项作为一条用户消息注入网关。
   */
  _handleCardAction(event) {
    const e = event.event ?? {};
    const value = e.action?.value ?? {};
    const option = typeof value.option === "string" ? value.option.trim() : "";
    const qid = typeof value.qid === "string" ? value.qid : "";
    const chatId = e.context?.open_chat_id ?? e.open_chat_id ?? "";
    const operator = e.operator?.open_id ?? "";
    if (!chatId) return;

    // 命中挂起问题 → resolve 回 ask()，等待中的 agent 拿到答案
    if (qid && this._pendingQuestions.has(qid)) {
      this.log.info?.(`[feishu] 回答问题 qid=${qid} chat=${chatId} option=${option}`);
      const resolveFn = this._pendingQuestions.get(qid);
      this._pendingQuestions.delete(qid);
      resolveFn(option);
      return;
    }

    if (!option) return;
    this.log.info?.(`[feishu] 卡片按钮点击 chat=${chatId} option=${option}`);
    const text = option; // 选项内容直接作为用户消息
    this.emit("message", { sender: operator, text, chatId, raw: event, kind: "card" });
    this._handler?.({
      sender: chatId,
      text,
      images: [],
      files: [],
      raw: event,
      kind: "card",
      dedupeId: event?.header?.event_id ?? `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  /**
   * 卡片提问能力（由 gateway-core 的通道提问 provider 调用）。
   * 发送一张带 qid 的交互卡片（问题 + 选项按钮），挂起等待用户点击，
   * 点击回调经 _handleCardAction 命中 _pendingQuestions 后 resolve 选项内容。
   *
   * @param {string} sender 接收方 chat_id
   * @param {string} questionText 已格式化的问题文本（含编号选项，buildCard 会转成按钮）
   * @param {object} q 单个 question 结构 { id, question, header?, options? }
   * @returns {Promise<string>} 用户点选的选项内容
   */
  async sendQuestion(sender, questionText, q) {
    const qid = q?.id;
    if (!qid) throw new Error("question 缺少 id");
    // 飞书旧客户端不支持 v2 卡片按钮（点击回调 card.action.trigger 也不稳定），
    // 直接抛错让 gateway-core 回退到文本编号提问（用户回复编号即可）。
    throw new Error("feishu 通道暂用文本提问，回退编号选择");
  }

  /** 低层发送交互卡片（带可选 questionId），供 askProvider 使用；发送后不解析/不等待。 */
  async _sendCard(to, text, { title = "DeepSeek Harness", template = "blue", questionId } = {}) {
    const cfg = this.getConfig();
    const token = await this._tenantAccessToken(cfg);
    const card = buildCard(text, { title, template, questionId });
    const res = await fetch(`${FEISHU_OPEN}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: to, msg_type: "interactive", content: JSON.stringify(card) }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.code !== 0 && data?.code !== undefined) {
      throw new Error(`sendCard HTTP ${res.status} code=${data?.code} ${data?.msg ?? ""}`);
    }
    return data;
  }

  /**
   * 处理普通消息。
   * 支持：text / post（富文本）/ image / sticker（贴纸）/ file / audio / media（视频）/
   *       location（位置）/ share_chat（分享群）/ merge（合并转发）。
   * 图片/贴纸/文件/语音/视频通过飞书 resources API 下载原始字节后缓存到本地，
   * 以本地路径（images / files）交给网关 —— 参考 Hermes cache_media_bytes 模式。
   */
  async _handleMessage(event) {
    const e = event.event;
    const msg = e.message;
    const chatId = msg.chat_id;
    const sender = e.sender?.sender_id?.open_id ?? "";
    const cfg = this.getConfig() ?? {};
    if (Array.isArray(cfg.allowlist) && cfg.allowlist.length > 0 && !cfg.allowlist.includes(sender)) {
      this.log.info?.("[feishu] allowlist 拒绝", sender);
      return;
    }
    this.log.info?.(`[feishu] 收到消息 from=${sender} chat=${chatId} type=${msg.message_type}`);
    const messageId = msg.message_id ?? messageIdOf(event);

    // 收到用户消息 → 立即加表情回应（"已收到"标记），不阻塞主流程
    if (messageId && e.sender?.sender_type !== "app") {
      this._react(messageId, "THUMBSUP");
    }

    let text = "";
    const images = [];
    const files = [];
    const c = parseMsgContent(msg);

    switch (msg.message_type) {
      case "text": {
        text = extractTextEvent(event) ?? "";
        break;
      }
      case "post": {
        text = extractPostText(msg.content);
        break;
      }
      case "image": {
        if (c.image_key) {
          const cached = await this._downloadAndCache(messageId, c.image_key, "image", "image.jpg");
          if (cached?.path) images.push(cached.path);
          else text = "[图片下载失败]";
        }
        break;
      }
      case "sticker": {
        if (c.image_key) {
          const cached = await this._downloadAndCache(messageId, c.image_key, "image", "sticker.jpg");
          if (cached?.path) images.push(cached.path);
          else text = "[贴纸下载失败]";
        }
        break;
      }
      case "file": {
        if (c.file_key) {
          const cached = await this._downloadAndCache(messageId, c.file_key, "file", c.file_name || "attachment.bin");
          if (cached?.path) {
            files.push(cached.path);
            text = `[文件: ${cached.name}]`;
          } else {
            text = `[文件下载失败: ${c.file_name ?? "未知"}]`;
          }
        }
        break;
      }
      case "audio": {
        if (c.file_key) {
          const cached = await this._downloadAndCache(messageId, c.file_key, "audio", c.file_name || "voice.ogg");
          if (cached?.path) {
            files.push(cached.path);
            text = `[语音: ${cached.name}]`;
          } else {
            text = "[语音下载失败]";
          }
        }
        break;
      }
      case "media": {
        // 视频消息：content 含 file_key（视频文件）+ image_key（封面）
        if (c.file_key) {
          const cached = await this._downloadAndCache(messageId, c.file_key, "video", c.file_name || "video.mp4");
          if (cached?.path) {
            files.push(cached.path);
            text = `[视频: ${cached.name}]`;
          } else {
            text = `[视频下载失败: ${c.file_name ?? "未知"}]`;
          }
        } else {
          text = "[视频消息]";
        }
        break;
      }
      case "location": {
        const { latitude, longitude } = c;
        if (typeof latitude === "number" && typeof longitude === "number") {
          text = `[位置] 纬度 ${latitude}，经度 ${longitude}（https://uri.amap.com/marker?position=${longitude},${latitude}）`;
        } else {
          text = "[位置消息]";
        }
        break;
      }
      case "share_chat": {
        text = c.chat_id ? `[分享群聊] ${c.chat_id}` : "[分享群聊]";
        break;
      }
      case "merge": {
        text = typeof c.title === "string" && c.title.trim() ? `[合并转发] ${c.title}` : "[合并转发消息]";
        break;
      }
      default:
        // 其余类型（system/share_card 等）暂不处理
        return;
    }

    if (!text && images.length === 0 && files.length === 0) return;

    this.emit("message", { sender, text, chatId, raw: event });
    // 网关入站消息格式 { sender, text, images, files, raw, dedupeId }
    this._handler?.({
      sender: chatId,
      text,
      images,
      files,
      raw: event,
      dedupeId: messageId,
    });
  }

  /** 下载飞书消息资源（图片/文件/音频）原始字节。 */
  async _downloadResource(messageId, fileKey, type = "file") {
    const cfg = this.getConfig();
    const token = await this._tenantAccessToken(cfg);
    const url = `${FEISHU_OPEN}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${type}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`download resource HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** 下载并缓存到本地；失败返回 { path: null }，由调用方决定降级。 */
  async _downloadAndCache(messageId, fileKey, type, filename) {
    try {
      const data = await this._downloadResource(messageId, fileKey, type);
      const mime = type === "image" ? "image/jpeg" : "";
      const kind = type === "image" ? "image" : "document";
      return await cacheMediaBytes({ data, mime, filename, kind, channel: "feishu" });
    } catch (e) {
      this.log.warn?.(`[feishu] 资源下载失败 ${messageId}/${fileKey}: ${e instanceof Error ? e.message : e}`);
      return { path: null };
    }
  }

  /**
   * 发送消息。
   * @param {string} to 接收方标识
   * @param {string} text 文本内容（可为空字符串，仅发文件）
   * @param {object} [opts]
   * @param {Array<{path?: string, url?: string, mime?: string, name?: string}>} [opts.files]
   *        附件（图片/文件），先发附件再发文本；path 为本地路径，url 会先下载（SSRF 防护）
   * @param {string} [opts.targetType] 接收方类型：chat_id（默认）/ open_id / user_id / email
   */
  async send(to, text, { files = [], targetType = "chat_id", plain = false } = {}) {
    const cfg = this.getConfig();
    const token = await this._tenantAccessToken(cfg);
    let last = null;

    // 先发附件（图片走 im/v1/images，其余走 im/v1/files）
    for (const f of files || []) {
      last = await this._sendFile(to, token, f, targetType);
    }

    // 再发文本（交互卡片或纯文本）
    if (text && String(text).trim()) {
      const useCard = !plain && cfg.cardReplies !== false;
      const msgType = useCard ? "interactive" : "text";
      const content = useCard
        ? JSON.stringify(buildCard(text, { footer: `由 DeepSeek Harness 生成 · ${new Date().toLocaleString()}` }))
        : JSON.stringify({ text: String(text) });
      const res = await fetch(`${FEISHU_OPEN}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(targetType)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: to,
          msg_type: msgType,
          content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.code !== 0 && data?.code !== undefined) {
        throw new Error(`sendMessage HTTP ${res.status} code=${data?.code} ${data?.msg ?? ""}`);
      }
      last = data;
    }
    return last;
  }

  /** 上传并发送单个附件（图片 → image 消息；其他 → file 消息）。支持本地路径或 URL。 */
  async _sendFile(to, token, file, targetType = "chat_id") {
    let data;
    let name;
    let mime = file?.mime || "";
    if (file?.url) {
      // URL 来源：SSRF 防护下载
      const dl = await downloadUrlBytes(file.url);
      data = dl.data;
      mime = dl.mime;
      name = file.name || dl.name;
    } else if (file?.path) {
      const { readFile } = await import("node:fs/promises");
      data = await readFile(file.path);
      name = file.name || basename(file.path);
    } else {
      throw new Error("file 需提供 path 或 url");
    }
    const isImage = classifyMedia(mime, name) === "image";

    const fileKey = isImage
      ? await this._uploadImage(token, data, name)
      : await this._uploadFile(token, data, name);

    const msgType = isImage ? "image" : "file";
    const content = isImage
      ? JSON.stringify({ image_key: fileKey })
      : JSON.stringify({ file_key: fileKey });
    const res = await fetch(`${FEISHU_OPEN}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(targetType)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ receive_id: to, msg_type: msgType, content }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.code !== 0 && json?.code !== undefined) {
      throw new Error(`sendFile HTTP ${res.status} code=${json?.code} ${json?.msg ?? ""}`);
    }
    return json;
  }

  /** 上传图片到飞书（im/v1/images），返回 image_key。 */
  async _uploadImage(token, data, name) {
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([data]), name);
    const res = await fetch(`${FEISHU_OPEN}/open-apis/im/v1/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (json?.code !== 0) throw new Error(`uploadImage code=${json?.code} ${json?.msg ?? ""}`);
    return json.data?.image_key;
  }

  /** 上传文件到飞书（im/v1/files），返回 file_key。 */
  async _uploadFile(token, data, name) {
    const form = new FormData();
    form.append("file_type", "stream");
    form.append("file_name", name);
    form.append("file", new Blob([data]), name);
    const res = await fetch(`${FEISHU_OPEN}/open-apis/im/v1/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (json?.code !== 0) throw new Error(`uploadFile code=${json?.code} ${json?.msg ?? ""}`);
    return json.data?.file_key;
  }

  async setTyping() {
    // 飞书 typing 需单独 API，此处 no-op
  }

  async reconnect() {
    this._stopped = false;
    if (this._wsRetryTimer) { clearTimeout(this._wsRetryTimer); this._wsRetryTimer = null; }
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this._ws) {
      try { this._ws.close(); } catch { /* containment */ }
      this._ws = null;
    }
    await this._connect();
  }

  async stop() {
    this._stopped = true;
    if (this._wsRetryTimer) { clearTimeout(this._wsRetryTimer); this._wsRetryTimer = null; }
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this._ws) {
      try { this._ws.close(); } catch { /* containment */ }
      this._ws = null;
    }
  }

  describe() {
    const cfg = this.getConfig();
    return `飞书通道 (${cfg.appId ? "已配置" : "未配置 appId"})`;
  }
}

function messageIdOf(event) {
  return event?.event?.message?.message_id ?? "";
}
