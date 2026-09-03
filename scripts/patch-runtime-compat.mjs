import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const expectedFrontendVersion = "0.1.2-alpha.5";

// 0.1.2-alpha.x ships the GFM email autolink as a regex literal (not `new RegExp("...")`).
// macOS 12.7.6 WebKit rejects the lookbehind + Unicode property escapes, so drop the
// lookbehind and keep the same capture groups. test-runtime-compat.mjs still enforces
// the boundary rules in JS.
const bundleOld = "/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu";
const bundleNew = "/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu";

export async function patchRuntimeCompatibility(runtimeRoot) {
  const modules = join(runtimeRoot, "node_modules");
  const frontendRoot = join(modules, "@deepseek-ai", "dsh-web-frontend");

  await assertPackageVersion(frontendRoot, "@deepseek-ai/dsh-web-frontend", expectedFrontendVersion);

  const assetsRoot = join(frontendRoot, "dist", "assets");
  const assetNames = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js")).sort();
  const matches = [];
  let compatibleCount = 0;
  for (const name of assetNames) {
    const path = join(assetsRoot, name);
    const content = await readFile(path, "utf8");
    const oldCount = count(content, bundleOld);
    const newCount = count(content, bundleNew);
    if (oldCount) matches.push({ path, oldCount });
    compatibleCount += newCount;
  }

  if (matches.length !== 1 || matches[0].oldCount !== 1 || compatibleCount !== 0) {
    throw new Error(
      `Runtime compatibility patch no longer matches the prebuilt frontend: expected one legacy email autolink and no patched copies, got ${JSON.stringify({ matches, compatibleCount })}. Review the upstream frontend before packaging.`,
    );
  }
  await patchExactFile(matches[0].path, bundleOld, bundleNew, "prebuilt GFM email autolink");
  await verifyRuntimeCompatibility(runtimeRoot);
  console.log(`Patched macOS 12.7.6 GFM email autolink compatibility: ${matches[0].path}`);
}

export async function verifyRuntimeCompatibility(runtimeRoot) {
  const modules = join(runtimeRoot, "node_modules");
  const assetsRoot = join(modules, "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
  if (!existsSync(assetsRoot)) throw new Error(`Missing frontend assets: ${assetsRoot}`);
  let oldCount = 0;
  let newCount = 0;
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(assetsRoot, name), "utf8");
    oldCount += count(content, bundleOld);
    newCount += count(content, bundleNew);
  }
  if (oldCount !== 0 || newCount !== 1) {
    throw new Error(`Invalid prebuilt frontend compatibility state: legacy=${oldCount}, compatible=${newCount}`);
  }
}

async function assertPackageVersion(root, name, expected) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (manifest.name !== name || manifest.version !== expected) {
    throw new Error(`Expected ${name}@${expected}, got ${manifest.name}@${manifest.version}. Review the compatibility patch before packaging.`);
  }
}

async function patchExactFile(path, oldText, newText, label) {
  const content = await readFile(path, "utf8");
  assertCounts(path, content, oldText, newText, 1, 0);
  const patched = content.replace(oldText, newText);
  assertCounts(path, patched, oldText, newText, 0, 1);
  await writeFile(path, patched);
  console.log(`Patched ${label}: ${path}`);
}

function assertCounts(path, content, oldText, newText, expectedOld, expectedNew) {
  const oldCount = count(content, oldText);
  const newCount = count(content, newText);
  if (oldCount !== expectedOld || newCount !== expectedNew) {
    throw new Error(`${path}: expected legacy=${expectedOld}, compatible=${expectedNew}; got legacy=${oldCount}, compatible=${newCount}`);
  }
}

function count(content, needle) {
  return content.split(needle).length - 1;
}
