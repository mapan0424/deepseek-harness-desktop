import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { patchRuntimeCompatibility } from "./patch-runtime-compat.mjs";
import { installBundledPlugins } from "./install-bundled-plugins.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resourcesRoot = join(projectRoot, "src-tauri", "resources");
const runtimeRoot = join(resourcesRoot, "dsh-runtime");
const cacheRoot = join(resourcesRoot, ".cache");
const dshVersion = "0.1.0-rc.7";
const nodeVersion = process.env.INTEL_NODE_VERSION || "22.23.2";
const nodeArch = "x64";
const nodeTarballName = `node-v${nodeVersion}-darwin-${nodeArch}.tar.gz`;
const nodeTarballUrl = `https://nodejs.org/dist/v${nodeVersion}/${nodeTarballName}`;
const nodeTarballPath = join(cacheRoot, nodeTarballName);
const nodeExtractRoot = join(cacheRoot, `node-v${nodeVersion}-darwin-${nodeArch}`);
const officialNode = join(nodeExtractRoot, "bin", "node");
const officialLicense = join(nodeExtractRoot, "LICENSE");

await mkdir(cacheRoot, { recursive: true });
await downloadAndVerifyOfficialNode();
assertIntelBinary(officialNode);

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });
await cp(officialNode, join(runtimeRoot, "node"));
await chmod(join(runtimeRoot, "node"), 0o755);
await mkdir(join(runtimeRoot, "lib"), { recursive: true });
signBinary(join(runtimeRoot, "node"));

await writeFile(
  join(runtimeRoot, "package.json"),
  JSON.stringify(
    {
      name: "deepseek-harness-dsh-runtime",
      private: true,
      dependencies: { "@deepseek-ai/dsh": dshVersion },
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
], {
  npm_config_arch: nodeArch,
  npm_config_target_arch: nodeArch,
  npm_config_platform: "darwin",
});

// Host is Apple Silicon. npm still resolves optional native addons to arm64
// unless those packages are requested by os/cpu. Intel dsh needs these.
await run("npm", [
  "install",
  "--prefix",
  runtimeRoot,
  "--omit=dev",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--os=darwin",
  "--cpu=x64",
  "--include=optional",
  "--force",
  "@img/sharp-darwin-x64",
  "@img/sharp-libvips-darwin-x64",
  "@koromix/koffi-darwin-x64",
], {
  npm_config_arch: nodeArch,
  npm_config_target_arch: nodeArch,
  npm_config_platform: "darwin",
});

await patchRuntimeCompatibility(runtimeRoot);
await installBundledPlugins(runtimeRoot);
await pruneIntelRuntime();
assertIntelNatives();
await installRuntimeLegalFiles();

console.log(`Prepared slim dsh ${dshVersion} Intel runtime with Node ${nodeVersion} x64: ${runtimeRoot}`);

async function downloadAndVerifyOfficialNode() {
  const shasumsUrl = `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`;
  const shasumsResponse = await fetch(shasumsUrl);
  if (!shasumsResponse.ok) {
    throw new Error(`下载 Node.js 校验文件失败：${shasumsResponse.status} ${shasumsUrl}`);
  }
  const shasums = await shasumsResponse.text();
  const line = shasums.split("\n").find((item) => item.trim().endsWith(`  ${nodeTarballName}`));
  if (!line) throw new Error(`SHASUMS256.txt 中找不到 ${nodeTarballName}`);
  const expected = line.trim().split(/\s+/)[0];

  if (!existsSync(nodeTarballPath)) {
    console.log(`Downloading ${nodeTarballUrl}`);
    const response = await fetch(nodeTarballUrl);
    if (!response.ok || !response.body) {
      throw new Error(`下载官方 Node.js 失败：${response.status} ${nodeTarballUrl}`);
    }
    await pipeline(response.body, createWriteStream(nodeTarballPath));
  }

  const hash = createHash("sha256");
  await pipeline(createReadStream(nodeTarballPath), hash);
  const actual = hash.digest("hex");
  if (actual !== expected) {
    await rm(nodeTarballPath, { force: true });
    throw new Error(`Node.js SHA-256 校验失败：expected ${expected}, got ${actual}`);
  }

  if (!existsSync(officialNode) || !existsSync(officialLicense)) {
    await rm(nodeExtractRoot, { recursive: true, force: true });
    await run("tar", ["-xzf", nodeTarballPath, "-C", cacheRoot]);
  }
  if (!existsSync(officialNode)) throw new Error(`解压后找不到官方 Node.js：${officialNode}`);
}

function assertIntelBinary(file) {
  const result = spawnSync("file", [file], { encoding: "utf8" });
  if (result.status !== 0 || !/x86_64/.test(result.stdout)) {
    throw new Error(`内置 Node 不是 x86_64：${result.stdout.trim()}`);
  }
}

async function pruneIntelRuntime() {
  const nodePtyRoot = join(runtimeRoot, "node_modules", "node-pty");
  if (existsSync(nodePtyRoot)) {
    await rm(join(nodePtyRoot, "deps"), { recursive: true, force: true });
    await rm(join(nodePtyRoot, "third_party"), { recursive: true, force: true });
    await rm(join(nodePtyRoot, "src"), { recursive: true, force: true });
    await rm(join(nodePtyRoot, "scripts"), { recursive: true, force: true });
    await rm(join(nodePtyRoot, "binding.gyp"), { force: true });

    const prebuildsRoot = join(nodePtyRoot, "prebuilds");
    if (existsSync(prebuildsRoot)) {
      for (const entry of await readdir(prebuildsRoot, { withFileTypes: true })) {
        if (entry.name !== "darwin-x64") {
          await rm(join(prebuildsRoot, entry.name), { recursive: true, force: true });
        }
      }
      const helper = join(prebuildsRoot, "darwin-x64");
      if (!existsSync(join(helper, "pty.node"))) {
        throw new Error("npm 未提供 node-pty 的 darwin-x64 预编译，Intel 运行时不完整。");
      }
      await chmod(join(helper, "pty.node"), 0o755);
      if (existsSync(join(helper, "spawn-helper"))) {
        await chmod(join(helper, "spawn-helper"), 0o755);
      }
    }
  }

  const imgRoot = join(runtimeRoot, "node_modules", "@img");
  if (existsSync(imgRoot)) {
    for (const entry of await readdir(imgRoot, { withFileTypes: true })) {
      if (
        entry.name.startsWith("sharp-")
        && entry.name !== "sharp-darwin-x64"
        && entry.name !== "sharp-libvips-darwin-x64"
      ) {
        await rm(join(imgRoot, entry.name), { recursive: true, force: true });
      }
    }
  }

  const koffiVendor = join(runtimeRoot, "node_modules", "@koromix");
  if (existsSync(koffiVendor)) {
    for (const entry of await readdir(koffiVendor, { withFileTypes: true })) {
      if (entry.name.startsWith("koffi-") && entry.name !== "koffi-darwin-x64") {
        await rm(join(koffiVendor, entry.name), { recursive: true, force: true });
      }
    }
  }

  const vscodeRoot = join(runtimeRoot, "node_modules", "@vscode");
  if (existsSync(vscodeRoot)) {
    for (const entry of await readdir(vscodeRoot, { withFileTypes: true })) {
      if (entry.name.startsWith("ripgrep-") && entry.name !== "ripgrep-darwin-x64") {
        await rm(join(vscodeRoot, entry.name), { recursive: true, force: true });
      }
    }
  }

  // This optional accelerator currently ships with LC_BUILD_VERSION minos
  // 15.0. Cordis catches its absence and falls back to standard module loading,
  // so exclude every platform binary to keep the Intel app compatible with
  // the supported minimum, macOS 12.7.6.
  await keepMatchingPackages(join(runtimeRoot, "node_modules"), (name) =>
    !name.startsWith("node-addon-require-builtin-darwin-"));

  await rm(join(runtimeRoot, "node_modules", ".package-lock.json"), { force: true });
  await pruneNonRuntimeFiles(join(runtimeRoot, "node_modules"));
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
      // Keep docs and README files because some packages put license terms
      // there; remove only unambiguous test fixtures and development output.
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

function assertIntelNatives() {
  const required = [
    join(runtimeRoot, "node_modules", "@img", "sharp-darwin-x64"),
    join(runtimeRoot, "node_modules", "@img", "sharp-libvips-darwin-x64"),
    join(runtimeRoot, "node_modules", "@koromix", "koffi-darwin-x64"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Intel 运行时缺少原生模块：\n${missing.join("\n")}`);
  }
}

async function installRuntimeLegalFiles() {
  const legalRoot = join(runtimeRoot, "legal");
  await mkdir(legalRoot, { recursive: true });
  if (!existsSync(officialLicense)) {
    throw new Error(`找不到官方 Node.js 许可证：${officialLicense}`);
  }
  await cp(officialLicense, join(legalRoot, "NODEJS_LICENSE"));

  const packages = [];
  await collectPackageMetadata(join(runtimeRoot, "node_modules"), packages);
  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const dsh = packages.find((item) => item.name === "@deepseek-ai/dsh");

  const lines = [
    "# Bundled Runtime Package Inventory",
    "",
    "Generated from the Intel (x64) production dependency closure embedded in this build.",
    "",
    `Bundled Node.js: ${spawnSync(join(runtimeRoot, "node"), ["--version"], { encoding: "utf8" }).stdout.trim()} (darwin-x64)`,
    `Bundled DeepSeek Harness: ${dsh?.version ?? dshVersion}`,
    "",
    "| Package | Version | Declared license |",
    "| --- | --- | --- |",
    ...packages.map(({ name, version, license }) =>
      `| \`${name.replaceAll("|", "\\|")}\` | \`${version}\` | ${license.replaceAll("|", "\\|")} |`),
    "",
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
    const declaredLicense = typeof manifest.license === "string"
      ? manifest.license
      : Array.isArray(manifest.licenses)
        ? manifest.licenses.map((item) => item.type ?? String(item)).join(" OR ")
        : "NOT DECLARED — inspect package files";
    packages.push({
      name: manifest.name ?? entry.name,
      version: manifest.version ?? "unknown",
      license: declaredLicense,
    });
    await collectPackageMetadata(join(path, "node_modules"), packages);
  }
}

function signBinary(file) {
  const result = spawnSync("codesign", ["--force", "--sign", "-", "--timestamp=none", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`codesign 失败：${file}`);
  }
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} 退出，状态码：${code}`));
    });
  });
}
