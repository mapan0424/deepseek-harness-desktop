import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { verifyRuntimeCompatibility } from "./patch-runtime-compat.mjs";

const runtimeRoot = resolve("src-tauri/resources/dsh-runtime");
await verifyRuntimeCompatibility(runtimeRoot);

// dsh 0.1.2 bundles the Markdown parser into the prebuilt frontend instead of
// shipping its source packages at runtime. Exercise the patched email matcher
// and its boundary guard directly so the macOS 12 compatibility behavior stays
// covered without adding duplicate parser dependencies to the App bundle.
const cases = [
  ["test@example.com", ["test@example.com"]],
  ["(test@example.com)", ["test@example.com"]],
  ["你好：test@example.com", ["test@example.com"]],
  ["a/test@example.com", []],
  ["foo@test", []],
  ["foo@example.com_", []],
];

for (const [text, expected] of cases) {
  assert.deepEqual(findEmailAutolinks(text), expected, text);
}

const frontendAssets = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
assert.ok(pathToFileURL(frontendAssets));
for (const name of await readdir(frontendAssets)) {
  if (!name.endsWith(".js")) continue;
  const path = join(frontendAssets, name);
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(result.status, 0, `frontend asset has invalid JavaScript: ${path}\n${result.stderr}`);
}
console.log(`Runtime compatibility behavior verified: ${cases.length} Markdown cases.`);

function findEmailAutolinks(value) {
  const matches = [];
  const expression = /([-\.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu;
  for (const match of value.matchAll(expression)) {
    const previous = match.index === 0 ? "" : value[match.index - 1];
    if (previous === "/") continue;
    if (previous && !/[\s\p{P}\p{S}]/u.test(previous)) continue;
    if (/[-\d_]$/.test(match[2])) continue;
    matches.push(match[0]);
  }
  return matches;
}
