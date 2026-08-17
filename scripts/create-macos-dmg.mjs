import { existsSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readdir, readlink, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [appArg, outputArg] = process.argv.slice(2);
if (!appArg || !outputArg) {
  throw new Error("Usage: node scripts/create-macos-dmg.mjs <App.app> <output.dmg>");
}

const app = resolve(appArg);
const output = resolve(outputArg);
if (!existsSync(app) || !app.endsWith(".app")) throw new Error(`Missing App bundle: ${app}`);

const appKiB = directorySizeKiB(app);
// HFS+ metadata plus Finder copy headroom. v0.1.4 shipped with roughly 34 MiB
// free; keep a deterministic 36 MiB margin instead of hdiutil -srcfolder's
// conservative ~100 MiB auto-allocation.
const imageMiB = Math.ceil(appKiB / 1024) + 36;
const work = await mkdtemp(join(tmpdir(), "dsh-dmg-"));
const rw = join(work, "image-rw.dmg");
const mount = join(work, "mount");
await mkdir(mount);
await mkdir(dirname(output), { recursive: true });
await rm(output, { force: true });

let device;
try {
  run("hdiutil", ["create", "-quiet", "-size", `${imageMiB}m`, "-fs", "HFS+", "-volname", "DeepSeek Harness", rw]);
  const attached = run("hdiutil", ["attach", "-nobrowse", "-noautoopen", "-readwrite", "-mountpoint", mount, rw], true);
  device = attached.split(/\r?\n/).find(line => line.startsWith("/dev/"))?.split(/\s+/)[0];
  if (!device) throw new Error(`Cannot identify mounted DMG device:\n${attached}`);
  // ditto preserves bundle metadata and resource forks more reliably than a
  // recursive cp when the source contains signed or extended-attribute files.
  run("ditto", [app, join(mount, basename(app))]);
  await symlink("/Applications", join(mount, "Applications"));
  run("sync", []);
  run("hdiutil", ["detach", device]);
  device = undefined;
  run("hdiutil", ["convert", "-quiet", rw, "-format", "UDZO", "-imagekey", "zlib-level=9", "-o", output]);
} finally {
  if (device) spawnSync("hdiutil", ["detach", device, "-force"], { stdio: "ignore" });
  await rm(work, { recursive: true, force: true });
}

const info = run("hdiutil", ["imageinfo", output], true);
const ratio = info.match(/Compressed Ratio:\s*([^\n]+)/)?.[1]?.trim() ?? "unknown";
console.log(`Created ${output}`);
console.log(`  App allocation: ${(appKiB / 1024).toFixed(1)} MiB`);
console.log(`  Image capacity: ${imageMiB} MiB (36 MiB headroom)`);
console.log(`  Compressed ratio: ${ratio}`);

function directorySizeKiB(path) {
  const result = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`du failed for ${path}: ${result.stderr}`);
  const value = Number.parseInt(result.stdout, 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid App size: ${result.stdout}`);
  return value;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  return result.stdout ?? "";
}
