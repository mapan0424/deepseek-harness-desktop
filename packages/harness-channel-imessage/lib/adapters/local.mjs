/**
 * Native macOS iMessage transport.
 *
 * Incoming messages are read from the local Messages database; outgoing text
 * is sent by Messages.app through AppleScript. No imsg CLI or third-party
 * relay is required.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const POLL_INTERVAL_MS = 1000;

const SEND_SCRIPT = `on run argv
  set targetHandle to item 1 of argv
  set outgoingText to item 2 of argv
  tell application "Messages"
    set targetService to first service whose service type = iMessage
    set targetBuddy to buddy targetHandle of targetService
    send outgoingText to targetBuddy
  end tell
end run`;

function friendlyError(error, action) {
  const detail = error instanceof Error ? error.message : String(error);
  return `${action}失败：${detail}。请在“系统设置 → 隐私与安全性”中为 DeepSeek Harness 开启完全磁盘访问；首次发送时允许其自动化控制“信息”。`;
}

export class LocalAdapter {
  constructor({ getConfig, log = console }) {
    this.getConfig = getConfig;
    this.log = log;
    this.db = null;
    this.timer = null;
    this.lastRowId = 0;
    this.handler = null;
    this.polling = false;
  }

  async start(handler) {
    this.handler = handler;
    this._openDatabase();
    this.lastRowId = this._latestRowId();
    this.timer = setInterval(() => void this._poll(), POLL_INTERVAL_MS);
    this.log.info?.(`[local] 正在监听 Messages chat.db（从第 ${this.lastRowId} 条之后开始）`);
  }

  _openDatabase() {
    const chatDb = this.getConfig().chatDb;
    if (!chatDb || !existsSync(chatDb)) {
      throw new Error(`找不到 chat.db：${chatDb || "未配置路径"}`);
    }
    try {
      this.db = new DatabaseSync(chatDb, { open: true, readOnly: true });
    } catch (error) {
      throw new Error(friendlyError(error, "打开 Messages 数据库"));
    }
  }

  _latestRowId() {
    const row = this.db.prepare("SELECT COALESCE(MAX(ROWID), 0) AS id FROM message").get();
    return Number(row?.id || 0);
  }

  async _poll() {
    if (this.polling || !this.db) return;
    this.polling = true;
    try {
      const rows = this.db
        .prepare(`
          SELECT m.ROWID AS id, m.guid AS guid, m.text AS text,
                 m.is_from_me AS is_from_me, h.id AS sender
          FROM message AS m
          LEFT JOIN handle AS h ON h.ROWID = m.handle_id
          WHERE m.ROWID > ? AND COALESCE(m.is_from_me, 0) = 0
          ORDER BY m.ROWID ASC
        `)
        .all(this.lastRowId);
      for (const row of rows) {
        this.lastRowId = Math.max(this.lastRowId, Number(row.id || 0));
        const sender = typeof row.sender === "string" ? row.sender.trim() : "";
        const text = typeof row.text === "string" ? row.text.trim() : "";
        if (!sender || !text) continue;
        await this.handler?.({
          sender,
          text,
          images: [],
          raw: { id: row.id, guid: row.guid },
          dedupeId: row.guid || String(row.id),
        });
      }
    } catch (error) {
      this.log.error?.(`[local] ${friendlyError(error, "读取 Messages 消息")}`);
    } finally {
      this.polling = false;
    }
  }

  async send(to, text) {
    await new Promise((resolve, reject) => {
      const child = spawn("/usr/bin/osascript", ["-e", SEND_SCRIPT, to, text], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `osascript 退出 code=${code}`));
      });
    }).catch((error) => {
      throw new Error(friendlyError(error, "通过 Messages.app 发送消息"));
    });
  }

  async setTyping() {
    // Messages.app does not expose a stable typing indicator API.
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.db?.close();
    this.db = null;
  }

  describe() {
    return "macOS 本地通道（chat.db + Messages.app）";
  }
}
