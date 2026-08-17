# Harness Insights

A bundled Cordis plugin for DeepSeek Harness Desktop. It adds a local-first **Usage insights** settings page without modifying upstream Harness source.

## Data boundary

Harness Insights folds only structured session metadata:

- `assistant/message.data.usage`
- `assistant/message.data.message.source.provider/model`
- `tool/call.data.name`
- event timestamps and session projection identity

It does not request session history in the browser, store message content, read API keys, or upload usage data. Historical aggregation runs through Harness's official `sessionProjectionCache.coldSnapshot()` path and persists only the projection checkpoint owned by Harness.

## Packaging

The package is developed independently under `packages/harness-insights` and copied into each bundled runtime at build time. Harness Desktop deploys its tiny pure-JavaScript runtime copy to the standard out-of-tree plugin root under `$DSH_HOME/node_modules` and loads it through a `--patch` overlay.

The plugin contains no architecture-specific native modules and is shared by macOS arm64, macOS x86_64, and Windows x86_64 builds.

## Tool icon assets

`assets/tool-icons` contains the project-provided Codex-style Harness tool icon set: 26 matching SVG pairs for light and dark interfaces. The build embeds the optimized pairs into the client bundle; the UI switches them through Harness's `body[data-ds-dark-theme]` contract without its own theme preference.
