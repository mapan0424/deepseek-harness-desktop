# `@anarkhgatsby/deepseek-harness-channel-config`

[简体中文](README.zh-CN.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-config) | [Repository](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-config)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-config.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-config) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Visual channel configuration center for **DeepSeek Harness**. It adds a settings page that discovers installed community channel runtimes and exposes their credentials, workspace routing, auto-reply, and streaming controls through the Harness web UI.

> ⚠️ **Unofficial project** — independently developed and maintained by the open-source community. It is not an official DeepSeek product.

## What it provides

* **One settings surface** for Feishu/Lark, WeCom, iMessage, and DingTalk integrations.
* **Runtime-aware forms** — only channels with an installed runtime plugin are actionable.
* **Credential masking** for App Secrets, Client Secrets, Bot Secrets, and other sensitive fields.
* **Hot configuration updates** through the channel gateway remotes; saving settings does not require editing YAML by hand.
* **Status and authorization visibility** including connection state, active sessions, and iMessage macOS permission hints.
* **Workspace routing controls** for assigning a sender or conversation to a specific local workspace.

The package is a configuration UI, not a message transport. Installing it alone does not connect any channel.

## What's new in 0.1.7

- The channel list is runtime-driven, so newly installed supported channels are not hidden by a hard-coded client-side filter.
- DingTalk uses the official light/dark visual assets with the same sizing treatment as the other channel cards.
- AppKey placeholders no longer resemble a real DingTalk credential.
- The settings page keeps platform-specific authorization guidance visible, including the macOS permissions required by iMessage.

## Installation

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

Install the channel runtimes you intend to use as well:

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-feishu
dsh plugin add @anarkhgatsby/deepseek-harness-channel-wecom
dsh plugin add @anarkhgatsby/deepseek-harness-channel-imessage
dsh plugin add @anarkhgatsby/deepseek-harness-channel-dingtalk
```

The exact plugin set is platform-dependent. iMessage is macOS-only; do not install or enable it on Windows.

## Quick start

1. Start DeepSeek Harness and open **Settings → Channel Configuration**.
2. Select an installed channel and enter its platform credentials.
3. Set the default workspace and optional per-sender routes.
4. Choose whether to enable automatic replies, streaming output, and tool activity messages.
5. Save the configuration and confirm the channel status changes to connected.

The page writes to the active Harness settings profile. It does not embed credentials in the browser bundle or transmit them to a third-party service.

## Supported fields

| Channel | Required credentials | Optional controls |
| --- | --- | --- |
| Feishu / Lark | App ID, App Secret | Verification Token, Encrypt Key, workspace, allowlist, cards, streaming |
| WeCom | Bot ID, Secret | workspace, allowlist, streaming; legacy app fields are retained for compatibility |
| iMessage | Local `chat.db` access | database path, workspace, auto-reply, streaming; requires macOS permissions |
| DingTalk | Client ID (AppKey), Client Secret | workspace, allowlist, auto-reply, streaming |

Credentials remain in the local Harness settings profile. Treat the profile directory and exported settings as sensitive data.

## Troubleshooting

* **No channel card appears:** install the corresponding runtime plugin, then refresh the settings page.
* **Saved but not connected:** verify credentials, platform bot capabilities, and the runtime log; configuration saving and platform authentication are separate steps.
* **iMessage shows authorization required:** grant Full Disk Access to DeepSeek Harness and Automation access to Messages in macOS System Settings, then restart the app.
* **A channel is unavailable on Windows:** iMessage is intentionally excluded from the Windows desktop bundle because it depends on macOS Messages.app. Feishu, DingTalk, and WeCom still require their respective platform credentials and capabilities.

## Compatibility

`0.1.12` is validated with DeepSeek Harness `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2`, and `0.1.7-rc.2`, `@deepseek-ai/cordis@^4.0.4`, and matching client connection and locale services. Install the UI and the channel runtime packages into the same profile.

## License

[MIT License](./LICENSE)
