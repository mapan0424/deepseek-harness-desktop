// Compiles src-tauri/icons/AppIcon.icon into src-tauri/icons/Assets.car.
// macOS 26 reads Assets.car for light/dark/tinted app icons; older macOS
// keeps using icon-whale-macos.icns. Commit the generated Assets.car so
// CI runners without Xcode 26 can still bundle it.
import { mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsRoot = join(projectRoot, "src-tauri", "icons");
const iconBundle = join(iconsRoot, "AppIcon.icon");
const outputCar = join(iconsRoot, "Assets.car");
const iconName = "AppIcon";

if (!existsSync(join(iconBundle, "icon.json"))) {
  throw new Error(`Missing Icon Composer bundle: ${iconBundle}`);
}

const actool = spawnSync("xcrun", ["--find", "actool"], { encoding: "utf8" });
if (actool.status !== 0) {
  throw new Error("xcrun actool is required to compile the macOS appearance-aware app icon.");
}

const work = await mkdtemp(join(tmpdir(), "dsh-appicon-"));
const compileDir = join(work, "compile");
const plistPath = join(work, "assetcatalog_generated_info.plist");
await mkdir(compileDir, { recursive: true });

const args = [
  "actool",
  iconBundle,
  "--compile",
  compileDir,
  "--output-format",
  "human-readable-text",
  "--notices",
  "--warnings",
  "--errors",
  "--output-partial-info-plist",
  plistPath,
  "--app-icon",
  iconName,
  "--include-all-app-icons",
  "--enable-on-demand-resources",
  "NO",
  "--development-region",
  "en",
  "--target-device",
  "mac",
  "--minimum-deployment-target",
  "26.0",
  "--platform",
  "macosx",
];

const compiled = spawnSync("xcrun", args, { encoding: "utf8" });
if (compiled.status !== 0) {
  await rm(work, { recursive: true, force: true });
  throw new Error(
    `actool failed to compile ${iconBundle}:\n${compiled.stdout}\n${compiled.stderr}`,
  );
}

const compiledCar = join(compileDir, "Assets.car");
if (!existsSync(compiledCar)) {
  await rm(work, { recursive: true, force: true });
  throw new Error(`actool did not produce Assets.car.\n${compiled.stdout}\n${compiled.stderr}`);
}

await cp(compiledCar, outputCar);
await rm(work, { recursive: true, force: true });

const info = spawnSync("xcrun", ["assetutil", "--info", outputCar], { encoding: "utf8" });
if (info.status !== 0) {
  throw new Error(`Compiled Assets.car but assetutil --info failed:\n${info.stderr}`);
}

const appearances = new Set();
for (const match of info.stdout.matchAll(/"Appearance"\s*:\s*"([^"]+)"/g)) {
  appearances.add(match[1]);
}
const hasAppIcon = info.stdout.includes(`"Name" : "${iconName}"`) || info.stdout.includes(`"Name": "${iconName}"`);
if (!hasAppIcon) {
  throw new Error(`Compiled Assets.car is missing app icon ${iconName}.`);
}

console.log(`Compiled appearance-aware macOS app icon: ${outputCar}`);
console.log(`Asset appearances: ${[...appearances].sort().join(", ") || "(none reported)"}`);
if (compiled.stdout.trim()) {
  console.log(compiled.stdout.trim());
}
