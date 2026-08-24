/**
 * adapters/imsg.mjs — 本地 Mac + imsg CLI 传输适配器
 *
 * 通过 `imsg rpc`（JSON-RPC over stdio）监听入站、发送回复。对齐 OpenClaw /
 * Hermes 的本地正统路径。
 *
 * 接口约定：所有适配器实现
 *   async start(handler)     启动监听；handler(inboundMsg) 处理入库
 *   async send(to, text)     发送一条文本
 *   async stop()             停止监听
 *   setConfig(cfg)           热更新配置（路由/开关）
 *   describe() -> string     当前状态描述
 * 其中 inboundMsg = { sender, text, images:[path], raw, dedupeId }
 */
import { spawn } from "node:child_process";

/** 把字符串命令拆成 [cmd, ...args]（支持简单引号）。 */
export function splitCmd(cmd) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

export class ImsgAdapter {
  constructor({ getConfig, log = console }) {
    this.getConfig = getConfig;
    this.log = log;
    this.child = null;
    this._msgId = 1;
    this._pending = new Map();
    this._buffer = "";
    this._disposed = false;
    this._handler = null;
    this._features = null; // { typing, readReceipts }
  }

  /** 监听目标（决定 workspace 归属）由调用方在 handler 内根据 sender 查路由。 */
  async start(handler) {
    this._handler = handler;
    const cfg = this.getConfig();
    await this._spawn(cfg);
  }

  async _spawn(cfg) {
    if (this.child) return;
    const cmd = cfg.imsgCmd || "imsg";
    const chatDb = cfg.chatDb || process.env.IMSG_CHAT_DB;
    const [bin, ...prefix] = splitCmd(cmd);
    const args = [...prefix, "rpc", ...(chatDb ? ["--db", chatDb] : []), "--json"];
    this.log.info?.(`[imsg] 启动 RPC 监听 ${bin} ${args.join(" ")}`);
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c) => this._onData(c));
    child.on("error", (e) => this.log.error?.(`[imsg] rpc error: ${e.message}`));
    child.on("exit", (code) => {
      this.log.warn?.(`[imsg] rpc 退出 code=${code}`);
      this.child = null;
      if (!this._disposed) setTimeout(() => this._spawn(this.getConfig()), 3000);
    });
    this._rpc("watch.subscribe", { attachments: true, debounce_ms: 200 }).catch((e) =>
      this.log.error?.(`[imsg] subscribe failed: ${e instanceof Error ? e.message : e}`),
    );
    this._probeFeatures(cfg).catch(() => {});
  }

  async _probeFeatures(cfg) {
    if (this._features !== null) return this._features;
    const none = { typing: false, readReceipts: false };
    try {
      const [bin, ...prefix] = splitCmd(cfg.imsgCmd || "imsg");
      const out = await new Promise((resolve, reject) => {
        const c = spawn(bin, [...prefix, "status", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
        let buf = "";
        c.stdout?.setEncoding("utf8");
        c.stdout?.on("data", (x) => (buf += x));
        c.on("error", reject);
        c.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`status 退出 code=${code}`))));
      });
      const s = JSON.parse(out);
      const advanced = !!s.advanced_features;
      this._features = {
        typing: advanced && !!s.typing_indicators,
        readReceipts: advanced && !!s.read_receipts,
      };
    } catch {
      this._features = none;
    }
    return this._features;
  }

  _onData(chunk) {
    this._buffer += chunk;
    let idx;
    while ((idx = this._buffer.indexOf("\n")) !== -1) {
      const line = this._buffer.slice(0, idx).trim();
      this._buffer = this._buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg?.id !== undefined && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg?.method) {
        this._onNotification(msg.method, msg.params);
      }
    }
  }

  _rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = this._msgId++;
      this._pending.set(id, { resolve, reject });
      const req = { jsonrpc: "2.0", id, method, params: params || {} };
      this.child?.stdin?.write(JSON.stringify(req) + "\n");
    });
  }

  async _onNotification(method, params) {
    const msg = params ?? {};
    if (!msg || typeof msg !== "object") return;
    const m = msg.message || msg.data || msg;
    if (!m || typeof m !== "object") return;
    if (m.is_from_me) return; // 回声抑制：过滤自己发的
    const sender = m.sender || m.handle || m.from || null;
    if (!sender) return;

    const rawText = String(m.text || m.body || "");
    const text = rawText.replace(/\uFFFC/g, "").trim();
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    const images = atts
      .filter((a) => a && !a.missing && a.original_path && /^image\//i.test(a.mime_type || ""))
      .map((a) => a.original_path);

    if (!text && images.length === 0) return;

    // 已读回执（支持时）
    const feats = await this._probeFeatures(this.getConfig()).catch(() => ({ typing: false, readReceipts: false }));
    if (feats.readReceipts) {
      await this._rpc("read", { to: sender }).catch(() => {});
    }

    const inbound = { sender, text, images, raw: m, dedupeId: m.guid || m.id || `${sender}:${Date.now()}` };
    this._handler?.(inbound).catch((e) => this.log.error?.(`[imsg] 处理失败: ${e instanceof Error ? e.message : e}`));
  }

  async send(to, text) {
    const r = await this._rpc("send", { to, text });
    return r;
  }

  /** 设置 typing 指示器（支持时）。 */
  async setTyping(handle, on) {
    const feats = await this._probeFeatures(this.getConfig()).catch(() => ({ typing: false, readReceipts: false }));
    if (!feats.typing) return;
    await this._rpc("typing", { to: handle, typing: !!on }).catch(() => {});
  }

  async stop() {
    this._disposed = true;
    try {
      this.child?.kill();
    } catch {}
    this.child = null;
  }

  describe() {
    const mode = this.getConfig().mode;
    return `imsg 本地通道 (${mode})`;
  }
}
