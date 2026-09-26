# `@anarkhgatsby/deepseek-harness-channel-imessage`

[English](README.md) | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-imessage.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-imessage)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

DeepSeek Harness 的 macOS 本地原生 iMessage 通道插件（100% 本地隐私安全、直连 Messages.app 与 SQLite 数据库，零云端中继）。

> ⚠️ **非官方声明**：本项目由开源社区独立开发与维护，**不是 DeepSeek 或 Apple 官方产品**，未经官方赞助或背书。

---

## 🌟 隐私优先设计与核心特性

* 🔒 **100% 本地安全，零云端中继**：所有对话数据完全在本地处理，绝不经过任何第三方云服务或外网转发中继；
* 📖 **原生 SQLite 只读入站读取**：入站消息直接从本地 `~/Library/Messages/chat.db` 只读轮询；
* ✉️ **原生 AppleScript 出站调度**：出站回复通过 macOS 系统自带的 `/usr/bin/osascript` 驱动 `Messages.app` 极速发送；
* 🛡️ **依托 `GatewayCore` 消息总线**：自带会话管理、自动回复与智能防重机制；
* 🧰 **免装任何第三方 CLI**：无需安装 `imsg` CLI 或 Photon，纯原生能力实现。

## 🆕 `0.1.5` 更新内容

* iMessage 出站回复会先转换为更适合 Messages.app 的纯文本；
* `**加粗**`、`*斜体*`、反引号和删除线等常见 Markdown 标记不再直接显示；
* 标题、列表、链接和代码块会按照纯文本通道的特点重新排版。

---

## 📥 快速安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-imessage
```

*(强烈建议同时安装可视化配置中心：`dsh plugin add @anarkhgatsby/deepseek-harness-channel-config`)*。

---

## 🔐 必需的 macOS 系统权限配置

由于 macOS 系统对 iMessage 隐私数据有严格的系统沙盒保护，初次使用必须开启以下两项系统权限：

1. **完全磁盘访问权限 (Full Disk Access)**：
   * 打开 **系统设置 ➔ 隐私与安全性 ➔ 完全磁盘访问权限**；
   * 点击 `+` 号添加并开启 **DeepSeek Harness**（如果通过终端命令行运行，请添加 **终端 / iTerm2**）；
   * *（此权限用于读取本地 `~/Library/Messages/chat.db` 消息数据库）*。
2. **自动化权限 (Automation)**：
   * 打开 **系统设置 ➔ 隐私与安全性 ➔ 自动化**；
   * 在 **DeepSeek Harness** 或终端下方，勾选允许控制 **「信息 (Messages)」**；
   * *（此权限用于通过 AppleScript 发送出站回复）*。

---

## ⚙️ 接入与配置

### 方式 1：通过可视化渠道配置面板（推荐）
启动 DeepSeek Harness 后，打开 **设置 ➔ 渠道配置** 页面，在 iMessage 卡片中开启自动回复并配置默认工作区即可。

### 方式 2：配置文件方式 (`~/.dsh/settings.yaml`)
```yaml
imessage:
  mode: "local"                                   # 当前唯一支持的模式
  chatDb: "/Users/你的用户名/Library/Messages/chat.db"
  defaultWorkspace: "/Users/you/dsh/default"     # 默认工作区
  autoReply: true
  streamReplies: true
  toolCallReplies: true
  allowlist: []
  routes: {}
```

本地开发时可使用 `IMSG_CHAT_DB` 和 `IMSG_DEFAULT_WORKSPACE` 环境变量覆盖默认值。覆盖 `chatDb` 时建议使用绝对路径。

## 📝 回复格式优化

由于 macOS `Messages.app` 发送的是纯文本，插件会在 iMessage 出站前进行轻量 Markdown 转换，避免将 `**加粗**`、`*斜体*`、反引号等格式标记直接显示给收件人：

* 标题转换为普通文本；
* 无序列表转换为 `•` 项目符号；
* Markdown 链接保留标题与 URL；
* 代码块显示为“代码：”段落，并保留缩进；
* 加粗、斜体、删除线、下划线和行内代码标记会被移除。

该转换仅作用于 iMessage 出站消息。网页端以及飞书、钉钉等支持富文本的渠道继续使用原有渲染方式。

---

## 🔐 审批与 Agent 提问

对于从 iMessage 会话创建的 Agent，沙箱或工具权限请求会发送回同一个“信息”会话：

* 回复 `1`：批准本次操作；
* 回复 `2` 或其他非批准文本：拒绝操作；
* 对于 `userQuestions`，回复显示的选项编号，多选时用逗号分隔。

桌面 GUI 会话仍然使用 Harness 原生 GUI 审批弹窗。如果在超时时间内没有回复，审批或提问会自动失败。

---

## 🛠️ 全局主动推送工具 (`message_imessage`)

插件注册了 `message_imessage` 工具，AI Agent 在执行完后台任务后可主动向指定手机号或 Apple ID 发送 iMessage：

```json
{
  "action": "send",
  "channel": "imessage",
  "target": "+8613800000000",
  "message": "构建与测试已全部完成 🚀"
}
```

---

## ❓ 常见问题与排错

| 现象 | 排查方向 |
| --- | --- |
| 无法读取 `chat.db` | 为 DeepSeek Harness 开启“完全磁盘访问”；如果通过终端启动，则为终端 / iTerm2 授权。 |
| 能收消息但无法回复 | 在“系统设置 → 隐私与安全性 → 自动化”中允许 DeepSeek Harness 控制“信息”。 |
| 没有显示会话 | 检查数据库路径、Messages 登录账号，以及运行环境是否为 macOS。 |
| 审批弹出 GUI | 当前会话没有识别为 iMessage 渠道会话，检查 Core 状态映射和运行时日志。 |
| 回复重复 | 确认同一个 `chat.db` 没有启动多个 iMessage 运行时实例。 |

---

## 兼容性

`0.1.9` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.6-alpha.2` 与 `0.1.7-rc.2`、`@deepseek-ai/cordis@^4.0.4` 以及对应协议与工具 peer 依赖完成验证；共享路由依赖 `@anarkhgatsby/deepseek-harness-core@0.1.8`。本插件仅支持 macOS。

---

## 📄 开源协议

遵循 [MIT License](./LICENSE) 开源协议。
