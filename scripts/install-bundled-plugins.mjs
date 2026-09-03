import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedInsightsToolIcons } from "./embed-insights-tool-icons.mjs";
import { patchSettingsSectionIcon } from "./patch-settings-section-icon.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const bundledPluginDefinitionsList = [
  {
    id: "insights",
    packageName: "@anarkhgatsby/deepseek-harness-insights",
    source: join(projectRoot, "packages", "harness-insights"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "lib"],
    expectedVersion: "0.1.5",
    clientId: "@anarkhgatsby/deepseek-harness-insights",
    clientEntry: "lib/client.js",
    patch: true,
  },
  {
    id: "channel-config",
    packageName: "@anarkhgatsby/deepseek-harness-channel-config",
    source: join(projectRoot, "packages", "harness-channel-config"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "lib"],
    expectedVersion: "0.1.5",
    clientId: "@anarkhgatsby/deepseek-harness-channel-config",
    clientEntry: "lib/client.js",
    patch: true,
  },
  {
    id: "core",
    packageName: "@anarkhgatsby/deepseek-harness-core",
    source: join(projectRoot, "packages", "harness-core"),
    publishedEntries: ["package.json", "LICENSE", "README.md", "README.zh-CN.md", "index.js", "lib"],
    expectedVersion: "0.1.1",
    patch: false,
  },
  {
    id: "channel-feishu",
    packageName: "@anarkhgatsby/deepseek-harness-channel-feishu",
    source: join(projectRoot, "packages", "harness-channel-feishu"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "client.js", "index.js", "lib"],
    expectedVersion: "0.1.1",
    clientId: "@anarkhgatsby/deepseek-harness-channel-feishu",
    clientEntry: "client.js",
    patch: true,
  },
  {
    id: "channel-wecom",
    packageName: "@anarkhgatsby/deepseek-harness-channel-wecom",
    source: join(projectRoot, "packages", "harness-channel-wecom"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "client.js", "index.js", "lib"],
    expectedVersion: "0.1.2",
    clientId: "@anarkhgatsby/deepseek-harness-channel-wecom",
    clientEntry: "client.js",
    patch: true,
  },
  {
    id: "channel-imessage",
    packageName: "@anarkhgatsby/deepseek-harness-channel-imessage",
    source: join(projectRoot, "packages", "harness-channel-imessage"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "client.js", "index.js", "lib"],
    expectedVersion: "0.1.2",
    clientId: "@anarkhgatsby/deepseek-harness-channel-imessage",
    clientEntry: "client.js",
    patch: true,
    macOnly: true,
  },
  {
    id: "locale-pack",
    packageName: "@anarkhgatsby/deepseek-harness-locale-pack",
    source: join(projectRoot, "packages", "harness-locale-pack"),
    publishedEntries: ["package.json", "cordis.patch.yml", "LICENSE", "README.md", "README.zh-CN.md", "client.js", "index.js"],
    expectedVersion: "0.1.2",
    clientId: "@anarkhgatsby/deepseek-harness-locale-pack",
    clientEntry: "client.js",
    patch: true,
  },
];

function bundledPluginDefinitions() {
  return bundledPluginDefinitionsList.filter((plugin) => !plugin.macOnly || process.platform !== "win32");
}

function npmEnv() {
  const env = { ...process.env };
  delete env.npm_config_before;
  delete env.NPM_CONFIG_BEFORE;
  return env;
}

async function unpackNpmPackage(plugin) {
  const spec = `${plugin.packageName}@${plugin.expectedVersion}`;
  const work = await mkdtemp(join(tmpdir(), `dsh-plugin-${plugin.id}-`));
  const packed = spawnSync("npm", ["pack", spec, "--pack-destination", work], {
    encoding: "utf8",
    env: npmEnv(),
  });
  if (packed.status !== 0) {
    await rm(work, { recursive: true, force: true });
    throw new Error(packed.stderr.trim() || packed.stdout.trim() || `npm pack ${spec} failed`);
  }
  const tarball = (await readdir(work)).find((name) => name.endsWith(".tgz"));
  if (!tarball) {
    await rm(work, { recursive: true, force: true });
    throw new Error(`npm pack ${spec} did not produce a tarball`);
  }
  const extracted = spawnSync("tar", ["-xzf", join(work, tarball), "-C", work], { encoding: "utf8" });
  if (extracted.status !== 0) {
    await rm(work, { recursive: true, force: true });
    throw new Error(extracted.stderr.trim() || `failed to extract ${tarball}`);
  }
  const unpacked = join(work, "package");
  if (!existsSync(join(unpacked, "package.json"))) {
    await rm(work, { recursive: true, force: true });
    throw new Error(`extracted ${spec} is missing package.json`);
  }
  return { unpacked, cleanup: () => rm(work, { recursive: true, force: true }) };
}

async function copyPluginFiles(source, destination, plugin, fromNpm) {
  await rm(destination, { recursive: true, force: true });
  if (fromNpm) {
    await cp(source, destination, { recursive: true });
    return;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of plugin.publishedEntries) {
    const from = join(source, entry);
    if (!existsSync(from)) {
      if (entry === "LICENSE" || entry.startsWith("README")) continue;
      throw new Error(`Plugin ${plugin.id} is missing ${entry} in ${source}`);
    }
    await cp(from, join(destination, entry), { recursive: true });
  }
}

export async function installBundledPlugins(runtimeRoot) {
  await embedInsightsToolIcons();
  await patchSettingsSectionIcon(runtimeRoot);
  for (const plugin of bundledPluginDefinitions()) {
    const destination = join(runtimeRoot, "node_modules", ...plugin.packageName.split("/"));
    let origin = "npm";
    let cleanup = async () => {};
    let source = plugin.source;
    try {
      const unpacked = await unpackNpmPackage(plugin);
      source = unpacked.unpacked;
      cleanup = unpacked.cleanup;
    } catch (error) {
      origin = "local";
      console.warn(
        `Falling back to local ${plugin.packageName}: ${error instanceof Error ? error.message : error}`,
      );
    }
    try {
      await copyPluginFiles(source, destination, plugin, origin === "npm");
      console.log(
        `Installed bundled plugin ${plugin.packageName}@${plugin.expectedVersion} from ${origin}: ${destination}`,
      );
    } finally {
      await cleanup();
    }
  }
  await verifyBundledPlugins(runtimeRoot);
}

export async function verifyBundledPlugins(runtimeRoot) {
  for (const plugin of bundledPluginDefinitions()) {
    const root = join(runtimeRoot, "node_modules", ...plugin.packageName.split("/"));
    const required = ["package.json"];
    if (plugin.patch) required.push("cordis.patch.yml");
    if (plugin.clientEntry) required.push(plugin.clientEntry);
    const missing = required.map((entry) => join(root, entry)).filter((path) => !existsSync(path));
    if (missing.length) throw new Error(`Bundled ${plugin.id} plugin is incomplete:\n${missing.join("\n")}`);
    const forbidden = [".git", "node_modules", "tests"]
      .map((entry) => join(root, entry))
      .filter((path) => existsSync(path));
    if (forbidden.length) {
      throw new Error(`Bundled ${plugin.id} plugin contains development files:\n${forbidden.join("\n")}`);
    }
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (manifest.name !== plugin.packageName || manifest.version !== plugin.expectedVersion) {
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
