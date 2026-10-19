import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { patchTurnOutlineUnicode } from "./patch-runtime-compat.mjs";

// Released DSH 0.2.1-alpha.5 preview implementation: both slices can split an emoji.
const releasedPreview = `function preview(content, limit) {
  let text = "";
  let unread = false;
  for (const block of content) {
    if (block.type !== "text") continue;
    if (text.length >= limit * 2) { unread = true; break; }
    const clipped = block.text.length > limit * 2;
    const chunk = clipped ? block.text.slice(0, limit * 2) : block.text;
    text += text === "" ? chunk : \` \${chunk}\`;
    if (clipped) { unread = true; break; }
  }
  const normalized = text.replace(/\\s+/g, " ").trim();
  if (normalized.length > limit - 1) return \`\${normalized.slice(0, limit - 1).trimEnd()}…\`;
  return unread ? \`\${normalized}…\` : normalized;
}`;

async function fixture(t, source = releasedPreview) {
  const root = await mkdtemp(join(tmpdir(), "dsh-unicode-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "node_modules", "@deepseek-ai", "dsh-session-turn-outline", "lib", "index.js");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
  return { root, path };
}

function previewFunction(source) {
  return runInNewContext(`${source}\npreview`, {}, { timeout: 1000 });
}

test("keeps prompt and response previews well-formed at both clipping boundaries", async (t) => {
  const cases = [
    [120, "a".repeat(118) + "🚀 suffix", "a".repeat(118) + "…"],
    [50, "a".repeat(48) + "🚀 suffix", "a".repeat(48) + "…"],
    [120, "a".repeat(117) + "🚀 suffix", "a".repeat(117) + "🚀…"],
    [120, " ".repeat(239) + "🚀 suffix", "…"],
  ];
  const before = previewFunction(releasedPreview);
  assert.equal(before([{ type: "text", text: cases[0][1] }], 120).isWellFormed(), false);
  const { root, path } = await fixture(t);
  await patchTurnOutlineUnicode(root);
  const after = previewFunction(await readFile(path, "utf8"));
  for (const [limit, text, expected] of cases) {
    const preview = after([{ type: "text", text }], limit);
    assert.equal(preview, expected);
    assert.ok(preview.isWellFormed());
    assert.ok(preview.length <= limit);
  }
});

test("preserves short Unicode text, whitespace normalization, and block joining", async (t) => {
  const { root, path } = await fixture(t);
  await patchTurnOutlineUnicode(root);
  const preview = previewFunction(await readFile(path, "utf8"));
  assert.equal(preview([{ type: "text", text: "中文 🚀" }], 120), "中文 🚀");
  assert.equal(preview([
    { type: "text", text: " hello\n" }, { type: "image" }, { type: "text", text: "  world " },
  ], 120), "hello world");
  assert.equal(preview([], 120), "");
});

test("patching twice is idempotent", async (t) => {
  const { root, path } = await fixture(t);
  await patchTurnOutlineUnicode(root);
  const patched = await readFile(path, "utf8");
  await patchTurnOutlineUnicode(root);
  assert.equal(await readFile(path, "utf8"), patched);
});

test("rejects upstream drift before overwriting the module", async (t) => {
  const source = releasedPreview.replace("normalized.slice(0, limit - 1)", "normalized.substring(0, limit - 1)");
  const { root, path } = await fixture(t, source);
  await assert.rejects(patchTurnOutlineUnicode(root), /review upstream before packaging/);
  assert.equal(await readFile(path, "utf8"), source);
});
