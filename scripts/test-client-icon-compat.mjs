import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function setup(filePath, primitivesMock) {
  let loaded = null;
  const createElement = (type, props, ...children) => {
    if (!type || (typeof type !== "function" && typeof type !== "string")) {
      throw new Error(`Invalid element type in ${filePath}: ${type}`);
    }
    return { type, props, children };
  };
  const ReactMock = {
    createElement,
    useState(init) { return [typeof init === "function" ? init() : init, () => {}]; },
    useCallback(fn) { return fn; },
    useEffect() {},
    useSyncExternalStore(sub, snap) { return snap(); },
    useRef(init) { return { current: init }; },
    useMemo(fn) { return fn(); },
    Fragment: "Fragment"
  };
  const context = {
    window: { __ModuleLoader__: { load(record) { loaded = record; } } },
    document: {
      head: { appendChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() { return { dataset: {} }; }
    },
    navigator: { language: "zh-CN" },
    console,
    React: ReactMock
  };
  return readFile(filePath, "utf8").then(code => {
    vm.runInNewContext(code, context);
    const requireMock = (spec) => {
      if (spec === "react") return ReactMock;
      if (spec === "@deepseek-ai/dsh-client-ui-primitives") return primitivesMock;
      return {};
    };
    const mod = loaded.factory(requireMock);
    return { mod, ReactMock };
  });
}

const mockEnvironments = [
  {
    name: "DSH 0.1.7-rc.2 (Medium / Regular)",
    primitives: {
      Button: (props) => "Button",
      IconRefreshOutlineMedium: () => "IconRefreshOutlineMedium",
      IconSettingsOutlineMedium: () => "IconSettingsOutlineMedium",
      IconNewChatOutlineMedium: () => "IconNewChatOutlineMedium",
      IconWarningOutlineMedium: () => "IconWarningOutlineMedium",
    }
  },
  {
    name: "DSH 0.1.5 / 0.1.6 (16)",
    primitives: {
      Button: (props) => "Button",
      IconRefreshOutline16: () => "IconRefreshOutline16",
      IconSettingsOutline16: () => "IconSettingsOutline16",
      IconNewChatOutline16: () => "IconNewChatOutline16",
      IconWarningOutline16: () => "IconWarningOutline16",
    }
  },
  {
    name: "Fallback (empty primitives)",
    primitives: {}
  }
];

for (const env of mockEnvironments) {
  // Test Insights
  const { mod: insightsMod } = await setup("packages/harness-insights/lib/client.js", env.primitives);
  let insightsComponent = null;
  const insightsCtx = {
    get() { return { rpc: { call: async () => ({ ok: true, value: { items: [] } }) } }; },
    locale: { bind: () => (k) => k, register() {}, subscribe() { return () => {}; }, getSnapshot() { return { active: "zh" }; } },
    effect(fn) { fn(); },
    slots: { inject(name, fn) { fn(); }, register(meta, comp) { insightsComponent = comp; } }
  };
  insightsMod.apply(insightsCtx);
  assert.ok(insightsComponent, `insightsComponent registered under ${env.name}`);
  
  const renderedInsights = insightsComponent({
    connection: { rpc: { call: async () => ({ ok: true, value: { items: [] } }) } },
    t: (k) => k,
    locale: insightsCtx.locale
  });
  assert.ok(renderedInsights, `insights rendered successfully under ${env.name}`);

  // Test Channel Config
  const { mod: channelMod } = await setup("packages/harness-channel-config/lib/client.js", env.primitives);
  let channelComponent = null;
  const channelCtx = {
    get() { return { rpc: { call: async () => ({ ok: true, value: {} }) } }; },
    locale: { bind: () => (k) => k, register() {}, subscribe() { return () => {}; }, getSnapshot() { return { active: "zh" }; } },
    effect(fn) { fn(); },
    slots: { inject(name, fn) { fn(); }, register(meta, comp) { channelComponent = comp; } }
  };
  channelMod.apply(channelCtx);
  assert.ok(channelComponent, `channelComponent registered under ${env.name}`);

  const renderedChannel = channelComponent({
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    t: (k) => k,
    locale: channelCtx.locale
  });
  assert.ok(renderedChannel, `channel config rendered successfully under ${env.name}`);
}

console.log(`Verified client UI icon compatibility across all ${mockEnvironments.length} runtime environments.`);
