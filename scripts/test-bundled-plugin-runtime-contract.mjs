import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const runtimeModules = resolve("src-tauri/resources/dsh-runtime/node_modules");
const semver = createRequire(resolve(runtimeModules, "..", "package.json"))("semver");
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
    const runtimeVersion = runtimeVersions.get(dependency);
    if (dependency === "@deepseek-ai/cordis") {
      assert.ok(
        semver.satisfies(runtimeVersion, manifest.peerDependencies[dependency]),
        `${manifest.name} must declare a ${dependency} peer range covering bundled ${runtimeVersion}`,
      );
      continue;
    }
    // Same rule as DSH's evaluatePluginCompatibility: prereleases participate in ranges.
    assert.ok(
      semver.satisfies(runtimeVersion, manifest.peerDependencies[dependency], { includePrerelease: true }),
      `${manifest.name} must support bundled ${dependency}@${runtimeVersion}`,
    );
  }
}

console.log(`Bundled plugin runtime contract verified for ${packages.length} plugins.`);
