import { chmod, cp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { arch } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = join(projectRoot, "src-tauri", "resources", "dsh-runtime");
const runtimeArchive = join(projectRoot, "src-tauri", "resources", "dsh-runtime.tar.gz");
const dshVersion = "0.1.0-rc.6";

const nodeCandidates = [
  process.execPath,
  "/opt/homebrew/opt/node@22/bin/node",
  "/opt/homebrew/opt/node/bin/node",
  "/usr/local/bin/node",
  "/usr/bin/node",
];
const nodePath = nodeCandidates.find((candidate) => existsSync(candidate));

if (!nodePath) {
  throw new Error("找不到 Node.js，无法准备内置 dsh 运行时。");
}

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });
await cp(nodePath, join(runtimeRoot, "node"), { dereference: true });
await copyNodeLibraries(nodePath);
await writeFile(
  join(runtimeRoot, "package.json"),
  JSON.stringify(
    {
      name: "deepseek-harness-dsh-runtime",
      private: true,
      dependencies: { "@deepseek-ai/dsh": dshVersion },
    },
    null,
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
]);

await pruneRuntime();
await installRuntimeLegalFiles(nodePath);

await rm(runtimeArchive, { force: true });
await run("tar", [
  "-czf",
  runtimeArchive,
  "-C",
  join(projectRoot, "src-tauri", "resources"),
  "dsh-runtime",
]);

console.log(`Prepared dsh ${dshVersion} runtime for ${arch}: ${runtimeRoot}`);

async function pruneRuntime() {
  // npm's node-pty package ships every desktop platform plus source/build
  // files. The current artifact is macOS-only, so keep only this build's
  // native helper and JavaScript runtime.
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
        if (entry.name !== `darwin-${arch}`) {
          await rm(join(prebuildsRoot, entry.name), { recursive: true, force: true });
        }
      }

      await chmod(join(prebuildsRoot, `darwin-${arch}`, "pty.node"), 0o755);
      await chmod(join(prebuildsRoot, `darwin-${arch}`, "spawn-helper"), 0o755);
    }
  }

  // sharp includes a WASM fallback for environments that cannot use a native
  // binary. This artifact ships the native Apple Silicon build only.
  if (arch === "arm64") {
    await rm(join(runtimeRoot, "node_modules", "@img", "sharp-wasm32"), {
      recursive: true,
      force: true,
    });
  }

  // These are useful for npm development but are not read when dsh runs.
  await rm(join(runtimeRoot, "node_modules", ".package-lock.json"), { force: true });
}

async function installRuntimeLegalFiles(sourceNode) {
  const legalRoot = join(runtimeRoot, "legal");
  await mkdir(legalRoot, { recursive: true });

  // Homebrew installs Node's complete license file at the version prefix root.
  // Resolve symlinks so the notice copied into the distributed runtime always
  // belongs to the exact Node executable bundled above.
  const resolvedNode = await realpath(sourceNode);
  const nodeLicense = resolve(dirname(resolvedNode), "../LICENSE");
  if (!existsSync(nodeLicense)) {
    throw new Error(`找不到内置 Node.js 的许可证文件：${nodeLicense}`);
  }
  await cp(nodeLicense, join(legalRoot, "NODEJS_LICENSE"));

  const packages = [];
  await collectPackageMetadata(join(runtimeRoot, "node_modules"), packages);
  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const dsh = packages.find((item) => item.name === "@deepseek-ai/dsh");
  const lines = [
    "# Bundled Runtime Package Inventory",
    "",
    "Generated from the exact production dependency closure embedded in this build.",
    "Each package remains subject to its own license. License and notice files supplied",
    "by packages are retained next to package code under `node_modules/`.",
    "",
    `Bundled Node.js: ${spawnSync(join(runtimeRoot, "node"), ["--version"], { encoding: "utf8" }).stdout.trim()}`,
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
  }
}

async function copyNodeLibraries(sourceNode) {
  const libraryDirectory = join(runtimeRoot, "lib");
  await mkdir(libraryDirectory, { recursive: true });

  const nodeDependencies = otoolDependencies(sourceNode);
  const nodeRpathLibrary = nodeDependencies.find((dependency) => dependency.startsWith("@rpath/"));
  const nodeLibraryName = nodeRpathLibrary ? basename(nodeRpathLibrary) : null;
  const nodeLibrarySource = nodeLibraryName
    ? resolve(dirname(sourceNode), "../lib", nodeLibraryName)
    : null;
  const queue = nodeLibrarySource && existsSync(nodeLibrarySource) ? [nodeLibrarySource] : [];
  const copied = new Set();

  while (queue.length > 0) {
    const source = queue.shift();
    if (!source || copied.has(source) || !existsSync(source)) continue;
    copied.add(source);

    const target = join(libraryDirectory, basename(source));
    await cp(source, target, { dereference: true });
    for (const dependency of otoolDependencies(source)) {
      const resolvedDependency = resolveDependency(source, dependency);
      if (resolvedDependency) queue.push(resolvedDependency);
    }
  }

  patchLoadPaths(join(runtimeRoot, "node"), true);
  signBinary(join(runtimeRoot, "node"));
  for (const library of copied) {
    const bundledLibrary = join(libraryDirectory, basename(library));
    patchLoadPaths(bundledLibrary, false);
    signBinary(bundledLibrary);
  }
}

function resolveDependency(source, dependency) {
  if (dependency.startsWith("/opt/homebrew/") || dependency.startsWith("/usr/local/")) {
    return dependency;
  }
  if (dependency.startsWith("@rpath/") || dependency.startsWith("@loader_path/")) {
    const candidate = resolve(dirname(source), basename(dependency));
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

function otoolDependencies(file) {
  const result = spawnSync("otool", ["-L", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`无法读取动态库依赖：${file}`);
  return result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

function patchLoadPaths(file, isNodeBinary) {
  const dependencies = otoolDependencies(file);
  for (const dependency of dependencies) {
    const dependencyName = basename(dependency);
    if (dependency.startsWith("/opt/homebrew/") || dependency.startsWith("/usr/local/")) {
      const replacement = isNodeBinary
        ? `@loader_path/lib/${dependencyName}`
        : `@loader_path/${dependencyName}`;
      runSync("install_name_tool", ["-change", dependency, replacement, file]);
    } else if (!isNodeBinary && dependency.startsWith("@rpath/")) {
      runSync("install_name_tool", ["-change", dependency, `@loader_path/${dependencyName}`, file]);
    } else if (isNodeBinary && dependency.startsWith("@rpath/")) {
      runSync("install_name_tool", ["-change", dependency, `@loader_path/lib/${dependencyName}`, file]);
    }
  }
}

function runSync(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} 执行失败`);
}

function signBinary(file) {
  runSync("codesign", ["--force", "--sign", "-", "--timestamp=none", file]);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, npm_config_arch: arch },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} 退出，状态码：${code}`));
    });
  });
}
