# `@anarkhgatsby/deepseek-harness-channel-feishu`

[简体中文](README.zh-CN.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-feishu) | [Repository](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-feishu)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-feishu.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-feishu) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Feishu / Lark channel integration for **DeepSeek Harness**, built around Feishu long-connection events and the shared `GatewayCore` message bus.

> ⚠️ **Unofficial project** — independently developed and maintained by the open-source community. It is not an official DeepSeek or Feishu/Lark product.

## Features

* WebSocket long connection for local and private-network deployments without a public webhook endpoint.
* Direct and group conversations with allowlists and sender-to-workspace routing.
* Rich cards, Markdown-oriented text, streaming output, typing indicators, and supported media attachments.
* Core-backed session persistence, deduplication, and serialized per-sender delivery.
* Approval and question routing for channel-originated Agent sessions; GUI sessions retain the native GUI flow.

## Installation

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-feishu
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

The configuration package is optional. The shared Core is installed as a dependency of the channel package.

## Feishu Open Platform setup

1. Create an enterprise custom app in the [Feishu Open Platform](https://open.feishu.cn/app/).
2. Enable the **Bot** capability.
3. Enable event subscriptions and select the long-connection / WebSocket mode.
4. Grant permissions to read and send messages, access the required chat context, and handle bot events.
5. Create and publish an app version, then copy the **App ID** (`cli_...`) and **App Secret**.

Permission names can vary between Feishu and Lark regions; follow the permissions shown by your tenant's console.

## Configuration

Open **DeepSeek Harness → Settings → Channel Configuration → Feishu / Lark**, or use the `feishu` settings namespace:

```yaml
feishu:
  appId: "cli_a1b2c3d4e5f6"
  appSecret: "replace-with-app-secret"
  verifyToken: ""
  encryptKey: ""
  defaultWorkspace: "/Users/you/dsh/default"
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  cardReplies: true
  stepTimeoutSec: 0
  allowlist: []
  routes: {}
```

Environment variables supported for local development include `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_VERIFY_TOKEN`, `FEISHU_ENCRYPT_KEY`, and `DSH_CH_DEFAULT_WORKSPACE`.

## Approvals and agent questions

For an Agent session created from Feishu, sandbox or tool permission requests are sent back to the same conversation:

* Reply `1` to approve once.
* Reply `2` or any other non-approval text to reject.
* For `userQuestions`, reply with the displayed option number; separate multiple selections with commas.

If native card question interaction is unavailable, the runtime falls back to numbered text. An Agent session started from the Harness GUI continues to use the GUI approval dialog.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No connection | App ID / Secret, bot capability, published app version, and long-connection mode. |
| No inbound events | Event subscriptions, bot visibility, chat permissions, and group mention rules. |
| Duplicate replies | Multiple runtime instances or an unwritable Core state file. |
| GUI popup instead of Feishu approval | The session-to-sender mapping was not recognized; inspect runtime logs. |
| Cards or streaming fail | Temporarily disable `cardReplies` or `streamReplies` and test plain text. |

## Compatibility

`0.1.5` is validated with DeepSeek Harness `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`, `@deepseek-ai/cordis@^4.0.2`, and matching protocol and tools peers. It uses `@anarkhgatsby/deepseek-harness-core@0.1.7` for shared routing.

## License

[MIT License](./LICENSE)
