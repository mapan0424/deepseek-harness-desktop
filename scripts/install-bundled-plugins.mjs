import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedInsightsToolIcons } from "./embed-insights-tool-icons.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const insightsSource = join(projectRoot, "packages", "harness-insights");

export async function installBundledPlugins(runtimeRoot) {
  await embedInsightsToolIcons();
  const destination = join(runtimeRoot, "node_modules", "@harness-desktop", "insights");
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(insightsSource, destination, {
    recursive: true,
    filter: (source) => !source.includes(`${join("harness-insights", "tests")}`)
      && !source.includes(`${join("harness-insights", "assets")}`),
  });
  await verifyBundledPlugins(runtimeRoot);
  console.log(`Installed bundled plugin @harness-desktop/insights: ${destination}`);
}

export async function verifyBundledPlugins(runtimeRoot) {
  const root = join(runtimeRoot, "node_modules", "@harness-desktop", "insights");
  const required = [
    join(root, "package.json"),
    join(root, "lib", "index.js"),
    join(root, "lib", "client.js"),
    join(root, "cordis.patch.yml"),
    join(root, "LICENSE"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`Bundled Insights plugin is incomplete:\n${missing.join("\n")}`);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (manifest.name !== "@harness-desktop/insights" || manifest.version !== "0.1.0") {
    throw new Error(`Unexpected bundled Insights identity: ${manifest.name}@${manifest.version}`);
  }
  const client = await readFile(join(root, "lib", "client.js"), "utf8");
  if (!client.includes("window.__ModuleLoader__.load({") || !client.includes("id: '@harness-desktop/insights'")) {
    throw new Error("Bundled Insights client is not a dsh.client module bundle.");
  }
}
