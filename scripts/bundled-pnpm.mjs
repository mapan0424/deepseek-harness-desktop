import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
