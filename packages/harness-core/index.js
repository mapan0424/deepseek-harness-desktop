/**
 * index.js — harness-core 共享消息总线（纯库，非 cordis 插件）
 *
 * 供所有 channel 插件（imessage/qq/telegram/feishu...）import。
 * 导出一个与协议无关的 `GatewayCore`（通用消息总线）与一个通用日志器工厂。
 *
 * 用法（channel 插件内）：
 *   import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";
 *   const log = createChannelLogger("qq", ctx.logger);
 *   const core = new GatewayCore({ tag: "qq", adapter, ...hosts, log, statePath });
 */
export { GatewayCore } from "./lib/gateway-core.mjs";
export { createChannelLogger } from "./lib/helpers/logger.mjs";
