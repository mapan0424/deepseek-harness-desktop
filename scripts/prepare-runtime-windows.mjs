import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const nodeVersion = process.env.WINDOWS_NODE_VERSION || "22.23.2";
const nodeArchiveName = `node-v${nodeVersion}-win-x64.zip`;
const nodeBaseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
const nodeArchivePath = join(cacheRoot, nodeArchiveName);
const nodeExtractRoot = join(cacheRoot, `node-v${nodeVersion}-win-x64`);
const officialNode = join(nodeExtractRoot, "node.exe");
const officialLicense = join(nodeExtractRoot, "LICENSE");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("Windows runtime must be prepared on a native Windows x64 runner.");
}

await mkdir(cacheRoot, { recursive: true });
await downloadAndVerifyOfficialNode();
assertPeX64(officialNode);

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });
await cp(officialNode, join(runtimeRoot, "node.exe"));
await chmod(join(runtimeRoot, "node.exe"), 0o755);

await writeFile(
  join(runtimeRoot, "package.json"),
  JSON.stringify({
    name: "deepseek-harness-dsh-runtime",
    private: true,
    dependencies: { "@deepseek-ai/dsh": dshVersion, pnpm: bundledPnpmVersion },
  }, null, 2) + "\n",
);

await run(npmCommand, [
  "install", "--prefix", runtimeRoot, "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
  "--os=win32", "--cpu=x64", "--include=optional",
]);

// Request the architecture-specific packages explicitly. This guards against
// npm optional-dependency resolution changes on hosted runners.
await run(npmCommand, [
  "install", "--prefix", runtimeRoot, "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
  "--os=win32", "--cpu=x64", "--include=optional", "--force",
  "@img/sharp-win32-x64@0.35.3", "@koromix/koffi-win32-x64@3.1.5", "@vscode/ripgrep-win32-x64@1.18.0",
]);

await patchRuntimeCompatibility(runtimeRoot);
await installBundledPlugins(runtimeRoot);
await pruneWindowsRuntime();
await pruneBundledPnpmNativeModules(runtimeRoot, "win32-x64");
await materializeBundledPnpmLauncher(runtimeRoot);
await verifyBundledPnpm(runtimeRoot, join(runtimeRoot, "node.exe"));
assertWindowsRuntime();
await installRuntimeLegalFiles();
console.log(`Prepared self-contained dsh ${dshVersion} Windows x64 runtime with official Node ${nodeVersion}: ${runtimeRoot}`);

async function downloadAndVerifyOfficialNode() {
  const checksumsResponse = await fetch(`${nodeBaseUrl}/SHASUMS256.txt`);
  if (!checksumsResponse.ok) throw new Error(`Failed to download Node.js checksums: ${checksumsResponse.status}`);
  const checksums = await checksumsResponse.text();
  const line = checksums.split("\n").find((item) => item.trim().endsWith(`  ${nodeArchiveName}`));
  if (!line) throw new Error(`Cannot find ${nodeArchiveName} in SHASUMS256.txt`);
  const expected = line.trim().split(/\s+/)[0];

  if (!existsSync(nodeArchivePath)) {
    const response = await fetch(`${nodeBaseUrl}/${nodeArchiveName}`);
    if (!response.ok || !response.body) throw new Error(`Failed to download official Node.js: ${response.status}`);
    await pipeline(response.body, createWriteStream(nodeArchivePath));
  }
  const actual = await sha256(nodeArchivePath);
  if (actual !== expected) {
    await rm(nodeArchivePath, { force: true });
    throw new Error(`Node.js SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }

  if (!existsSync(officialNode) || !existsSync(officialLicense)) {
    await rm(nodeExtractRoot, { recursive: true, force: true });
    const powershell = process.env.SystemRoot ? join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
    await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${escapePowerShell(nodeArchivePath)}' -DestinationPath '${escapePowerShell(cacheRoot)}' -Force`]);
  }
  if (!existsSync(officialNode)) throw new Error(`Official Node.js was not extracted: ${officialNode}`);
}

async function pruneWindowsRuntime() {
  const nodePtyRoot = join(runtimeRoot, "node_modules", "node-pty");
  for (const name of ["deps", "third_party", "src", "scripts", "binding.gyp"]) {
    await rm(join(nodePtyRoot, name), { recursive: true, force: true });
  }
  await keepOnlyDirectory(join(nodePtyRoot, "prebuilds"), "win32-x64");
  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@img"), (name) =>
    !name.startsWith("sharp-") || name === "sharp-win32-x64");
  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@koromix"), (name) =>
    !name.startsWith("koffi-") || name === "koffi-win32-x64");
  await keepMatchingPackages(join(runtimeRoot, "node_modules", "@vscode"), (name) =>
    !name.startsWith("ripgrep-") || name === "ripgrep-win32-x64");
  // Cordis uses Node --expose-internals, so the optional native loader is not
  // needed and no architecture-specific native cache is created.
  await keepMatchingPackages(join(runtimeRoot, "node_modules"), (name) =>
    !name.startsWith("node-addon-require-builtin-"));
  await rm(join(runtimeRoot, "node_modules", ".package-lock.json"), { force: true });
  await pruneNonRuntimeFiles(join(runtimeRoot, "node_modules"));
}

function assertWindowsRuntime() {
  const required = [
    join(runtimeRoot, "node.exe"),
    join(runtimeRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.node"),
    join(runtimeRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty_console_list.node"),
    join(runtimeRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty", "OpenConsole.exe"),
    join(runtimeRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty", "conpty.dll"),
    join(runtimeRoot, "node_modules", "@img", "sharp-win32-x64"),
    join(runtimeRoot, "node_modules", "@koromix", "koffi-win32-x64"),
    join(runtimeRoot, "node_modules", "@vscode", "ripgrep-win32-x64"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`Windows runtime is missing required native components:\n${missing.join("\n")}`);
  for (const path of required.filter((path) => /\.(exe|node)$/i.test(path))) assertPeX64(path);
}

async function installRuntimeLegalFiles() {
  const legalRoot = join(runtimeRoot, "legal");
  await mkdir(legalRoot, { recursive: true });
  await cp(officialLicense, join(legalRoot, "NODEJS_LICENSE"));
  const packages = [];
  await collectPackageMetadata(join(runtimeRoot, "node_modules"), packages);
  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const dsh = packages.find((item) => item.name === "@deepseek-ai/dsh");
  const version = spawnSync(join(runtimeRoot, "node.exe"), ["--version"], { encoding: "utf8" }).stdout.trim();
  const lines = [
    "# Bundled Runtime Package Inventory", "",
    "Generated from the Windows x64 production dependency closure embedded in this build.",
    "Package-provided license, notice, and README files are retained next to package code.", "",
    `Bundled Node.js: ${version} (win-x64)`, `Bundled DeepSeek Harness: ${dsh?.version ?? dshVersion}`, "",
    "| Package | Version | Declared license |", "| --- | --- | --- |",
    ...packages.map(({ name, version, license }) => `| \`${name.replaceAll("|", "\\|")}\` | \`${version}\` | ${license.replaceAll("|", "\\|")} |`), "",
  ];
  await writeFile(join(legalRoot, "RUNTIME_PACKAGE_INVENTORY.md"), lines.join("\n"));
}

async function collectPackageMetadata(directory, packages) {
  if (!existsSync(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith("@")) { await collectPackageMetadata(path, packages); continue; }
    const manifestPath = join(path, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const license = typeof manifest.license === "string" ? manifest.license : Array.isArray(manifest.licenses)
      ? manifest.licenses.map((item) => item.type ?? String(item)).join(" OR ") : "NOT DECLARED — inspect package files";
    packages.push({ name: manifest.name ?? entry.name, version: manifest.version ?? "unknown", license });
    await collectPackageMetadata(join(path, "node_modules"), packages);
  }
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
    if (entry.isDirectory() && !keep(entry.name)) await rm(join(root, entry.name), { recursive: true, force: true });
  }
}

async function pruneNonRuntimeFiles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["test", "tests", "__tests__", "coverage"].includes(entry.name.toLowerCase())) await rm(path, { recursive: true, force: true });
      else await pruneNonRuntimeFiles(path);
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".map") || lower.endsWith(".d.ts") || lower.endsWith(".d.mts") || lower.endsWith(".d.cts") || lower.endsWith(".tsbuildinfo") || lower.endsWith(".pdb")) await rm(path, { force: true });
    }
  }
}

function assertPeX64(path) {
  const buffer = requireBuffer(path);
  if (buffer.readUInt16LE(0) !== 0x5a4d) throw new Error(`Not a PE file: ${path}`);
  const peOffset = buffer.readUInt32LE(0x3c);
  if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0" || buffer.readUInt16LE(peOffset + 4) !== 0x8664) {
    throw new Error(`PE architecture is not x86_64: ${path}`);
  }
}

function requireBuffer(path) {
  return readFileSync(path);
}

async function sha256(path) { const hash = createHash("sha256"); await pipeline(createReadStream(path), hash); return hash.digest("hex"); }
function escapePowerShell(value) { return value.replaceAll("'", "''"); }
function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const throughShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit", shell: throughShell });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
