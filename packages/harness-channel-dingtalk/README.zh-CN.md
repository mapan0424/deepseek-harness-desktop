# `@anarkhgatsby/deepseek-harness-channel-dingtalk`

[English](README.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-dingtalk) | [代码仓库](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-dingtalk)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-dingtalk.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-dingtalk) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

面向 **DeepSeek Harness** 的钉钉机器人渠道插件，使用钉钉 Stream 长连接和共享的 `GatewayCore` 消息总线。

> ⚠️ **非官方项目**：本项目由开源社区独立开发和维护，不是 DeepSeek 或钉钉官方产品，也未得到官方赞助或背书。

## 功能特性

* **Stream 长连接**：适合本地部署，不需要暴露公网 webhook 地址。
* **单聊与群聊**：支持发送者 / 会话路由和可选白名单。
* **Markdown 回复与主动通知**：注册 `message_dingtalk` 工具，Agent 可主动向用户或会话发送通知。
* **会话连续与消息去重**：由共享 Core 负责会话持久化、路由和去重。
* **审批与提问路由**：从钉钉会话发起的 Agent 请求会回到同一会话；GUI 会话仍使用原生 GUI 流程。
* **自动降级发送**：被动回调上下文不可用或过期时，自动使用钉钉 OpenAPI 主动发送。

## 安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-dingtalk
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

可视化配置包是可选的，共享 `@anarkhgatsby/deepseek-harness-core` 会作为依赖自动解析。

## 钉钉开发者后台配置

1. 在[钉钉开发者后台](https://open-dev.dingtalk.com/)创建企业内部应用。
2. 开启 **机器人** 能力并配置消息接收方式。
3. 如果控制台提供长连接选项，开启 **Stream 模式**，这样不需要公网 webhook。
4. 授予接收机器人消息和发送机器人回复所需的权限。
5. 按钉钉控制台流程发布应用配置。
6. 复制 **Client ID（AppKey）** 和 **Client Secret（AppSecret）**。

不同租户和地区的控制台权限名称可能不同，请以当前应用控制台显示为准。

## 配置

打开 **DeepSeek Harness → 设置 → 渠道配置 → 钉钉**，或使用 `dingtalk` 配置段：

```yaml
dingtalk:
  appKey: "dingxxxxxxxxxxxxxxxx"
  appSecret: "替换为真实 AppSecret"
  defaultWorkspace: "/Users/你的用户名/dsh/default"
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  stepTimeoutSec: 0
  allowlist: []
  routes: {}
```

本地开发时可使用 `DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET` 和 `DSH_CH_DEFAULT_WORKSPACE` 环境变量提供默认值。请将密钥保存在本地 Harness profile 或环境变量中，不要提交到 Git 仓库。

## 审批与 Agent 提问

当从钉钉会话创建的 Agent 请求沙箱或工具权限时，申请会发送回同一个会话：

* 回复 `1`：批准本次操作。
* 回复 `2` 或其他非批准文本：拒绝操作。
* 对于 `userQuestions`，回复显示的选项编号，多选时用逗号分隔。

如果当前没有有效的被动回调上下文，适配器会改用钉钉 OpenAPI 主动发送。GUI 创建的 Agent 会话仍使用 Harness 原生审批弹窗。

## 主动消息工具

插件注册了 `message_dingtalk`，用于主动发送通知：

```json
{
  "action": "send",
  "channel": "dingtalk",
  "target": "用户或会话标识",
  "message": "构建已完成。"
}
```

## 架构

```text
Harness Agent
     │
     ▼
钉钉渠道插件（index.js）
     │
     ▼
GatewayCore（路由、会话、去重、审批）
     │
     ▼
DingtalkAdapter（Stream 接收 + OpenAPI 发送）
```

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 无法连接 | 检查 AppKey / AppSecret、机器人能力、应用配置是否发布，以及 Stream 模式。 |
| 机器人收不到消息 | 检查消息订阅、应用权限和租户可见范围。 |
| 长任务结束后无法回复 | 被动回调窗口可能已过期，检查 OpenAPI 主动发送权限和目标标识。 |
| 审批弹出 GUI | 当前会话没有识别为钉钉渠道会话，检查 Core 状态映射和运行时日志。 |
| 回复重复 | 确认同一钉钉应用和状态文件没有启动多个运行时实例。 |

## 兼容性

`0.1.4` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.6-alpha.2` 与 `0.1.7-rc.2`、`@deepseek-ai/cordis@^4.0.4` 以及对应协议与工具 peer 依赖完成验证；共享路由依赖 `@anarkhgatsby/deepseek-harness-core@0.1.8`。

## 开源协议

[MIT License](./LICENSE)
