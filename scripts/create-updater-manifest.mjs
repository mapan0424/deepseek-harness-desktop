import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "mapan0424/deepseek-harness-desktop";

export async function createUpdaterManifest({
  version,
  tag = `v${version}`,
  root,
  output = join(root, "latest.json"),
  notes = "See the GitHub release notes for changes in this version.",
  pubDate = new Date().toISOString(),
}) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  if (!root) throw new Error("An artifact root is required.");

  const files = {
    macArm: `DeepSeek.Harness_${version}_macos_arm64.app.tar.gz`,
    macIntel: `DeepSeek.Harness_${version}_macos_x86_64.app.tar.gz`,
    windowsNsis: `DeepSeek.Harness_${version}_windows_x86_64-setup.exe`,
    windowsMsi: `DeepSeek.Harness_${version}_windows_x86_64.msi`,
  };
  const baseUrl = `https://github.com/${REPOSITORY}/releases/download/${encodeURIComponent(tag)}`;

  const platform = async (file) => ({
    url: `${baseUrl}/${encodeURIComponent(file)}`,
    signature: await readSignature(join(root, `${file}.sig`)),
  });
  const macArm = await platform(files.macArm);
  const macIntel = await platform(files.macIntel);
  const windowsNsis = await platform(files.windowsNsis);
  const windowsMsi = await platform(files.windowsMsi);

  const manifest = {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64-app": macArm,
      "darwin-aarch64": macArm,
      "darwin-x86_64-app": macIntel,
      "darwin-x86_64": macIntel,
      "windows-x86_64-nsis": windowsNsis,
      "windows-x86_64-msi": windowsMsi,
      "windows-x86_64": windowsNsis,
    },
  };

  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function readSignature(path) {
  const signature = (await readFile(path, "utf8")).trim();
  if (!signature || !/^[A-Za-z0-9+/=]+$/.test(signature)) {
    throw new Error(`Invalid updater signature: ${basename(path)}`);
  }
  return signature;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near: ${key ?? "<end>"}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  await createUpdaterManifest({
    version: args.version,
    tag: args.tag,
    root: args.root,
    output: args.output,
    notes: args.notes,
    pubDate: args["pub-date"],
  });
}
