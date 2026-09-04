# 🧩 DeepSeek Harness Plugins (官方与社区插件矩阵)

本项目 Monorepo 统一托管和维护面向 **DeepSeek Harness** 的非官方社区插件。

---

## 📦 插件矩阵一览

| 插件名称 / 包名 | 类型 | 版本 | 核心功能与特性 | npm 页面 |
| :--- | :---: | :---: | :--- | :---: |
| **`@anarkhgatsby/deepseek-harness-core`**<br>`packages/harness-core` | ⚡ 基础设施 | `0.1.2` | 统一 GatewayCore 消息总线路由、消息去重、底层适配转发中枢 | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-core)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-core) |
| **`@anarkhgatsby/deepseek-harness-channel-config`**<br>`packages/harness-channel-config` | 🎛️ 可视化配置 | `0.1.5` | 渠道设置中心前端 UI，支持飞书/企微/iMessage 运行时参数配置与热生效 | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-config)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-config) |
| **`@anarkhgatsby/deepseek-harness-channel-feishu`**<br>`packages/harness-channel-feishu` | 💬 协同渠道 | `0.1.2` | 飞书 / Lark 机器人渠道（支持 WebSocket 长连接、富文本/卡片/流式打字机） | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-feishu)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-feishu) |
| **`@anarkhgatsby/deepseek-harness-channel-wecom`**<br>`packages/harness-channel-wecom` | 💬 协同渠道 | `0.1.3` | 企业微信应用与自建机器人渠道集成 | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-wecom)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-wecom) |
| **`@anarkhgatsby/deepseek-harness-channel-imessage`**<br>`packages/harness-channel-imessage` | 💬 本地渠道 | `0.1.3` | macOS 本地原生 iMessage 通道（读取 Messages.app 数据库与安全分发） | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-channel-imessage)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-channel-imessage) |
| **`@anarkhgatsby/deepseek-harness-insights`**<br>`packages/harness-insights` | 📊 洞察看板 | `0.1.6` | 本地优先用量统计、Token 消耗分布、对话活动热力与图表分析看板 | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-insights)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-insights) |
| **`@anarkhgatsby/deepseek-harness-locale-pack`**<br>`packages/harness-locale-pack` | 🌐 语言增强 | `0.1.4` | 多语言与民族语言包（藏文、蒙文、维文、彝文、繁中、日文、韩文等） | [![npm](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-locale-pack)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-locale-pack) |

---

## 🛠️ 本地开发与发包工作流

本项目使用 **pnpm Workspaces** 与 **Changesets** 驱动：

### 1. 安装依赖与本地软链
```bash
pnpm install
```
所有 `packages/*` 之间将自动建立软链接，修改底层插件（如 `harness-core`）上层插件即刻生效，无需繁琐的 `npm link`。

### 2. 运行测试套件
```bash
pnpm test:insights
```

### 3. 创建版本更新记录 (Changeset)
当你修改了一个或多个插件后，在根目录下运行：
```bash
pnpm changeset
```
根据 CLI 交互提示勾选本次修改了哪些包、是 patch / minor / major 变更，并输入更新说明。

### 4. 发布与同步到 npm
```bash
# 自动提升各子包版本并生成 CHANGELOG.md
pnpm version:packages

# 发布有版本变动的包至 npm
pnpm publish:packages
```

---

## 📖 开发者扩展指南
如需开发一个全新的 DeepSeek Harness 插件，请参阅文档：[插件开发规范与指南 (docs/plugin-development-guide.md)](../docs/plugin-development-guide.md)。
