# `@anarkhgatsby/deepseek-harness-channel-config`

[English](README.md) | [NPM](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-config) | [代码仓库](https://github.com/mapan0424/deepseek-harness-plugins/tree/main/packages/harness-channel-config)

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-config.svg)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-config) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

面向 **DeepSeek Harness** 的渠道可视化配置中心。在 Harness Web 设置页中发现已安装的社区渠道运行时，并集中管理凭据、工作空间路由、自动回复和流式输出等参数。

> ⚠️ **非官方项目**：本项目由开源社区独立开发和维护，不是 DeepSeek 官方产品，也未得到官方赞助或背书。

## 提供的能力

* **统一配置入口**：支持飞书 / Lark、企业微信、iMessage 和钉钉。
* **按运行时识别**：只有安装了对应运行时插件的渠道才可以真正连接。
* **敏感字段遮罩**：App Secret、Client Secret、Bot Secret 等凭据默认隐藏。
* **热更新配置**：通过渠道网关 remote 写入设置，通常不需要手动编辑 YAML 或重启进程。
* **连接与授权状态**：显示连接状态、活跃会话，并提示 iMessage 所需的 macOS 系统权限。
* **工作空间路由**：可以把某个用户或会话分配到指定本地工作空间。

该包只提供配置界面，不提供消息传输能力。单独安装它不会连接任何聊天平台。

## `0.1.7` 更新内容

* 渠道列表改为由运行时动态返回，安装新的受支持渠道后不再受前端硬编码过滤影响；
* 钉钉改用官方亮色 / 深色视觉资源，并按照其他渠道卡片的方式统一视觉尺寸；
* AppKey 占位符不再使用类似真实凭据的示例值；
* 设置页继续保留平台专属授权提示，包括 iMessage 所需的 macOS 系统权限说明。

## 安装

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-config
```

同时安装需要使用的渠道运行时：

```bash
dsh plugin add @anarkhgatsby/deepseek-harness-channel-feishu
dsh plugin add @anarkhgatsby/deepseek-harness-channel-wecom
dsh plugin add @anarkhgatsby/deepseek-harness-channel-imessage
dsh plugin add @anarkhgatsby/deepseek-harness-channel-dingtalk
```

实际安装哪些插件取决于系统平台和使用需求。iMessage 仅支持 macOS，Windows 桌面端不会启用它。

## 快速开始

1. 启动 DeepSeek Harness，打开 **设置 → 渠道配置**。
2. 选择已安装的渠道，填写对应平台凭据。
3. 设置默认工作空间，以及可选的用户 / 会话路由。
4. 根据需要开启自动回复、流式输出和工具活动消息。
5. 保存配置，确认渠道状态变为已连接。

页面写入当前 Harness profile 的本地设置，不会把凭据打包进浏览器资源，也不会发送到第三方服务。

## 支持的字段

| 渠道 | 必填凭据 | 可选控制项 |
| --- | --- | --- |
| 飞书 / Lark | App ID、App Secret | Verification Token、Encrypt Key、工作空间、白名单、卡片、流式输出 |
| 企业微信 | Bot ID、Secret | 工作空间、白名单、流式输出；旧应用字段保留用于兼容 |
| iMessage | 本地 `chat.db` 访问权限 | 数据库路径、工作空间、自动回复、流式输出；需要 macOS 系统授权 |
| 钉钉 | Client ID（AppKey）、Client Secret | 工作空间、白名单、自动回复、流式输出 |

凭据保存在 Harness 本地 profile 中。请将 profile 目录以及导出的设置文件视为敏感数据。

## 常见问题

* **没有显示渠道卡片**：安装对应运行时插件，然后刷新设置页。
* **保存成功但未连接**：检查凭据、平台机器人能力和运行时日志；配置保存与平台认证是两个独立步骤。
* **iMessage 显示需要授权**：在 macOS“系统设置 → 隐私与安全性”中，为 DeepSeek Harness 开启“完全磁盘访问”和“自动化 → 信息”，然后重启应用。
* **Windows 上没有某个渠道**：iMessage 依赖 macOS Messages.app，因此 Windows 桌面端会有意排除它；飞书、钉钉和企业微信仍需各自的平台凭据及平台能力配置。

## 兼容性

`0.1.10` 已与 DeepSeek Harness `0.1.5-rc.1`、`0.1.5-rc.2` 与 `0.1.6-alpha.2`、`@deepseek-ai/cordis@^4.0.2` 以及对应版本的连接与本地化客户端服务完成验证。建议将配置 UI 与渠道运行时安装到同一个 profile。

## 开源协议

[MIT License](./LICENSE)
