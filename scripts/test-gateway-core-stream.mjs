import assert from "node:assert/strict";
import { GatewayCore } from "../packages/harness-core/lib/gateway-core.mjs";

const listeners = new Map();
const sent = [];
const context = {
  on(name, handler) {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
};
const core = new GatewayCore({
  tag: "test",
  context,
  adapter: {
    start() {},
    stop: async () => {},
    send: async (sender, text) => sent.push({ sender, text }),
  },
  agents: { get: () => undefined },
  sessions: {},
  log: { info() {}, warn() {}, debug() {} },
});
const session = { id: "stream-test-session" };
core.sessionMap.sender = session.id;

const emit = (frame) => listeners.get("agent/assistant-stream")({ agent: { session }, frame });

emit({
  type: "chunk",
  attemptId: "stream-test-session:failed",
  chunk: { type: "text-delta", index: 0, text: "failed text" },
});
emit({
  type: "end",
  attemptId: "stream-test-session:failed",
  outcome: { kind: "committed", eventType: "assistant/attempt", seq: 1 },
});
emit({
  type: "chunk",
  attemptId: "stream-test-session:abandoned",
  chunk: { type: "text-delta", index: 0, text: "abandoned text" },
});
emit({
  type: "end",
  attemptId: "stream-test-session:abandoned",
  outcome: { kind: "abandoned" },
});
assert.deepEqual(sent, [], "failed and abandoned attempts must not be sent");

emit({
  type: "chunk",
  attemptId: "stream-test-session:success",
  chunk: { type: "text-delta", index: 0, text: "hello " },
});
emit({
  type: "chunk",
  attemptId: "stream-test-session:success",
  chunk: { type: "text-delta", index: 0, text: "world" },
});
emit({
  type: "end",
  attemptId: "stream-test-session:success",
  outcome: { kind: "committed", eventType: "assistant/message", seq: 2 },
});
await core._sendChain;
assert.deepEqual(sent, [{ sender: "sender", text: "hello world" }]);

core.stopListener();
console.log("GatewayCore assistant-stream settlement test passed.");
