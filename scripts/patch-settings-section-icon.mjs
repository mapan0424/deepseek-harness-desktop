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

const markerAccount = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "account")';
const markerModels = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "models")';
const replacementAccount = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "harness-insights") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkleMedium, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "harness-channel-config") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutlineMedium, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "account")';
const legacyReplacement = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "harness-channel-config") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "models")';
const replacementModels = '\t\tfunction navIcon(id) {\n\t\t\tif (id === "harness-insights") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "harness-channel-config") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, {\n\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,\n\t\t\t\tsize: 16\n\t\t\t});\n\t\t\tif (id === "models")';
const compactPatchedMarker = 'function navIcon(id){if(id==="harness-insights")return';

export async function patchSettingsSectionIcon(runtimeRoot) {
  const path = join(runtimeRoot, ...packageRelativePath);
  if (!existsSync(path)) throw new Error(`Missing DSH settings shell: ${path}`);

  const content = await readFile(path, "utf8");
  // `patch-runtime-compat` can minify this client bundle after a previous run.
  // Recognize both forms so the operation remains idempotent on RC2.
  if (
    content.includes(replacementAccount) ||
    content.includes(replacementModels) ||
    content.includes(compactPatchedMarker)
  ) return;

  if (content.includes(legacyReplacement)) {
    const patched = content.replace(legacyReplacement, replacementModels);
    await writeFile(path, patched);
    console.log(`Updated DSH settings section icon: ${path}`);
    return;
  }

  if (content.includes(markerAccount)) {
    const patched = content.replace(markerAccount, replacementAccount);
    await writeFile(path, patched);
    console.log(`Patched DSH settings section icon (0.1.7 account): ${path}`);
    return;
  }

  if (content.includes(markerModels)) {
    const patched = content.replace(markerModels, replacementModels);
    await writeFile(path, patched);
    console.log(`Patched DSH settings section icon (legacy models): ${path}`);
    return;
  }

  throw new Error(`Unexpected DSH settings shell shape: expected navIcon marker for account or models. Review client.js.`);
}
