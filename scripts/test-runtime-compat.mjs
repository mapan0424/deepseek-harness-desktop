import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { fromMarkdown } from "../src-tauri/resources/dsh-runtime/node_modules/mdast-util-from-markdown/index.js";
import { gfm } from "../src-tauri/resources/dsh-runtime/node_modules/micromark-extension-gfm/index.js";
import { gfmFromMarkdown } from "../src-tauri/resources/dsh-runtime/node_modules/mdast-util-gfm/index.js";
import { verifyRuntimeCompatibility } from "./patch-runtime-compat.mjs";

const runtimeRoot = resolve("src-tauri/resources/dsh-runtime");
await verifyRuntimeCompatibility(runtimeRoot);

const cases = [
  ["test@example.com", ["test@example.com"]],
  ["(test@example.com)", ["test@example.com"]],
  ["你好：test@example.com", ["test@example.com"]],
  ["a/test@example.com", []],
  ["foo@test", []],
  ["foo@example.com_", []],
  ["`test@example.com`", []],
  ["[text](https://example.com)", ["https://example.com"]],
];

for (const [markdown, expected] of cases) {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const urls = [];
  visit(tree, (node) => {
    if (node.type === "link") urls.push(node.url);
  });
  const normalized = urls.map((url) => url.startsWith("mailto:") ? url.slice(7) : url);
  assert.deepEqual(normalized, expected, markdown);
}

const frontendAssets = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
assert.ok(pathToFileURL(frontendAssets));
console.log(`Runtime compatibility behavior verified: ${cases.length} Markdown cases.`);

function visit(node, callback) {
  callback(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child, callback);
  }
}
