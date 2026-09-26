/**
 * settings.mjs — 通道配置 Scope 兼容解析器
 *
 * 解决 DSH 0.1.7-rc.2 重构去掉 ctx.settings.register 导致的启动崩溃。
 * 提供双向兼容的 scope 对象（get / replace / watch），自动兼容：
 * - 旧版 DSH 的 ctx.settings.register
 * - 新版 DSH 0.1.7-rc.2 的纯文件模式（~/.dsh/settings.yaml 及 settings.yaml.imported）
 * - 支持运行时配置热更新与持久化落盘
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

function parseSectionFromYaml(raw, section) {
  if (!raw || typeof raw !== "string") return {};
  const lines = raw.split("\n");
  const out = {};
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0 && trimmed.endsWith(":")) {
      inSection = trimmed.slice(0, -1).trim() === section;
      continue;
    }

    if (inSection && indent >= 2) {
      const m = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (m) {
        const key = m[1];
        const valStr = m[2].trim();
        if (valStr === "true") {
          out[key] = true;
        } else if (valStr === "false") {
          out[key] = false;
        } else if (/^-?\d+(\.\d+)?$/.test(valStr)) {
          out[key] = Number(valStr);
        } else if (valStr.startsWith("[") || valStr.startsWith("{")) {
          try {
            out[key] = JSON.parse(valStr);
          } catch {
            out[key] = valStr;
          }
        } else if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
          out[key] = valStr.slice(1, -1);
        } else {
          out[key] = valStr;
        }
      }
    }
  }
  return out;
}

export function resolveSettingsScope(ctx, section, baseConfig = {}, options = {}) {
  // 1. 如果运行时提供了传统 ctx.settings.register（旧版 DSH 兼容）
  if (typeof ctx?.settings?.register === "function") {
    try {
      const scope = ctx.settings.register(section, options.schema, { base: baseConfig });
      if (scope && typeof scope.get === "function") {
        return scope;
      }
    } catch (e) {
      ctx?.logger?.warn?.(`[settings] ctx.settings.register 降级为本地配置模式: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 2. 本地文件 Scope 兼容实现
  const settingsPath = options.settingsPath || join(homedir(), ".dsh", "settings.yaml");
  const importedPath = join(homedir(), ".dsh", "settings.yaml.imported");

  let currentConfig = { ...baseConfig };
  const watchers = new Set();

  const loadFromDisk = () => {
    let parsed = {};
    if (existsSync(settingsPath)) {
      try {
        const raw = readFileSync(settingsPath, "utf8");
        parsed = parseSectionFromYaml(raw, section);
      } catch {}
    }
    // 若 settings.yaml 中无此段，尝试回退读取 settings.yaml.imported
    if (Object.keys(parsed).length === 0 && existsSync(importedPath)) {
      try {
        const raw = readFileSync(importedPath, "utf8");
        parsed = parseSectionFromYaml(raw, section);
      } catch {}
    }
    return parsed;
  };

  // 初始加载
  const initialDisk = loadFromDisk();
  currentConfig = { ...baseConfig, ...initialDisk };

  const scope = {
    get() {
      return { ...currentConfig };
    },

    async replace(next) {
      currentConfig = { ...baseConfig, ...next };

      // 写入到 settings.yaml
      try {
        let raw = "";
        if (existsSync(settingsPath)) {
          try {
            raw = await readFile(settingsPath, "utf8");
          } catch {}
        } else if (existsSync(importedPath)) {
          try {
            raw = await readFile(importedPath, "utf8");
          } catch {}
        }

        const lines = raw ? raw.split("\n") : [];
        const newSectionLines = [`${section}:`];
        for (const [k, v] of Object.entries(currentConfig)) {
          if (v === undefined || v === null) continue;
          if (typeof v === "boolean" || typeof v === "number") {
            newSectionLines.push(`  ${k}: ${v}`);
          } else if (typeof v === "string") {
            newSectionLines.push(`  ${k}: ${JSON.stringify(v)}`);
          } else if (Array.isArray(v) || typeof v === "object") {
            newSectionLines.push(`  ${k}: ${JSON.stringify(v)}`);
          }
        }

        const outLines = [];
        let inSection = false;
        let replaced = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          const indent = line.length - line.trimStart().length;

          if (indent === 0 && trimmed.endsWith(":") && trimmed.slice(0, -1).trim() === section) {
            inSection = true;
            replaced = true;
            outLines.push(...newSectionLines);
            continue;
          }
          if (inSection) {
            if (indent >= 2) continue;
            inSection = false;
          }
          outLines.push(line);
        }

        if (!replaced) {
          if (outLines.length > 0 && outLines[outLines.length - 1].trim() !== "") {
            outLines.push("");
          }
          outLines.push(...newSectionLines);
        }

        await mkdir(dirname(settingsPath), { recursive: true });
        await writeFile(settingsPath, outLines.join("\n"), "utf8");
      } catch (err) {
        ctx?.logger?.warn?.(`[settings] 保存 ${section} 配置到文件失败: ${err instanceof Error ? err.message : err}`);
      }

      // 如果 DSH 0.1.7-rc.2 的 ctx.settings 有 replace 方法，尝试同步写入
      if (typeof ctx?.settings?.replace === "function") {
        try {
          await ctx.settings.replace(section, currentConfig);
        } catch {}
      }

      // 触发热更新通知
      for (const watcher of watchers) {
        try {
          watcher(currentConfig);
        } catch (e) {
          ctx?.logger?.error?.(`[settings] ${section} 配置 watch 回调执行异常: ${e instanceof Error ? e.message : e}`);
        }
      }

      return currentConfig;
    },

    watch(fn) {
      if (typeof fn === "function") {
        watchers.add(fn);
      }
      return () => watchers.delete(fn);
    },
  };

  return scope;
}
