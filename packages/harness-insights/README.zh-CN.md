# Harness Insights

[English README](./README.md)

Harness Insights 是一个面向 DeepSeek Harness 的非官方 Cordis 插件，为 Web UI 增加本地优先的「用量洞察」设置页面，不修改 Harness 上游源码。

## 界面预览

插件会在 Harness 的设置中增加「用量洞察」页面，展示 Token 活动、模型调用、活跃会话、缓存命中率、活动统计和常用工具等信息。

![Harness Insights 用量洞察页面](./assets/screenshots/usage-insights-zh.png)

## 安装

插件遵循 Harness 官方 bundle manifest，可以直接安装到 profile：

```bash
dsh plugin --profile demo add @anarkhgatsby/deepseek-harness-insights
dsh --profile demo
```

移除插件：

```bash
dsh plugin --profile demo remove @anarkhgatsby/deepseek-harness-insights
```

本地 checkout 也可以直接安装：

```bash
dsh plugin --profile demo add ./packages/harness-insights
```

## 功能

- 在设置中显示会话用量、模型、工具调用和活动趋势
- 使用 Harness 的官方 session projection 接口读取结构化元数据
- 支持 Web UI 的明暗主题和工具图标
- 不修改 DeepSeek Harness 上游源码

## 数据边界

插件只读取以下结构化会话元数据：

- `assistant/message.data.usage`
- `assistant/message.data.message.source.provider/model`
- `tool/call.data.name`
- 事件时间戳和会话 projection 标识

插件不会：

- 在浏览器中请求或保存完整对话内容
- 读取 API Key
- 上传用量数据到第三方服务

历史聚合通过 Harness 提供的 `sessionProjectionCache.coldSnapshot()` 完成，只保存 Harness 自己管理的 projection checkpoint。

## 兼容性

- Harness projection/client API：`0.1.1-rc.2`
- 运行平台：Web UI
- 插件类型：npm bundle
- 当前版本：`0.1.3`

Harness 目前仍处于 developer preview 阶段，未来版本可能存在兼容性变化。

## 开发

```bash
node tests/projection.test.mjs
node tests/client-activity.test.mjs
node tests/manifest.test.mjs
npm pack --dry-run
```

## 说明

这是一个独立的非官方社区插件，由 `mapan0424` 发布，不代表 DeepSeek 官方立场，也不是由 DeepSeek 官方发布的插件。

项目地址：[github.com/mapan0424/deepseek-harness-insights](https://github.com/mapan0424/deepseek-harness-insights)

## 许可证

MIT
