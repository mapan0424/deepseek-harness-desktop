/**
 * adapters/signal.mjs — Signal signal-cli 本地传输适配器
 *
 * signal-cli（JSON-RPC over stdio）收/发，数据不出本机。同 imsg 路线。
 * signal-cli 提供 `signal-cli -a <account> jsonRpc` 接口。
 */
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SignalAdapter extends EventEmitter {
  constructor({ getConfig, log = console }) {
    super();
    this.getConfig = getConfig;
    this.log = log;
    this.child = null;
    this._msgId = 1;
    this._pending = new Map();
    this._buffer = "";
    this._stopped = false;
    this._handler = null;
  }

  async start(handler) {
    this._handler = handler;
    await this._spawn();
  }

  async _spawn() {
    if (this.child) return;
    const cfg = this.getConfig();
    const cmd = cfg.signalCliCmd || "signal-cli";
    const account = cfg.signalAccount || process.env.SIGNAL_ACCOUNT;
    const args = [...(account ? ["-a", account] : []), "jsonRpc"];
    this.log.info?.(`[signal] 启动 ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c) => this._onData(c));
    child.on("error", (e) => this.log.error?.(`[signal] rpc error: ${e.message}`));
    child.on("exit", (code) => {
      this.log.warn?.(`[signal] rpc 退出 code=${code}`);
      this.child = null;
      if (!this._stopped) setTimeout(() => this._spawn(), 3000);
    });
    this._rpc("subscribe", {}).catch((e) => this.log.error?.(`[signal] subscribe failed: ${e.message}`));
  }

  _onData(chunk) {
    this._buffer += chunk;
    let idx;
    while ((idx = this._buffer.indexOf("\n")) !== -1) {
      const line = this._buffer.slice(0, idx).trim();
      this._buffer = this._buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
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
    if (method !== "receive" && method !== "message") return;
    const msg = params?.envelope || params?.message || params;
    if (!msg || typeof msg !== "object") return;
    const sender = msg.sourceNumber || msg.sender || null;
    if (!sender) return;
    const text = typeof msg.dataMessage?.message === "string" ? msg.dataMessage.message : (msg.text || "");
    if (!text) return;
    const dedupeId = msg.timestamp || `${sender}:${Date.now()}`;
    this._handler?.({
      sender,
      text,
      images: [],
      raw: msg,
      dedupeId: String(dedupeId),
    }).catch((e) => this.log.error?.(`[signal] 处理失败: ${e.message}`));
  }

  async send(to, text) {
    const r = await this._rpc("send", { recipient: to, message: text });
    return r;
  }

  async setTyping() {
    // signal-cli 无 typing（或需高级功能）
  }

  async stop() {
    this._stopped = true;
    try { this.child?.kill(); } catch {}
    this.child = null;
  }

  describe() {
    const cfg = this.getConfig();
    return `Signal 通道 (${cfg.signalAccount ? "已配置" : "未配置 account"})`;
  }
}
