/**
 * index.js — harness-locale-pack Host 侧入口
 */
import z from "@deepseek-ai/schemastery";

export const name = "harness-locale-pack";

export const inject = ["settings"];

export const EXTENDED_LOCALE_IDS = [
  "zh", "en", "zh-TW",
  "bo", "mn", "ug", "ii",
  "ja", "ko", "fr", "de", "ru", "es"
];

const LocaleSettingsSchema = z.object({
  preference: z.union([...EXTENDED_LOCALE_IDS]).required(false),
});

export function apply(ctx) {
  try {
    ctx.settings?.register("locale", LocaleSettingsSchema);
  } catch (e) {
    // 兼容重复注册
  }
  ctx.logger?.info?.("[locale-pack] Host 侧多语言 Schema 已扩展至 13 种语言（含藏/蒙/维/彝）");
}
