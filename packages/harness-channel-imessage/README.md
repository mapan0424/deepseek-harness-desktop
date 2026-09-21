# `@anarkhgatsby/deepseek-harness-channel-imessage`

[简体中文](README.zh-CN.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-imessage) | [Repository](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-imessage)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-imessage.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-imessage) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Native local iMessage channel plugin for **DeepSeek Harness**. It uses macOS `Messages.app` and the local `chat.db` database, without the `imsg` CLI, Photon, or any cloud relay.

> ⚠️ **Unofficial project** — independently developed and maintained by the open-source community. It is not an official DeepSeek or Apple product.

## What's new in 0.1.5

- iMessage replies are normalized to readable plain text before they are sent through Messages.app.
- Common Markdown markers such as `**bold**`, `*italic*`, backticks, and strikethrough no longer appear in the conversation.
- Lists, headings, links, and fenced code blocks receive channel-appropriate plain-text formatting.

## Platform and installation

This plugin is macOS-only. Windows desktop bundles intentionally exclude iMessage because Windows has no Messages.app or AppleScript transport.

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-imessage
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

The configuration package is optional. The shared `@anarkhgatsby/deepseek-harness-core` package is resolved as a dependency.

## Privacy and security

- Message data stays on the local Mac and is not sent through a third-party relay.
- Incoming messages are read from `~/Library/Messages/chat.db` in read-only mode.
- Outgoing messages are sent through macOS `/usr/bin/osascript` controlling `Messages.app`.
- No additional CLI or cloud API key is required.
- DeepSeek Harness needs Full Disk Access and Automation permission to control Messages.app.

## 架构

```
Harness Agent
     │
     ▼
Cordis 通道插件（host: index.js）
     │
     ▼
GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     │  统一消息总线：路由 / 去重 / 投递 / 流式回复
     ▼
LocalAdapter
     ├── chat.db：读取入站消息
     └── Messages.app：发送出站消息
```

## Configuration

The plugin keeps `local` as a compatibility marker; it is currently the only supported mode. The configuration page exposes:

- `chatDb`: Messages database path, defaulting to `~/Library/Messages/chat.db`
- `defaultWorkspace`: default workspace path
- `autoReply`, `streamReplies`, and `toolCallReplies`
- `allowlist` and `routes` for sender access and workspace routing

The `imessage` settings namespace can also be configured in YAML. Prefer an absolute path when overriding `chatDb`:

```yaml
imessage:
  mode: "local"
  chatDb: "/Users/you/Library/Messages/chat.db"
  defaultWorkspace: "/Users/you/dsh/default"
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  allowlist: []
  routes: {}
```

Defaults can be overridden during local development with `IMSG_CHAT_DB` and `IMSG_DEFAULT_WORKSPACE`. Incoming messages are routed by sender to the selected workspace and then delivered to the Harness Agent.

## Outbound message formatting

Messages.app sends plain text, so the adapter applies a small readability pass before delivering an iMessage reply:

- Markdown emphasis, strikethrough, and inline-code markers are removed;
- headings become plain-text headings;
- unordered lists use `•` bullets;
- Markdown links keep both their label and URL;
- fenced code blocks are rendered under a `代码：` label with indentation preserved.

This conversion is limited to iMessage outbound messages. Web, Feishu, DingTalk, and other rich-text-capable channels keep their existing rendering behavior.

## Approvals and agent questions

For an Agent session created from iMessage, sandbox or tool permission requests are sent to the same Messages conversation:

* Reply `1` to approve once.
* Reply `2` or any other non-approval text to reject.
* For `userQuestions`, reply with the displayed option number; separate multiple selections with commas.

Requests from desktop GUI sessions continue to use the native Harness GUI dialog. Approval and question prompts time out if no answer is received within the runtime window.

## Code structure

- `index.js` — registers the `imessage` settings namespace, local gateway, and `message_imessage` tool.
- `client.js` — exports client metadata for the local mode.
- `lib/config.mjs` — local-mode schema and settings normalization.
- `lib/adapters/local.mjs` — `chat.db` polling and Messages.app AppleScript delivery.
- `cordis.patch.yml` — Cordis bundle patch entry.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `chat.db` cannot be opened | Grant Full Disk Access to DeepSeek Harness (or Terminal / iTerm2 when running from a shell). |
| Messages are received but replies fail | Grant Automation permission for DeepSeek Harness to control Messages.app. |
| No conversations appear | Confirm the database path, the signed-in Messages account, and that the runtime is running on macOS. |
| Approval appears as a GUI popup | The session-to-sender mapping was not recognized; inspect the Core and iMessage runtime logs. |
| Duplicate replies | Ensure only one iMessage runtime instance is watching the same `chat.db`. |

## Development

```bash
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/local.mjs
```

## Compatibility

`0.1.8` is validated with DeepSeek Harness `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`, `@deepseek-ai/cordis@^4.0.2`, and matching protocol and tools peers. It uses `@anarkhgatsby/deepseek-harness-core@0.1.7` and is macOS-only.

## License

[MIT License](./LICENSE)
