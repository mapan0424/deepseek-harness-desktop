import { existsSync, lstatSync } from "node:fs";
import { chmod, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

// Keep this independent of the repository's development pnpm version. The
// production runtime must be able to manage profile plugins on a clean host.
export const bundledPnpmVersion = "11.7.0";

export function bundledPnpmRoot(runtimeRoot) {
  return join(runtimeRoot, "node_modules", "pnpm");
}

export function bundledPnpmBinRoot(runtimeRoot) {
  return join(runtimeRoot, "node_modules", ".bin");
}

export function bundledPnpmEntry(runtimeRoot) {
  return join(bundledPnpmRoot(runtimeRoot), "bin", "pnpm.mjs");
}

// pnpm ships the native reflink bindings for every supported platform inside
// its bundled dist tree. Keep only the binding for the runtime being built so
// architecture verification cannot mistake unused foreign binaries for app
// dependencies (and so the packaged runtime stays small).
export async function pruneBundledPnpmNativeModules(runtimeRoot, target) {
  const platformPackages = join(bundledPnpmRoot(runtimeRoot), "dist", "node_modules", "@reflink");
  if (!existsSync(platformPackages)) return;
  const keep = target === "darwin-arm64"
    ? "reflink-darwin-arm64"
    : target === "darwin-x64"
      ? "reflink-darwin-x64"
      : target === "win32-x64"
        ? "reflink-win32-x64-msvc"
        : null;
  if (!keep) throw new Error(`Unsupported bundled pnpm native target: ${target}`);
  for (const entry of await readdir(platformPackages, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("reflink-") && entry.name !== keep) {
      await rm(join(platformPackages, entry.name), { recursive: true, force: true });
    }
  }
}

// Tauri may dereference resource symlinks while copying the App bundle. The
// generated pnpm launcher then loses its original `../dist` base directory.
// Materialize a wrapper from `.bin` so it remains valid after that copy step.
export async function materializeBundledPnpmLauncher(runtimeRoot) {
  const binRoot = bundledPnpmBinRoot(runtimeRoot);
  const launcher = join(binRoot, "pnpm");
  if (process.platform === "win32") {
    await writeFile(join(binRoot, "pnpm.cmd"), "@ECHO OFF\r\nnode \"%~dp0\\..\\pnpm\\bin\\pnpm.mjs\" %*\r\n");
    return;
  }
  if (lstatSync(launcher).isSymbolicLink()) await unlink(launcher);
  await writeFile(launcher, "#!/usr/bin/env node\nawait import(\"../pnpm/bin/pnpm.mjs\");\n");
  await chmod(launcher, 0o755);
}

export async function verifyBundledPnpm(runtimeRoot) {
  const packageRoot = bundledPnpmRoot(runtimeRoot);
  const manifestPath = join(packageRoot, "package.json");
  const entry = bundledPnpmEntry(runtimeRoot);
  const bundledBin = join(bundledPnpmBinRoot(runtimeRoot), process.platform === "win32" ? "pnpm.cmd" : "pnpm");
  const required = [manifestPath, entry, join(packageRoot, "dist", "pnpm.mjs"), bundledBin];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) {
    throw new Error(`Bundled pnpm is incomplete:\n${missing.join("\n")}`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== "pnpm" || manifest.version !== bundledPnpmVersion) {
    throw new Error(`Unexpected bundled pnpm identity: ${manifest.name}@${manifest.version}`);
  }

  const pathValue = [bundledPnpmBinRoot(runtimeRoot), runtimeRoot, process.env.PATH ?? ""]
    .filter(Boolean)
    .join(delimiter);
  const result = spawnSync(bundledBin, ["--version"], {
    env: { ...process.env, PATH: pathValue },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0 || result.stdout.trim() !== bundledPnpmVersion) {
    throw new Error(
      `Bundled pnpm version check failed: expected ${bundledPnpmVersion}, got ${result.stdout.trim() || result.stderr.trim()}`,
    );
  }
}
