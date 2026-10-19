import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { verifyRuntimeCompatibility } from "./patch-runtime-compat.mjs";

const runtimeRoot = resolve("src-tauri/resources/dsh-runtime");
await verifyRuntimeCompatibility(runtimeRoot);

const outlinePath = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-session-turn-outline", "lib", "index.js");
if (existsSync(outlinePath)) {
  const { apply } = await import(pathToFileURL(outlinePath).href);
  let projection;
  apply({ sessionProjections: { register(definition) { projection = definition; } } });
  assert.ok(projection, "turn outline plugin must register its projection");
  let state = projection.init();
  const events = [
    { type: "turn/start", seq: 0, data: { turn: 1 } },
    { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "a".repeat(48) + "🚀 question" }] } },
    { type: "assistant/message", data: { message: { content: [{ type: "text", text: "a".repeat(118) + "🚀 answer" }] } } },
    { type: "turn/end" },
  ];
  for (const event of events) state = projection.apply(state, event);
  const [turn] = projection.wire.view(state);
  assert.equal(turn.prompt, "a".repeat(48) + "…");
  assert.equal(turn.response, "a".repeat(118) + "…");
  assert.ok(turn.prompt.isWellFormed() && turn.response.isWellFormed());
  console.log("Bundled turn outline Unicode compatibility verified.");
}

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
