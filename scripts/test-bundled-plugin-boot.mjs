import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { bundledPluginDefinitionsList } from "./install-bundled-plugins.mjs";

const runtimeRoot = resolve("src-tauri/resources/dsh-runtime");
const runtimeModules = join(runtimeRoot, "node_modules");
const isWindows = process.platform === "win32";
const activePlugins = bundledPluginDefinitionsList.filter((plugin) => !plugin.macOnly || !isWindows);
const home = await mkdtemp(join(tmpdir(), "dsh-bundled-plugin-boot-"));
const port = await reservePort();

try {
  const profileModules = join(home, "profiles", "node_modules", "@anarkhgatsby");
  await cp(join(runtimeModules, "@anarkhgatsby"), profileModules, { recursive: true });

  const executable = isWindows ? join(runtimeRoot, "node.exe") : join(runtimeRoot, "node");
  const dshBin = join(runtimeModules, "@deepseek-ai", "dsh", "lib", "bin.js");
  const args = ["--expose-internals", dshBin, "web"];
  for (const plugin of activePlugins) {
    if (plugin.patch) args.push("--patch", join(runtimeModules, ...plugin.packageName.split("/"), "cordis.patch.yml"));
  }
  args.push("--no-open", "--port", String(port));

  const child = spawn(executable, args, {
    env: { ...process.env, DSH_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });

  try {
    await waitForHttp(port, child, () => log);
    assert.doesNotMatch(log, /duplicate loader entry id|plugin tree failed to load/i, log);
  } finally {
    if (!child.killed) child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }

  console.log(`Bundled DSH booted with ${activePlugins.length} plugin overlays in an isolated profile.`);
} finally {
  await rm(home, { recursive: true, force: true });
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") {
        listener.close(() => reject(new Error("Could not reserve a TCP port for the DSH boot test.")));
        return;
      }
      listener.close(() => resolvePort(address.port));
    });
  });
}

function waitForHttp(port, child, log) {
  const deadline = Date.now() + 30_000;
  return new Promise((resolveReady, reject) => {
    const tick = () => {
      if (child.exitCode !== null) {
        reject(new Error(`Bundled DSH exited before becoming ready:\n${log()}`));
        return;
      }
      const req = request({ host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1_000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolveReady();
        retry();
      });
      req.once("error", retry);
      req.once("timeout", () => req.destroy());
      req.end();
    };
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for bundled DSH:\n${log()}`));
      setTimeout(tick, 250);
    };
    tick();
  });
}
