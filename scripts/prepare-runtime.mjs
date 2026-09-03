import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { patchRuntimeCompatibility } from "./patch-runtime-compat.mjs";
import { installBundledPlugins } from "./install-bundled-plugins.mjs";
import { bundledPnpmVersion, materializeBundledPnpmLauncher, pruneBundledPnpmNativeModules, verifyBundledPnpm } from "./bundled-pnpm.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resourcesRoot = join(projectRoot, "src-tauri", "resources");
const runtimeRoot = join(resourcesRoot, "dsh-runtime");
const cacheRoot = join(resourcesRoot, ".cache");
const dshVersion = "0.1.2-alpha.5";
const nodeVersion = process.env.ARM_NODE_VERSION || "22.23.2";
const nodeArch = "arm64";
const nodeTarballName = `node-v${nodeVersion}-darwin-${nodeArch}.tar.gz`;
const nodeBaseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
const nodeTarballPath = join(cacheRoot, nodeTarballName);
const nodeExtractRoot = join(cacheRoot, `node-v${nodeVersion}-darwin-${nodeArch}`);
const officialNode = join(nodeExtractRoot, "bin", "node");
const officialLicense = join(nodeExtractRoot, "LICENSE");

await mkdir(cacheRoot, { recursive: true });
await downloadAndVerifyOfficialNode();
assertArchitecture(officialNode, "arm64");

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });
await cp(officialNode, join(runtimeRoot, "node"));
await chmod(join(runtimeRoot, "node"), 0o755);
signBinary(join(runtimeRoot, "node"));

await writeFile(
  join(runtimeRoot, "package.json"),
  JSON.stringify(
    {
      name: "deepseek-harness-dsh-runtime",
      private: true,
      dependencies: { "@deepseek-ai/dsh": dshVersion, pnpm: bundledPnpmVersion },
    },
    null,
    2,
  ) + "\n",
);

await run("npm", [
  "install",
  "--prefix",
  runtimeRoot,
  "--omit=dev",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--os=darwin",
  "--cpu=arm64",
  "--include=optional",
], {
  npm_config_arch: nodeArch,
  npm_config_target_arch: nodeArch,
  npm_config_platform: "darwin",
});

await patchRuntimeCompatibility(runtimeRoot);
await installBundledPlugins(runtimeRoot);
await pruneRuntime();
await pruneBundledPnpmNativeModules(runtimeRoot, "darwin-arm64");
await materializeBundledPnpmLauncher(runtimeRoot);
await verifyBundledPnpm(runtimeRoot, join(runtimeRoot, "node"));
assertRuntimeNatives();
await installRuntimeLegalFiles();
console.log(`Prepared self-contained slim dsh ${dshVersion} ARM runtime with official Node ${nodeVersion}: ${runtimeRoot}`);

async function downloadAndVerifyOfficialNode() {
  const shasumsUrl = `${nodeBaseUrl}/SHASUMS256.txt`;
  const response = await fetch(shasumsUrl);
  if (!response.ok) throw new Error(`下载 Node.js 校验文件失败：${response.status} ${shasumsUrl}`);
  const shasums = await response.text();
  const line = shasums.split("\n").find((item) => item.trim().endsWith(`  ${nodeTarballName}`));
  if (!line) throw new Error(`SHASUMS256.txt 中找不到 ${nodeTarballName}`);
  const expected = line.trim().split(/\s+/)[0];

  if (!existsSync(nodeTarballPath)) {
    const tarball = await fetch(`${nodeBaseUrl}/${nodeTarballName}`);
    if (!tarball.ok || !tarball.body) {
      throw new Error(`下载官方 Node.js 失败：${tarball.status} ${nodeTarballName}`);
    }
    await pipeline(tarball.body, createWriteStream(nodeTarballPath));
  }

  const actual = await sha256(nodeTarballPath);
  if (actual !== expected) {
    await rm(nodeTarballPath, { force: true });
    throw new Error(`Node.js SHA-256 校验失败：expected ${expected}, got ${actual}`);
  }

  if (!existsSync(officialNode) || !existsSync(officialLicense)) {
    await rm(nodeExtractRoot, { recursive: true, force: true });
    await run("tar", ["-xzf", nodeTarballPath, "-C", cacheRoot]);
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function pruneRuntime() {
  const nodePtyRoot = join(runtimeRoot, "node_modules", "node-pty");
  if (existsSync(nodePtyRoot)) {
    for (const name of ["deps", "third_party", "src", "scripts"]) {
      await rm(join(nodePtyRoot, name), { recursive: true, force: true });
    }
    await rm(join(nodePtyRoot, "binding.gyp"), { force: true });
    await keepOnlyDirectory(join(nodePtyRoot, "prebuilds"), "darwin-arm64");
    for (const name of ["pty.node", "spawn-helper"]) {
      const path = join(nodePtyRoot, "prebuilds", "darwin-arm64", name);
      if (existsSync(path)) await chmod(path, 0o755);
    }
  }

  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@img"), (name) =>
    !name.startsWith("sharp-") || name === "sharp-darwin-arm64" || name === "sharp-libvips-darwin-arm64");
  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@koromix"), (name) =>
    !name.startsWith("koffi-") || name === "koffi-darwin-arm64");
  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@vscode"), (name) =>
    !name.startsWith("ripgrep-") || name === "ripgrep-darwin-arm64");
  // This optional accelerator currently ships with LC_BUILD_VERSION minos
  // 15.0. Cordis catches its absence and falls back to standard module loading,
  // so exclude it to keep the app compatible with macOS 12.7.6.
  await keepMatchingPackages(join(runtimeRoot, "node_modules"), (name) =>
    !name.startsWith("node-addon-require-builtin-darwin-"));

  await rm(join(runtimeRoot, "node_modules", ".package-lock.json"), { force: true });
  await pruneNonRuntimeFiles(join(runtimeRoot, "node_modules"));
}

async function keepOnlyDirectory(root, keep) {
  if (!existsSync(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name !== keep) await rm(join(root, entry.name), { recursive: true, force: true });
  }
}

async function keepMatchingPackages(root, keep) {
  if (!existsSync(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !keep(entry.name)) {
      await rm(join(root, entry.name), { recursive: true, force: true });
    }
  }
}

async function pruneNonRuntimeFiles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["test", "tests", "__tests__", "coverage"].includes(entry.name.toLowerCase())) {
        await rm(path, { recursive: true, force: true });
      } else {
        await pruneNonRuntimeFiles(path);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (
      lower.endsWith(".map")
      || lower.endsWith(".d.ts")
      || lower.endsWith(".d.mts")
      || lower.endsWith(".d.cts")
      || lower.endsWith(".tsbuildinfo")
    ) {
      await rm(path, { force: true });
    }
  }
}

function assertRuntimeNatives() {
  const required = [
    join(runtimeRoot, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "pty.node"),
    join(runtimeRoot, "node_modules", "@img", "sharp-darwin-arm64"),
    join(runtimeRoot, "node_modules", "@img", "sharp-libvips-darwin-arm64"),
    join(runtimeRoot, "node_modules", "@koromix", "koffi-darwin-arm64"),
    join(runtimeRoot, "node_modules", "@vscode", "ripgrep-darwin-arm64"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`ARM 运行时缺少原生模块：\n${missing.join("\n")}`);
}

async function installRuntimeLegalFiles() {
  const legalRoot = join(runtimeRoot, "legal");
  await mkdir(legalRoot, { recursive: true });
  await cp(officialLicense, join(legalRoot, "NODEJS_LICENSE"));

  const packages = [];
  await collectPackageMetadata(join(runtimeRoot, "node_modules"), packages);
  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const dsh = packages.find((item) => item.name === "@deepseek-ai/dsh");
  const version = spawnSync(join(runtimeRoot, "node"), ["--version"], { encoding: "utf8" }).stdout.trim();
  const lines = [
    "# Bundled Runtime Package Inventory", "",
    "Generated from the ARM64 production dependency closure embedded in this build.",
    "Package-provided license, notice, and README files are retained next to package code.", "",
    `Bundled Node.js: ${version} (darwin-arm64)`,
    `Bundled DeepSeek Harness: ${dsh?.version ?? dshVersion}`, "",
    "| Package | Version | Declared license |", "| --- | --- | --- |",
    ...packages.map(({ name, version, license }) =>
      `| \`${name.replaceAll("|", "\\|")}\` | \`${version}\` | ${license.replaceAll("|", "\\|")} |`), "",
  ];
  await writeFile(join(legalRoot, "RUNTIME_PACKAGE_INVENTORY.md"), lines.join("\n"));
}

async function collectPackageMetadata(directory, packages) {
  if (!existsSync(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith("@")) {
      await collectPackageMetadata(path, packages);
      continue;
    }
    const manifestPath = join(path, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const license = typeof manifest.license === "string"
      ? manifest.license
      : Array.isArray(manifest.licenses)
        ? manifest.licenses.map((item) => item.type ?? String(item)).join(" OR ")
        : "NOT DECLARED — inspect package files";
    packages.push({ name: manifest.name ?? entry.name, version: manifest.version ?? "unknown", license });
    await collectPackageMetadata(join(path, "node_modules"), packages);
  }
}

function assertArchitecture(file, expected) {
  const result = spawnSync("file", [file], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.includes(expected)) {
    throw new Error(`二进制架构不是 ${expected}：${result.stdout.trim()}`);
  }
}

function signBinary(file) {
  const result = spawnSync("codesign", ["--force", "--sign", "-", "--timestamp=none", file], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`codesign 失败：${file}`);
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} 退出，状态码：${code}`)));
  });
}
