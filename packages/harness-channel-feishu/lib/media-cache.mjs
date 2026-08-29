/**
 * media-cache.mjs — 通道附件媒体缓存（参考 Hermes gateway/platforms/media_cache.py）
 *
 * 统一"下载字节 → 分类 → 落盘"流程，供各 adapter 复用：
 *   - MIME ↔ 扩展名统一映射（Hermes 的 DEFAULT_MIME_TO_EXT 子集，按需扩展）
 *   - 分类缓存目录：image / audio / document
 *   - UUID 文件名，避免冲突与平台文件名注入风险
 *   - 安全校验：大小上限 + 图片内容嗅探（防 HTML 错误页被当图片缓存）
 *
 * 缓存根目录默认 ~/dsh/attachments/<channel>/YYYYMMDD/，可用 env
 * DSH_CH_ATTACHMENTS_DIR 覆盖（例如指向某个 workspace 下的子目录）。
 */
import { homedir } from "node:os";
import { join, extname, basename } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// ── MIME ↔ 扩展名（Hermes DEFAULT_MIME_TO_EXT 精简子集） ─────────────────
export const MIME_TO_EXT = {
  // images
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".jpg", // 下游视觉工具读不了 HEIC，强制转 .jpg 扩展
  "image/bmp": ".bmp",
  // audio
  "audio/ogg": ".ogg",
  "audio/x-opus+ogg": ".ogg",
  "audio/opus": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/amr": ".amr",
  // video
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  // documents / misc
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "application/json": ".json",
  "application/octet-stream": ".bin",
};

/** 常见扩展名 → MIME（发送方向用）。 */
export const EXT_TO_MIME = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime]),
);

export const IMAGE_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/bmp",
]);
export const AUDIO_MIMES = new Set([
  "audio/ogg", "audio/x-opus+ogg", "audio/opus", "audio/mpeg", "audio/mp3",
  "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/amr",
]);
export const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** 单个附件默认大小上限。 */
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB

/** 附件缓存根目录。 */
export function attachmentRoot(channel = "chan") {
  const override = process.env.DSH_CH_ATTACHMENTS_DIR;
  return override ? join(override, channel) : join(homedir(), "dsh", "attachments", channel);
}

/** 按类型取缓存子目录（今日）。 */
function cacheDirFor(channel, kind) {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return join(attachmentRoot(channel), kind, day);
}

/** 按 MIME 解析扩展名（未知类型回退 .bin / 原始扩展）。 */
export function extForMime(mime, fallbackName = "") {
  const m = String(mime ?? "").toLowerCase();
  if (MIME_TO_EXT[m]) return MIME_TO_EXT[m];
  const e = extname(fallbackName).toLowerCase();
  if (e && /^\.[a-z0-9]{1,8}$/.test(e)) return e;
  return ".bin";
}

/** 图片内容嗅探：前几个字节的 magic number 校验，防止 HTML 错误页被缓存成图片。 */
export function looksLikeImage(data) {
  if (!data || data.length < 12) return false;
  const b = new Uint8Array(data);
  // JPEG FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // PNG 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // GIF 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  // WEBP RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  // BMP 42 4D
  if (b[0] === 0x42 && b[1] === 0x4d) return true;
  return false;
}

/** 分类判断：根据 MIME/扩展名/显式 kind 归为 image|audio|video|document。 */
export function classifyMedia(mime = "", filename = "", defaultKind = "") {
  const m = String(mime ?? "").toLowerCase();
  const ext = extname(filename).toLowerCase();
  if (IMAGE_MIMES.has(m) || /^\.(jpe?g|png|gif|webp|heic|bmp)$/.test(ext) || defaultKind === "image") return "image";
  if (AUDIO_MIMES.has(m) || /^\.(ogg|opus|mp3|wav|m4a|aac|amr)$/.test(ext) || defaultKind === "audio") return "audio";
  if (VIDEO_MIMES.has(m) || /^\.(mp4|mov|webm)$/.test(ext) || defaultKind === "video") return "video";
  return "document";
}

/**
 * 把原始字节缓存到磁盘。
 *
 * @param {object} opts
 * @param {Buffer|Uint8Array} opts.data   原始字节
 * @param {string}  [opts.mime]           媒体类型（MIME）
 * @param {string}  [opts.filename]       原始文件名（用于扩展名/展示名）
 * @param {string}  [opts.kind]           显式分类 image|audio|video|document
 * @param {string}  [opts.channel]        通道 tag（目录名）
 * @param {number}  [opts.maxBytes]       大小上限
 * @returns {Promise<{path: string, mime: string, kind: string, name: string}>}
 *          本地绝对路径；校验失败返回 { path: null, reason }（调用方决定是否丢弃）。
 */
export async function cacheMediaBytes({ data, mime = "", filename = "", kind = "", channel = "chan", maxBytes = DEFAULT_MAX_BYTES }) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
  if (buf.length === 0) return { path: null, reason: "empty" };
  if (buf.length > maxBytes) return { path: null, reason: `too-large:${buf.length}>${maxBytes}` };

  const cat = classifyMedia(mime, filename, kind);
  const ext = extForMime(mime, filename);
  const display = filename ? sanitizeName(filename) : `file${ext}`;

  if (cat === "image" && !looksLikeImage(buf)) {
    return { path: null, reason: "not-an-image" };
  }

  const dir = cacheDirFor(channel, cat);
  await mkdir(dir, { recursive: true });
  const name = `${cat}_${randomUUID().slice(0, 12)}${ext}`;
  const filepath = join(dir, name);
  await writeFile(filepath, buf);
  return { path: filepath, mime: mime || EXT_TO_MIME[ext] || "application/octet-stream", kind: cat, name: display };
}

function sanitizeName(s) {
  return String(s).replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file";
}

/** 读取本地文件并缓存（下载方向：把已落盘文件登记进缓存目录）。 */
export async function cacheLocalFile(srcPath, { mime = "", kind = "", channel = "chan", maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const data = await readFile(srcPath);
  return cacheMediaBytes({ data, mime, filename: basename(srcPath), kind, channel, maxBytes });
}

/** 便捷：图片字节 → 缓存。 */
export const cacheImageFromBytes = (data, { mime = "image/jpeg", filename = "", channel = "chan", maxBytes } = {}) =>
  cacheMediaBytes({ data, mime, filename, kind: "image", channel, maxBytes });

/** 便捷：任意文件字节 → 缓存。 */
export const cacheDocumentFromBytes = (data, { mime = "", filename = "", channel = "chan", maxBytes } = {}) =>
  cacheMediaBytes({ data, mime, filename, kind: "document", channel, maxBytes });
