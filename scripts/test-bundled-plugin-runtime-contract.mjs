import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const runtimeModules = resolve("src-tauri/resources/dsh-runtime/node_modules");
const packages = [
  "harness-insights",
  "harness-channel-config",
  "harness-core",
  "harness-channel-feishu",
  "harness-channel-wecom",
  "harness-channel-dingtalk",
  "harness-channel-imessage",
  "harness-locale-pack",
];

async function manifestAt(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const runtimeVersions = new Map();
for (const plugin of packages) {
  const manifest = await manifestAt(resolve("packages", plugin, "package.json"));
  for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
    if (dependency !== "@deepseek-ai/cordis" && !dependency.startsWith("@deepseek-ai/dsh-")) continue;
    if (!runtimeVersions.has(dependency)) {
      const runtime = await manifestAt(resolve(runtimeModules, dependency, "package.json"));
      runtimeVersions.set(dependency, runtime.version);
    }
    const expectedRange = dependency === "@deepseek-ai/cordis"
      ? `^${runtimeVersions.get(dependency)}`
      : runtimeVersions.get(dependency);
    assert.equal(
      manifest.peerDependencies[dependency],
      expectedRange,
      `${manifest.name} must declare the exact bundled ${dependency} peer range`,
    );
  }
}

console.log(`Bundled plugin runtime contract verified for ${packages.length} plugins.`);
