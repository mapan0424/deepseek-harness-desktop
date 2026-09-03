import { execSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

try {
  const output = execSync("hdiutil info", { encoding: "utf8" });
  for (const line of output.split("\n")) {
    if (line.includes("/Volumes/dmg.") || line.includes("/Volumes/DeepSeek Harness")) {
      const parts = line.trim().split(/\s+/);
      const dev = parts[0];
      if (dev && dev.startsWith("/dev/disk")) {
        console.log("Detaching stuck disk image: " + dev);
        try {
          execSync("hdiutil detach " + dev + " -force", { stdio: "ignore" });
        } catch {}
      }
    }
  }
} catch {}

const bundleDir = join(process.cwd(), "src-tauri/target/release/bundle/macos");
if (existsSync(bundleDir)) {
  for (const f of readdirSync(bundleDir)) {
    if (f.startsWith("rw.") && f.endsWith(".dmg")) {
      try {
        unlinkSync(join(bundleDir, f));
      } catch {}
    }
  }
}
