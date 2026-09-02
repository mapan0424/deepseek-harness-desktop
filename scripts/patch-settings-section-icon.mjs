import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const packageRelativePath = [
  "node_modules",
  "@deepseek-ai",
  "dsh-client-ui-settings-general",
  "lib",
  "client.js",
];

const marker = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "models")';
const legacyReplacement = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "harness-channel-config") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "models")';
const replacement = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "harness-insights") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "harness-channel-config") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "models")';

export async function patchSettingsSectionIcon(runtimeRoot) {
  const path = join(runtimeRoot, ...packageRelativePath);
  if (!existsSync(path)) throw new Error(`Missing DSH settings shell: ${path}`);

  const content = await readFile(path, "utf8");
  if (content.includes(replacement)) return;

  if (content.includes(legacyReplacement)) {
    const patched = content.replace(legacyReplacement, replacement);
    await writeFile(path, patched);
    console.log(`Updated DSH settings section icon: ${path}`);
    return;
  }

  const markerCount = content.split(marker).length - 1;
  if (markerCount !== 1) {
    throw new Error(`Unexpected DSH settings shell shape: expected one navIcon marker, found ${markerCount}`);
  }

  const patched = content.replace(marker, replacement);
  await writeFile(path, patched);
  console.log(`Patched DSH settings section icon: ${path}`);
}
