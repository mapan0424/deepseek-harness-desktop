# `@anarkhgatsby/deepseek-harness-channel-wecom`

[English](README.md) | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-wecom.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-wecom)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

DeepSeek Harness 企业微信通道插件 —— **智能机器人 · WebSocket 长连接模式**。

机器人主动向企业微信建立 `wss` 长连接，**无需公网 IP、无需回调 URL、无需消息加解密**，本地/内网直接运行。收到消息后交给 DSH 网关（GatewayCore）路由到 Agent 处理，回复经流式消息（stream）原路返回。

> 协议对齐官方 `@wecom/aibot-node-sdk`（v1.0.7 实测验证）。

> ⚠️ **非官方声明**：本项目由开源社区独立开发与维护，**不是 DeepSeek 或腾讯企业微信官方产品**，未经官方赞助或背书。

---

## 🌟 核心特性

- 🔌 **WebSocket 长连接**：出站直连 `wss://openws.work.weixin.qq.com`，本地/内网环境零网络配置即可部署
- 🔐 **免加解密**：安全握手内置于 WSS 层，仅需 `botId` + `secret` 即可连通
- 💓 **心跳保活与自动重连**：30s ping 保活 + 指数退避自动重连机制（上限 10 次）
- 📨 **智能防重**：依托 `@anarkhgatsby/deepseek-harness-core` 进行 msgid 级去重（10 分钟 TTL），服务端重推不重复处理
- 💬 **双路消息发送**：
  - **被动流式回复**：透传回调 `req_id`，逐字打字机 stream 格式返回
  - **主动通知推送**：注册 `message_wecom` 工具，Agent 可根据 userid 主动向企业成员发消息
- ⏱️ **6 分钟流式窗口保底**：窗口过期（errcode 846608）自动降级为主动发送

---

## 📥 快速安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-wecom
```

*(强烈建议同时安装可视化配置中心：`dsh plugin add @anarkhgatsby/deepseek-harness-channel-config`)*。

---

## 📋 前置条件（企业微信后台 4 步极速开通）

1. 登录企业微信管理后台 → **工作台 → 智能机器人 → 创建机器人 → 手动创建**
2. 选择 **API 模式创建**
3. 连接方式选择 **「使用长连接」**（⚠️ 勿选"设置接收消息回调地址"）
4. 记录页面生成的 **Bot ID** 和 **Secret**
5. ⚠️ **最关键配置**：**可见范围必须包含使用机器人的企业成员**（如果可见范围没配，消息永远不会路由到机器人）

---

## ⚙️ 接入与配置

### 方式 1：通过可视化渠道配置面板（推荐）
启动 DeepSeek Harness 后，打开 **设置 ➔ 渠道配置** 页面，在企业微信卡片中填入 `Bot ID` 和 `Secret`，点击保存即可实时上线！

### 方式 2：配置文件方式 (`~/.dsh/settings.yaml`)
```yaml
wecom:
  botId: "aibS9-XXXXXXXXXXXXXXXXXXXXXXXX"        # 机器人 Bot ID
  secret: "0Y3UNbXXXXXXXXXXXXXXXXXXXXXXXXXXXX"   # 长连接专用 Secret
  defaultWorkspace: "/Users/you/dsh/default"     # 默认工作区
  autoReply: true
  streamReplies: true
  allowlist: []                                  # 为空 = 不限；填 userid 列表则开启白名单
```

也可使用环境变量：`WECOM_BOT_ID` / `WECOM_BOT_SECRET`。

---

## 🔐 审批与 Agent 提问

对于从企业微信会话创建的 Agent，Core 会将沙箱或工具权限请求发回同一个会话：

* 回复 `1`：批准本次操作；
* 回复 `2` 或其他非批准文本：拒绝操作；
* 对于 `userQuestions`，回复显示的选项编号，多选时用逗号分隔。

桌面 GUI 发起的会话仍然使用 Harness 原生审批弹窗。被动流式回复会保留回调上下文；当平台窗口过期时，适配器会自动降级为主动 Markdown 消息。

---

## 🛠️ 全局主动推送工具 (`message_wecom`)

插件注册了 `message_wecom` 工具，AI Agent 可在执行完任务后主动向成员发送企微通知：

```json
{
  "action": "send",
  "channel": "wecom",
  "target": "MaPan",
  "message": "构建与测试已全部完成 ✅"
}
```

---

## ❓ 常见问题与排错

| 现象 | 原因与解决方案 |
| :--- | :--- |
| `853000 invalid bot_id or secret` | 凭据错误；请确认复制的是长连接页面的 BotID 与 Secret |
| 认证成功但收不到消息 | **检查可见范围**；确认发消息对象是这个机器人；群里需 @ 触发 |
| `40008 invalid message type` | 回复格式问题（必须 stream），本插件已内置正确格式 |
| 连接反复断开 | 另一处用同一 BotID 建了新连接（企微单 bot 单连接，新连踢旧连） |
| 重连次数超限停止 | 网络问题或凭据失效，修复网络后重启即可 |

---

## 📄 开源协议

遵循 [MIT License](./LICENSE) 开源协议。

## 兼容性

`0.1.8` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.6-alpha.2` 与 `0.1.7-rc.2`、`@deepseek-ai/cordis@^4.0.4` 以及对应协议与工具 peer 依赖完成验证；共享路由依赖 `@anarkhgatsby/deepseek-harness-core@0.1.8`。
