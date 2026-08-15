import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyRuntimeCompatibility } from "./patch-runtime-compat.mjs";

const [bundleArg] = process.argv.slice(2);
if (!bundleArg) throw new Error("Usage: node scripts/verify-windows-bundle.mjs <bundle-directory>");
const bundle = resolve(bundleArg);
const runtime = join(bundle, "resources", "dsh-runtime");
const app = join(bundle, "deepseek-harness-macos.exe");
const node = join(runtime, "node.exe");
for (const path of [bundle, runtime, app, node, join(runtime, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")]) {
  if (!existsSync(path)) throw new Error(`Missing required Windows bundle path: ${path}`);
}
assertPeX64(app);
assertPeX64(node);
await scanNativeFiles(join(runtime, "node_modules"));
await verifyRuntimeCompatibility(runtime);
if (existsSync(join(runtime, "node_modules", "node-addon-require-builtin-win32-x64-msvc"))) {
  throw new Error("Optional native internal-loader package should not be shipped in the Windows bundle.");
}
const size = (await stat(app)).size + await directorySize(runtime);
const max = 500 * 1024 * 1024;
if (size > max) throw new Error(`Expanded Windows app is unexpectedly large: ${(size / 1024 / 1024).toFixed(1)} MB > 500 MB`);
console.log(`Verified Windows x86_64 app: ${(size / 1024 / 1024).toFixed(1)} MB, direct embedded runtime, patched Markdown compatibility.`);

async function scanNativeFiles(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await scanNativeFiles(path);
    else if (entry.isFile() && (entry.name.endsWith(".node") || entry.name.endsWith(".dll") || entry.name.endsWith(".exe"))) assertPeX64(path);
  }
}

function assertPeX64(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) throw new Error(`Not a PE file: ${path}`);
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length || buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") throw new Error(`Invalid PE header: ${path}`);
  if (buffer.readUInt16LE(peOffset + 4) !== 0x8664) throw new Error(`PE architecture is not x86_64: ${path}`);
}

async function directorySize(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size;
  }
  return total;
}
