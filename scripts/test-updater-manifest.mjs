import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdaterManifest } from "./create-updater-manifest.mjs";

const root = await mkdtemp(join(tmpdir(), "dsh-updater-manifest-"));
try {
  const version = "1.2.3";
  const files = [
    `DeepSeek.Harness_${version}_macos_arm64.app.tar.gz`,
    `DeepSeek.Harness_${version}_macos_x86_64.app.tar.gz`,
    `DeepSeek.Harness_${version}_windows_x86_64-setup.exe`,
    `DeepSeek.Harness_${version}_windows_x86_64.msi`,
  ];
  for (const file of files) {
    await writeFile(join(root, `${file}.sig`), "YWJjZA==\n", "utf8");
  }

  const output = join(root, "latest.json");
  const manifest = await createUpdaterManifest({
    version,
    tag: "v1.2.3",
    root,
    output,
    notes: "Release notes",
    pubDate: "2026-08-20T00:00:00.000Z",
  });
  const disk = JSON.parse(await readFile(output, "utf8"));

  assert.deepEqual(disk, manifest);
  assert.equal(manifest.version, version);
  assert.equal(manifest.platforms["darwin-aarch64"].signature, "YWJjZA==");
  assert.equal(
    manifest.platforms["darwin-x86_64-app"].url,
    "https://github.com/mapan0424/deepseek-harness-desktop/releases/download/v1.2.3/DeepSeek.Harness_1.2.3_macos_x86_64.app.tar.gz",
  );
  assert.equal(
    manifest.platforms["windows-x86_64"].url,
    manifest.platforms["windows-x86_64-nsis"].url,
  );
  assert.notEqual(
    manifest.platforms["windows-x86_64-msi"].url,
    manifest.platforms["windows-x86_64-nsis"].url,
  );
  console.log("Updater manifest generation verified.");
} finally {
  await rm(root, { recursive: true, force: true });
}
