/**
 * helpers/logger.mjs — 通用通道日志器
 *
 * 每个 channel 插件用同一个工厂造出带 `[tag]` 前缀的 logger（tag 如 "im" / "qq"）。
 * 同时双写：stdout（供 CLI/桌面运行可见）与 Cordis Logger（若可用）。
 * log 对象同时作为 message bus 的 `log` 注入项。
 */
export function createChannelLogger(tag, cordisLogger) {
  const ts = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const prefix = `[${ts()}] [${tag}]`;
  return {
    info: (m) => {
      console.log(`${prefix} ${m}`);
      try { cordisLogger?.info?.(`[${tag}] ${m}`); } catch {}
    },
    warn: (m) => {
      console.warn(`${prefix}:warn ${m}`);
      try { cordisLogger?.warn?.(`[${tag}] ${m}`); } catch {}
    },
    error: (m) => {
      console.error(`${prefix}:err ${m}`);
      try { cordisLogger?.error?.(`[${tag}] ${m}`); } catch {}
    },
    debug: (m) => {
      try { cordisLogger?.debug?.(`[${tag}] ${m}`); } catch {}
    },
  };
}
