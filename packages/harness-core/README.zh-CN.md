# `@anarkhgatsby/deepseek-harness-core`

[English](README.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-core) | [代码仓库](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-core)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-core.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-core) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

面向 **DeepSeek Harness** 社区渠道插件的共享消息总线与网关核心。

> ⚠️ **非官方项目**：本项目由开源社区独立开发和维护，不是 DeepSeek 官方产品，也未得到官方赞助或背书。

## 项目定位

`harness-core` 为飞书 / Lark、企业微信、iMessage、钉钉以及后续渠道提供与平台协议无关的运行时能力。各渠道插件负责平台 I/O，Core 统一处理会话路由、Agent 投递和回复回传。

该包是一个共享库，不是可以单独收发消息的渠道插件。普通用户通常会通过渠道插件间接安装；开发者可以直接导入 `GatewayCore`。

## 核心职责

| 能力 | 行为 |
| --- | --- |
| 统一投递 | 将 `{ sender, text, images, files, raw, dedupeId }` 入站消息转换为 Harness Agent 会话，并通过适配器回发结果。 |
| 工作空间路由 | 按发送者 / handle 映射工作空间，没有专属路由时回退到渠道默认工作空间。 |
| 会话连续性 | 持久化 sender 到 session 的映射，应用重启后仍可继续原有对话。 |
| 消息去重 | 防止 webhook 重试、网络重连导致同一消息重复触发。 |
| 串行投递 | 对同一发送者维护独立队列，避免并发任务造成会话竞态。 |
| 流式与 typing | 在适配器支持时转发增量回复、工具活动和输入状态。 |
| 审批路由 | 将渠道会话产生的沙箱 / 工具权限请求发回原渠道；桌面 GUI 会话继续使用原生弹窗。 |
| 用户提问 | 将 `userQuestions` 请求发回原渠道，并支持编号回复；GUI 会话行为不变。 |

## 适配器接口

渠道包需要提供以下与协议无关的方法：

```js
start(onMessage)
send(target, text, options)
setTyping(target, enabled)
stop()
describe()
```

如果平台支持原生问题控件，适配器还可以实现 `sendQuestion(target, text, question)`。当该能力不可用或执行失败时，Core 会自动回退到普通文本编号提问。

## 审批与用户提问

对于从即时通讯渠道创建的 Agent 会话：

1. 权限申请会发送到同一个聊天会话。
2. 回复 `1`（或 `approve`、`yes`、`允许`）表示批准一次。
3. 回复 `2` 或其他非批准内容表示拒绝。
4. `userQuestions` 会以编号选项发送，回复选项编号即可；多选时用逗号分隔。

桌面 GUI 发起的请求不会被转发到聊天渠道，仍然使用 Harness 原生 GUI 交互。

## 安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-core
```

渠道插件声明了 Core 依赖时，直接安装渠道包通常会自动解析并安装 Core。

## 开发示例

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

建议参考本仓库中的渠道插件实现：适配器负责认证、平台事件、媒体转换和传输错误；会话路由与投递逻辑统一交给 Core。

## 调试

设置 `DSH_CHANNEL_DEBUG=1` 可开启临时渠道调试日志，日志写入 `/tmp/dsh_channel_debug.log`。日志可能包含消息内容或本地路径，不建议在生产环境长期打开。

## 兼容性

`0.1.7` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2` 与 `0.1.6-alpha.2`、`@deepseek-ai/cordis@^4.0.2` 完成验证；`dsh-typert-protocol`、`dsh-tools`、`dsh-llm`、`dsh-session`、`dsh-agent` peer 依赖同时支持已验证版本。升级时请保持 Core 与各渠道插件处于同一版本线。

## 开源协议

[MIT License](./LICENSE)
