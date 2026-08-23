import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedInsightsToolIcons } from "./embed-insights-tool-icons.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const insightsSource = join(projectRoot, "packages", "harness-insights");

export async function installBundledPlugins(runtimeRoot) {
  await embedInsightsToolIcons();
  const destination = join(runtimeRoot, "node_modules", "@anarkhgatsby", "deepseek-harness-insights");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const publishedEntries = [
    "package.json",
    "cordis.patch.yml",
    "LICENSE",
    "README.md",
    "README.zh-CN.md",
    "lib",
  ];
  for (const entry of publishedEntries) {
    await cp(join(insightsSource, entry), join(destination, entry), { recursive: true });
  }
  await verifyBundledPlugins(runtimeRoot);
  console.log(`Installed bundled plugin @anarkhgatsby/deepseek-harness-insights: ${destination}`);
}

export async function verifyBundledPlugins(runtimeRoot) {
  const root = join(runtimeRoot, "node_modules", "@anarkhgatsby", "deepseek-harness-insights");
  const required = [
    join(root, "package.json"),
    join(root, "lib", "index.js"),
    join(root, "lib", "client.js"),
    join(root, "cordis.patch.yml"),
    join(root, "LICENSE"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`Bundled Insights plugin is incomplete:\n${missing.join("\n")}`);
  const forbidden = [".git", "node_modules", "tests", "assets"]
    .map((entry) => join(root, entry))
    .filter((path) => existsSync(path));
  if (forbidden.length) {
    throw new Error(`Bundled Insights plugin contains development files:\n${forbidden.join("\n")}`);
  }
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (manifest.name !== "@anarkhgatsby/deepseek-harness-insights" || manifest.version !== "0.1.3") {
    throw new Error(`Unexpected bundled Insights identity: ${manifest.name}@${manifest.version}`);
  }
  const client = await readFile(join(root, "lib", "client.js"), "utf8");
  if (!client.includes("window.__ModuleLoader__.load({") || !client.includes("id: '@anarkhgatsby/deepseek-harness-insights'")) {
    throw new Error("Bundled Insights client is not a dsh.client module bundle.");
  }
}
