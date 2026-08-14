import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { verifyRuntimeCompatibility } from "./patch-runtime-compat.mjs";

const [appArg, expectedArch] = process.argv.slice(2);
if (!appArg || !["arm64", "x86_64"].includes(expectedArch)) {
  throw new Error("Usage: node scripts/verify-macos-bundle.mjs <App.app> <arm64|x86_64>");
}
const minimumMacOS = "12.7.6";
const maximumDeploymentTarget = [12, 7, 6];
const app = resolve(appArg);
const runtime = join(app, "Contents", "Resources", "resources", "dsh-runtime");
const executable = join(app, "Contents", "MacOS", "deepseek-harness-macos");
const node = join(runtime, "node");
for (const path of [app, runtime, executable, node, join(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js")]) {
  if (!existsSync(path)) throw new Error(`Missing required bundle path: ${path}`);
}
if (existsSync(join(app, "Contents", "Resources", "resources", "dsh-runtime.tar.gz"))) {
  throw new Error("Obsolete dsh-runtime.tar.gz is present; this would recreate the duplicate runtime cache.");
}
assertMinimumSystemVersion();
assertMachO(executable, expectedArch);
assertMachO(node, expectedArch);
await scanNativeFiles(join(runtime, "node_modules"));
await verifyRuntimeCompatibility(runtime);
const size = await directorySize(app);
const max = 340 * 1024 * 1024;
if (size > max) throw new Error(`Expanded App is unexpectedly large: ${(size / 1024 / 1024).toFixed(1)} MB > 340 MB`);
console.log(`Verified ${expectedArch} bundle: ${(size / 1024 / 1024).toFixed(1)} MB, macOS ${minimumMacOS} minimum, direct embedded runtime, no archive/cache copy.`);

function assertMinimumSystemVersion() {
  const plist = join(app, "Contents", "Info.plist");
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :LSMinimumSystemVersion", plist], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() !== minimumMacOS) {
    throw new Error(`LSMinimumSystemVersion must be ${minimumMacOS}, got ${result.stdout.trim() || "missing"}`);
  }
}

function assertMachO(path, arch) {
  const result = spawnSync("file", [path], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.includes(arch)) {
    throw new Error(`Architecture mismatch (${arch} expected): ${result.stdout.trim()}`);
  }
  const target = deploymentTarget(path);
  if (!target) throw new Error(`Cannot read macOS deployment target: ${path}`);
  if (compareVersions(target, maximumDeploymentTarget) > 0) {
    throw new Error(`${path} requires macOS ${target.join(".")}, newer than supported minimum ${minimumMacOS}`);
  }
}

function deploymentTarget(path) {
  const result = spawnSync("otool", ["-l", path], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const build = result.stdout.match(/LC_BUILD_VERSION[\s\S]*?\bminos\s+(\d+(?:\.\d+){1,2})/);
  const legacy = result.stdout.match(/LC_VERSION_MIN_MACOSX[\s\S]*?\bversion\s+(\d+(?:\.\d+){1,2})/);
  const value = build?.[1] ?? legacy?.[1];
  return value ? value.split(".").map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

async function scanNativeFiles(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await scanNativeFiles(path);
    } else if (entry.isFile() && (entry.name.endsWith(".node") || entry.name.endsWith(".dylib") || entry.name === "rg" || entry.name === "spawn-helper")) {
      assertMachO(path, expectedArch);
    }
  }
}

async function directorySize(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size;
  }
  return total;
}
