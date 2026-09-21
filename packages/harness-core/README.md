# `@anarkhgatsby/deepseek-harness-core`

[简体中文](README.zh-CN.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-core) | [Repository](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-core)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-core.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-core) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Shared message-bus and gateway core for community channel plugins built on **DeepSeek Harness**.

> ⚠️ **Unofficial project** — independently developed and maintained by the open-source community. It is not an official DeepSeek product.

## Overview

`harness-core` provides the protocol-neutral runtime shared by Feishu/Lark, WeCom, iMessage, DingTalk, and future channel adapters. It keeps platform-specific I/O in each channel package while centralizing session routing and agent delivery.

The package is a library rather than a standalone channel. Most users install it indirectly through a channel plugin; plugin authors can import `GatewayCore` directly.

## Responsibilities

| Capability | Behavior |
| --- | --- |
| Unified delivery | Converts inbound `{ sender, text, images, files, raw, dedupeId }` events into Harness agent turns and sends replies back through the adapter. |
| Workspace routing | Maps a sender/handle to a configured workspace, with a channel-level default fallback. |
| Session continuity | Persists the sender-to-session mapping so a channel conversation can resume after restart. |
| Deduplication | Prevents webhook retries and reconnects from triggering the same inbound message twice. |
| Serialized delivery | Maintains a per-sender queue to avoid concurrent turns racing for one conversation. |
| Streaming and typing | Forwards incremental assistant output, tool activity, and typing state when supported by the adapter. |
| Approval routing | Routes sandbox/tool permission requests from channel sessions to the originating channel; GUI sessions continue to use the native GUI approval flow. |
| User questions | Routes `userQuestions` requests to the originating channel and accepts numbered replies; GUI sessions remain unchanged. |

## Adapter contract

Channel packages provide an adapter with the following protocol-neutral methods:

```js
start(onMessage)
send(target, text, options)
setTyping(target, enabled)
stop()
describe()
```

The adapter may additionally implement `sendQuestion(target, text, question)` for platform-native question controls. If that operation is unavailable or fails, the core falls back to a plain numbered text prompt.

## Approval and question routing

For an agent session created from a messaging channel:

1. A permission request is sent to the same conversation.
2. Reply `1` (or `approve`, `yes`, `允许`) to approve once.
3. Reply `2` or any other non-approval response to reject.
4. `userQuestions` prompts are sent as numbered options; reply with the option number. Multiple selections can be separated by commas.

Requests originating from the desktop GUI are not redirected to a chat channel and continue to use the Harness GUI interaction.

## Installation

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-core
```

When a channel package declares this package as a dependency, installing that channel normally resolves Core automatically.

## Developer example

```js
import { GatewayCore, createChannelLogger } from "@anarkhgatsby/deepseek-harness-core";

const log = createChannelLogger("my-channel", console);
const gateway = new GatewayCore({
  tag: "my-channel",
  adapter,
  agents,
  sessions,
  agentPresets,
  workspaceRegistry,
  sessionPersistence,
  sessionTitle,
  log,
  statePath: "/path/to/channel-state.json",
});

gateway.applyConfig({
  autoReply: true,
  streamReplies: true,
  routes: { "user-001": "/Users/me/workspaces/demo" },
});

await gateway.startListener();
```

Use the channel packages in this repository as reference implementations. A new adapter should remain responsible for authentication, platform events, media conversion, and transport errors; routing and session behavior belong in Core.

## Diagnostics

Set `DSH_CHANNEL_DEBUG=1` to enable temporary channel diagnostics. Debug output is written to `/tmp/dsh_channel_debug.log`; do not enable it permanently when logs may contain message content or local paths.

## Compatibility

`0.1.7` is validated with DeepSeek Harness `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`, plus `@deepseek-ai/cordis@^4.0.2`. Its `dsh-typert-protocol`, `dsh-tools`, `dsh-llm`, `dsh-session`, and `dsh-agent` peers accept the validated releases. Keep Core and every channel on this release line when upgrading.

## License

[MIT License](./LICENSE)
