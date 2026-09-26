# `@anarkhgatsby/deepseek-harness-channel-feishu`

[English](README.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-feishu) | [代码仓库](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-feishu)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-feishu.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-feishu) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

面向 **DeepSeek Harness** 的飞书 / Lark 渠道插件，基于飞书长连接事件和共享的 `GatewayCore` 消息总线实现。

> ⚠️ **非官方项目**：本项目由开源社区独立开发和维护，不是 DeepSeek 或飞书 / Lark 官方产品，也未得到官方赞助或背书。

## 功能特性

* **WebSocket 长连接**：适合本地和内网部署，无需暴露公网 webhook 地址。
* **单聊与群聊**：支持白名单以及按发送者 / 会话映射工作空间。
* **富交互回复**：支持卡片、Markdown 风格文本、流式输出、输入状态和媒体附件。
* **可靠投递**：由 Core 提供会话持久化、消息去重和按发送者串行处理。
* **审批与提问路由**：从飞书会话发起的 Agent 权限请求会回到飞书；GUI 会话仍使用原生 GUI 流程。

## 安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-feishu
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

可视化配置包是可选的，共享 Core 会作为飞书渠道包的依赖自动安装。

## 飞书开放平台配置

1. 在[飞书开放平台](https://open.feishu.cn/app/)创建企业自建应用。
2. 开启 **机器人** 能力。
3. 开启事件订阅，并选择长连接 / WebSocket 模式。
4. 授予读取和发送消息、获取相关会话信息以及处理机器人事件所需的权限。
5. 创建并发布应用版本，复制 **App ID**（通常以 `cli_` 开头）和 **App Secret**。

不同地区的飞书 / Lark 控制台可能使用不同的权限名称，具体以当前租户控制台显示为准。

## 配置

打开 **DeepSeek Harness → 设置 → 渠道配置 → 飞书 / Lark**，或使用 `feishu` 配置段：

```yaml
feishu:
  appId: "cli_a1b2c3d4e5f6"
  appSecret: "替换为真实 App Secret"
  verifyToken: ""
  encryptKey: ""
  defaultWorkspace: "/Users/你的用户名/dsh/default"
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  cardReplies: true
  stepTimeoutSec: 0
  allowlist: []
  routes: {}
```

本地开发时可使用 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_VERIFY_TOKEN`、`FEISHU_ENCRYPT_KEY` 和 `DSH_CH_DEFAULT_WORKSPACE` 环境变量。

## 审批与 Agent 提问

对于从飞书会话创建的 Agent，沙箱或工具权限申请会发回同一个会话：

* 回复 `1`：批准本次操作。
* 回复 `2` 或其他非批准文本：拒绝操作。
* 对于 `userQuestions`，回复显示的选项编号；多选时用逗号分隔。

如果原生卡片提问不可用，运行时会自动回退到编号文本。Harness GUI 创建的 Agent 会话仍使用 GUI 原生审批弹窗。

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 无法连接 | 检查 App ID / Secret、机器人能力、应用版本是否发布，以及是否启用长连接。 |
| 收不到消息 | 检查事件订阅、机器人可见范围、会话权限和群聊 @规则。 |
| 回复重复 | 确认没有启动多个运行时实例，并检查 Core 状态文件可写。 |
| 审批弹出 GUI | 当前会话没有识别为飞书渠道会话，检查会话映射和运行时日志。 |
| 卡片或流式回复失败 | 临时关闭 `cardReplies` 或 `streamReplies`，先验证纯文本收发。 |

## 兼容性

`0.1.6` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.6-alpha.2` 与 `0.1.7-rc.2`、`@deepseek-ai/cordis@^4.0.4` 以及对应协议与工具 peer 依赖完成验证；共享路由依赖 `@anarkhgatsby/deepseek-harness-core@0.1.8`。

## 开源协议

[MIT License](./LICENSE)
