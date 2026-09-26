# `@anarkhgatsby/deepseek-harness-channel-dingtalk`

[简体中文](README.zh-CN.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-dingtalk) | [Repository](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-dingtalk)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-dingtalk.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-dingtalk) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

DingTalk bot channel plugin for **DeepSeek Harness**, using DingTalk's Stream long-connection transport and the shared `GatewayCore` message bus.

> ⚠️ **Unofficial project** — independently developed and maintained by the open-source community. It is not an official DeepSeek or DingTalk product.

## Features

* **Stream long connection** for local deployments without a public webhook endpoint.
* **One-to-one and group conversations**, with sender / conversation routing and optional allowlists.
* **Markdown replies and active notifications** through the built-in `message_dingtalk` tool.
* **Session continuity and deduplication** through the shared Core package.
* **Approval and question routing**: requests from DingTalk-originated Agent sessions are returned to the same conversation, while GUI sessions retain the native GUI flow.
* **Automatic fallback** from the passive callback response to DingTalk OpenAPI active send when the callback context is unavailable or expired.

## Installation

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-dingtalk
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

The configuration package is optional. `@anarkhgatsby/deepseek-harness-core` is resolved as a dependency.

## DingTalk Developer Console setup

1. Create an enterprise internal application in the [DingTalk Developer Console](https://open-dev.dingtalk.com/).
2. Enable the **Bot** capability and configure the message receiving method.
3. Enable **Stream mode** when the console offers the long-connection option; this avoids a public webhook endpoint.
4. Grant the application the permissions required to receive bot messages and send bot replies.
5. Publish the application configuration according to the DingTalk console workflow.
6. Copy the **Client ID (AppKey)** and **Client Secret (AppSecret)**.

The exact permission names and console labels may vary by DingTalk tenant and region. Follow the permissions shown for the application in your console.

## Configuration

Open **DeepSeek Harness → Settings → Channel Configuration → DingTalk**, or configure the `dingtalk` namespace:

```yaml
dingtalk:
  appKey: "dingxxxxxxxxxxxxxxxx"
  appSecret: "replace-with-app-secret"
  defaultWorkspace: "/Users/you/dsh/default"
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  stepTimeoutSec: 0
  allowlist: []
  routes: {}
```

For local development, `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, and `DSH_CH_DEFAULT_WORKSPACE` can provide defaults. Keep secrets in the local Harness profile or environment, never in a committed repository.

## Approvals and agent questions

When an Agent created from DingTalk requests a sandbox or tool permission, the request is sent to the same conversation:

* Reply `1` to approve once.
* Reply `2` or any other non-approval text to reject.
* For `userQuestions`, reply with the displayed option number; separate multiple selections with commas.

If there is no active callback context, the adapter uses DingTalk OpenAPI active sending. A GUI-originated Agent session continues to use the native Harness approval dialog.

## Active message tool

The plugin registers `message_dingtalk` for proactive notifications:

```json
{
  "action": "send",
  "channel": "dingtalk",
  "target": "staff-or-conversation-id",
  "message": "Build completed successfully."
}
```

## Architecture

```text
Harness Agent
     │
     ▼
DingTalk channel plugin (index.js)
     │
     ▼
GatewayCore (routing, sessions, deduplication, approvals)
     │
     ▼
DingtalkAdapter (Stream receive + OpenAPI send)
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No connection | Verify AppKey / AppSecret, bot capability, published app settings, and Stream mode. |
| Bot receives nothing | Check message subscription, application permissions, and tenant visibility. |
| Reply fails after a long task | The passive callback window may have expired; verify OpenAPI send permissions and target identifiers. |
| Approval appears as a GUI popup | The session-to-sender mapping was not recognized; inspect Core state and runtime logs. |
| Duplicate replies | Ensure only one runtime instance uses the same DingTalk application and state file. |

## Compatibility

`0.1.4` is validated with DeepSeek Harness `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2`, and `0.1.7-rc.2`, `@deepseek-ai/cordis@^4.0.4`, and matching protocol and tools peers. It uses `@anarkhgatsby/deepseek-harness-core@0.1.8` for shared routing.

## License

[MIT License](./LICENSE)
