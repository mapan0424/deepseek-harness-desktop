import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const [appArg, expectedArch] = process.argv.slice(2);
if (!appArg || !["arm64", "x86_64"].includes(expectedArch)) {
  throw new Error("Usage: node scripts/verify-macos-bundle.mjs <App.app> <arm64|x86_64>");
}
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
assertArch(executable, expectedArch);
assertArch(node, expectedArch);
await scanNativeFiles(join(runtime, "node_modules"));
const size = await directorySize(app);
const max = 340 * 1024 * 1024;
if (size > max) throw new Error(`Expanded App is unexpectedly large: ${(size / 1024 / 1024).toFixed(1)} MB > 340 MB`);
console.log(`Verified ${expectedArch} bundle: ${(size / 1024 / 1024).toFixed(1)} MB, direct embedded runtime, no archive/cache copy.`);

function assertArch(path, arch) {
  const result = spawnSync("file", [path], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.includes(arch)) {
    throw new Error(`Architecture mismatch (${arch} expected): ${result.stdout.trim()}`);
  }
}

async function scanNativeFiles(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await scanNativeFiles(path);
    } else if (entry.isFile() && (entry.name.endsWith(".node") || entry.name.endsWith(".dylib") || entry.name === "rg" || entry.name === "spawn-helper")) {
      assertArch(path, expectedArch);
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
