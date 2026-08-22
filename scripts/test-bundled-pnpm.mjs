import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  bundledPnpmBinRoot,
  bundledPnpmVersion,
  verifyBundledPnpm,
} from "./bundled-pnpm.mjs";

const runtimeRoot = fileURLToPath(new URL("../src-tauri/resources/dsh-runtime/", import.meta.url));
const nodeExecutable = join(runtimeRoot, process.platform === "win32" ? "node.exe" : "node");

assert.equal(typeof bundledPnpmVersion, "string");
if (!existsSync(nodeExecutable)) {
  console.log("Bundled runtime is not prepared; skipping pnpm runtime verification.");
} else {
  await verifyBundledPnpm(runtimeRoot);
  const temporaryHome = await mkdtemp(join(tmpdir(), "dsh-bundled-pnpm-"));
  try {
    const dshEntry = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    const environment = {
      ...process.env,
      DSH_HOME: temporaryHome,
      PATH: [bundledPnpmBinRoot(runtimeRoot), runtimeRoot, "/usr/bin", "/bin"].join(delimiter),
    };
    const runDshPlugin = (args) => spawnSync(
      nodeExecutable,
      ["--expose-internals", dshEntry, "plugin", "--profile", "web", ...args],
      { env: environment, encoding: "utf8" },
    );

    const version = runDshPlugin(["--version"]);
    assert.equal(version.status, 0, version.stderr || version.stdout);
    assert.equal(version.stdout.trim(), bundledPnpmVersion);

    const fixtureRoot = join(temporaryHome, "fixture-plugin");
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(join(fixtureRoot, "cordis.patch.yml"), "[]\n");
    await writeFile(join(fixtureRoot, "index.js"), "export function apply() {}\n");
    await writeFile(join(fixtureRoot, "package.json"), JSON.stringify({
      name: "@harness-desktop/bundled-pnpm-fixture",
      version: "1.0.0",
      type: "module",
      main: "./index.js",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }, null, 2));

    const add = runDshPlugin(["add", "--offline", "--ignore-scripts", fixtureRoot]);
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const profilePath = join(temporaryHome, "profiles", "web", "package.json");
    const installed = JSON.parse(await readFile(profilePath, "utf8"));
    assert.equal(typeof installed.dependencies?.["@harness-desktop/bundled-pnpm-fixture"], "string");
    assert.equal(installed.dsh.profile.bundles.includes("@harness-desktop/bundled-pnpm-fixture"), true);

    const remove = runDshPlugin(["remove", "@harness-desktop/bundled-pnpm-fixture"]);
    assert.equal(remove.status, 0, remove.stderr || remove.stdout);
    const uninstalled = JSON.parse(await readFile(profilePath, "utf8"));
    assert.equal(uninstalled.dependencies?.["@harness-desktop/bundled-pnpm-fixture"], undefined);
    assert.equal(uninstalled.dsh.profile.bundles.includes("@harness-desktop/bundled-pnpm-fixture"), false);
  } finally {
    await rm(temporaryHome, { recursive: true, force: true });
  }
  console.log(`Bundled pnpm ${bundledPnpmVersion} verified.`);
}
