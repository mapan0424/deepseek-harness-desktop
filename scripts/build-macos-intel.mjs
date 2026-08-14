import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustTarget = "x86_64-apple-darwin";
const rustupBin = join(homedir(), ".cargo", "bin", "rustup");
const rustupCargo = join(homedir(), ".cargo", "bin", "cargo");

console.log("Building unsigned Intel (x86_64) macOS release...");
await ensureIntelRustTarget();
await run(process.execPath, [join(projectRoot, "scripts", "prepare-runtime-intel.mjs")]);
await run("pnpm", ["prepare:licenses"]);
await run("pnpm", ["tauri", "build", "--target", rustTarget, "--no-sign"], {
  PATH: intelPath(),
  CARGO: existsSync(rustupCargo) ? rustupCargo : process.env.CARGO,
});

console.log("Intel build finished.");
console.log("  App: src-tauri/target/x86_64-apple-darwin/release/bundle/macos/DeepSeek Harness.app");
console.log("  DMG: src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/DeepSeek Harness_<version>_x64.dmg");

function intelPath() {
  const cargoBin = join(homedir(), ".cargo", "bin");
  return existsSync(cargoBin) ? `${cargoBin}:${process.env.PATH || ""}` : process.env.PATH;
}

async function ensureIntelRustTarget() {
  if (hasIntelTarget()) {
    console.log(`Rust target ${rustTarget} is available.`);
    return;
  }

  if (!existsSync(rustupBin) && !commandExists("rustup")) {
    throw new Error(
      [
        "本机 Homebrew rustc 只有 aarch64 标准库，打不出 Intel 包。",
        "请先安装 rustup，并加上 x86_64 目标：",
        "",
        "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
        "  source \"$HOME/.cargo/env\"",
        "  rustup target add x86_64-apple-darwin",
        "",
        "然后再执行 pnpm build:macos:intel。",
        "Apple Silicon 包仍用原来的 pnpm build:macos，互不影响。",
      ].join("\n"),
    );
  }

  console.log(`Adding Rust target ${rustTarget}...`);
  await run(existsSync(rustupBin) ? rustupBin : "rustup", ["target", "add", rustTarget]);
  if (!hasIntelTarget()) {
    throw new Error(`已尝试安装 ${rustTarget}，但当前 cargo 仍看不到该目标。`);
  }
}

function hasIntelTarget() {
  const rustup = existsSync(rustupBin) ? rustupBin : commandExists("rustup") ? "rustup" : null;
  if (rustup) {
    const listed = spawnSync(rustup, ["target", "list", "--installed"], { encoding: "utf8" });
    if (listed.status === 0 && listed.stdout.includes(rustTarget)) return true;
  }

  const sysroot = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" });
  if (sysroot.status === 0) {
    const libDir = join(sysroot.stdout.trim(), "lib", "rustlib", rustTarget);
    if (existsSync(libDir)) return true;
  }
  return false;
}

function commandExists(name) {
  return spawnSync("which", [name], { encoding: "utf8" }).status === 0;
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} 退出，状态码：${code}`));
    });
  });
}
