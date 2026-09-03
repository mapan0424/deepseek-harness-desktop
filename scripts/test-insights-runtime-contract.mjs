import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { usageInsightsProjectionDefinition } from "../packages/harness-insights/lib/index.js";

const runtimeRoot = resolve("src-tauri/resources/dsh-runtime/node_modules");
const cordisRoot = resolve(runtimeRoot, "@deepseek-ai/cordis");
const projectionRoot = resolve(runtimeRoot, "@deepseek-ai/dsh-session-projection");
const pluginManifest = JSON.parse(await readFile(resolve("packages/harness-insights/package.json"), "utf8"));
const projectionManifest = JSON.parse(await readFile(resolve(projectionRoot, "package.json"), "utf8"));

assert.equal(
  pluginManifest.peerDependencies?.["@deepseek-ai/dsh-session-projection"],
  `^${projectionManifest.version}`,
  "the plugin peer range must follow the bundled projection runtime",
);

const { Context } = await import(pathToFileURL(resolve(cordisRoot, "lib/index.js")));
const { SessionProjectionRegistry } = await import(pathToFileURL(resolve(projectionRoot, "lib/index.js")));
const ctx = new Context();
const registry = new SessionProjectionRegistry(ctx);
registry.register(usageInsightsProjectionDefinition);

const events = [
  {
    seq: 0,
    type: "assistant/message",
    time: new Date(2026, 7, 23, 12).getTime(),
    data: {
      message: { source: { kind: "model", provider: "deepseek", model: "deepseek-chat" } },
      usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 4, reasoningTokens: 2 },
    },
  },
  { seq: 1, type: "tool/call", time: new Date(2026, 7, 23, 12, 1).getTime(), data: { name: "bash" } },
];

// dsh 0.1.2-alpha.4+ replaced Session.events with seq / eventAt() / snapshotEvents().
const session = {
  seq: events.length,
  header: {},
  inheritedEventCount: 0,
  snapshotEvents(fromOffset, toOffset) {
    const start = fromOffset === undefined ? 0 : fromOffset;
    const end = toOffset === undefined ? events.length : toOffset;
    return events.filter((event) => event.seq >= start && event.seq < end);
  },
  eventAt(seq) {
    return events.find((event) => event.seq === seq);
  },
};
const live = registry.snapshot(session);

assert.equal(live.asOfSeq, 1);
assert.deepEqual(live.values.harnessDesktopInsights?.totals, {
  inputTokens: 10,
  outputTokens: 3,
  cacheReadTokens: 4,
  cacheWriteTokens: 0,
  reasoningTokens: 2,
  calls: 1,
});
assert.deepEqual(live.values.harnessDesktopInsights?.tools, { bash: 1 });

const restored = registry.restore({}, events, 0, session.header, session.inheritedEventCount);
assert.deepEqual(restored.snapshot, live, "cold history replay must produce the same client projection as live replay");
assert.equal(restored.checkpoint.harnessDesktopInsights?.ver, usageInsightsProjectionDefinition.stateVersion);

console.log(
  `Harness Insights runtime contract verified against @deepseek-ai/dsh-session-projection@${projectionManifest.version}.`,
);
