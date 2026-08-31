import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedInsightsToolIcons } from "./embed-insights-tool-icons.mjs";
import { patchSettingsSectionIcon } from "./patch-settings-section-icon.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const bundledPluginDefinitionsList = [
  {
    id: "insights",
    source: join(projectRoot, "packages", "harness-insights"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "lib"],
    expectedVersion: "0.1.3",
    clientId: "@anarkhgatsby/deepseek-harness-insights",
    clientEntry: "lib/client.js",
    patch: true,
  },
  {
    id: "channel-config",
    source: join(projectRoot, "packages", "harness-channel-config"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "lib"],
    expectedVersion: "0.1.3",
    clientId: "@anarkhgatsby/deepseek-harness-channel-config",
    clientEntry: "lib/client.js",
    patch: true,
  },
  {
    id: "core",
    source: join(projectRoot, "packages", "harness-core"),
    publishedEntries: ["package.json", "LICENSE", "README.md", "README.zh-CN.md", "index.js", "lib"],
    expectedVersion: "0.1.0",
    patch: false,
  },
  {
    id: "channel-feishu",
    source: join(projectRoot, "packages", "harness-channel-feishu"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "client.js", "index.js", "lib"],
    expectedVersion: "0.1.0",
    clientId: "@anarkhgatsby/deepseek-harness-channel-feishu",
    clientEntry: "client.js",
    patch: true,
  },
  {
    id: "channel-imessage",
    source: join(projectRoot, "packages", "harness-channel-imessage"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "client.js", "index.js", "lib"],
    expectedVersion: "0.1.1",
    clientId: "@anarkhgatsby/deepseek-harness-channel-imessage",
    clientEntry: "client.js",
    patch: true,
    macOnly: true,
  },
];

function bundledPluginDefinitions() {
  return bundledPluginDefinitionsList.filter((plugin) => !plugin.macOnly || process.platform !== "win32");
}

export async function installBundledPlugins(runtimeRoot) {
  await embedInsightsToolIcons();
  await patchSettingsSectionIcon(runtimeRoot);
  for (const plugin of bundledPluginDefinitions()) {
    const manifest = JSON.parse(await readFile(join(plugin.source, "package.json"), "utf8"));
    const destination = join(runtimeRoot, "node_modules", ...manifest.name.split("/"));
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const entry of plugin.publishedEntries) {
      await cp(join(plugin.source, entry), join(destination, entry), { recursive: true });
    }
    console.log(`Installed bundled plugin ${manifest.name}@${manifest.version}: ${destination}`);
  }
  await verifyBundledPlugins(runtimeRoot);
}

export async function verifyBundledPlugins(runtimeRoot) {
  for (const plugin of bundledPluginDefinitions()) {
    const sourceManifest = JSON.parse(await readFile(join(plugin.source, "package.json"), "utf8"));
    const root = join(runtimeRoot, "node_modules", ...sourceManifest.name.split("/"));
    const required = plugin.publishedEntries.map((entry) => join(root, entry));
    const missing = required.filter((path) => !existsSync(path));
    if (missing.length) throw new Error(`Bundled ${plugin.id} plugin is incomplete:\n${missing.join("\n")}`);
    const forbidden = [".git", "node_modules", "tests"]
      .map((entry) => join(root, entry))
      .filter((path) => existsSync(path));
    if (forbidden.length) {
      throw new Error(`Bundled ${plugin.id} plugin contains development files:\n${forbidden.join("\n")}`);
    }
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (manifest.name !== sourceManifest.name || manifest.version !== plugin.expectedVersion) {
      throw new Error(`Unexpected bundled ${plugin.id} identity: ${manifest.name}@${manifest.version}`);
    }
    if (plugin.clientId) {
      const clientPath = join(root, plugin.clientEntry);
      const client = await readFile(clientPath, "utf8");
      if (!client.includes("window.__ModuleLoader__.load({") || !client.includes(`id: "${plugin.clientId}"`) && !client.includes(`id: '${plugin.clientId}'`)) {
        throw new Error(`Bundled ${plugin.id} client is not a dsh.client module bundle.`);
      }
    }
  }
}
