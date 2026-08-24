# harness-channel-discord

DeepSeek Harness 的一个 Discord 通道插件（薄壳）。Bot 网关。官方开放。需创建应用拿 token。

与 `harness-channel-imessage`/`harness-channel-qq` 共用同一个消息总线核心 `@anarkhgatsby/deepseek-harness-core`，只替换了 channel 配置命名空间（discord）和适配器。

## 设计哲学

「一个 channel 一种协议，一个 channel 一个薄壳插件；消息总线只装一份。」加新通道只需：新建一个薄壳插件包，复制一份 adapter（连平台协议），从 `harness-core` 导入 `GatewayCore`，改配置命名空间。骨架不动，心智负担接近零。

## 架构

```
Harness Agent
     |
     v
 Cordis 通道插件（host: index.js）  <- harness-channel-discord
     |  接 DiscordAdapter
     v
 GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     |  统一消息总线：路由/去重/投递/流式回复/typing
     |  统一适配器接口 start()/send()/setTyping()/stop()
     v
 Discord 适配器（纯 IO，只连只收发）
```

## 目录

- `index.js` — host 入口：注册 `discord` settings namespace、接 DiscordAdapter、启停网关、注册全局 `message` 工具、Typert remote `discordGateway`。
- `client.js` — web client：`TypertRemoteServiceLocator` 调 host 的 `discordGateway` 读写配置；`modeMeta` 渲染配置卡片。
- `lib/config.mjs` — `discord` 配置 schema 与 `normalizeSettings`（宽松校验 + 默认值）。
- `lib/adapters/discord.mjs` — Discord 适配器：协议收发实现。
- `cordis.patch.yml` — Cordis 补丁：`--patch` 注入本插件。

## 前置条件

Bot 网关。官方开放。需创建应用拿 token。

## 使用

1. 在 dsh web 设置 → Discord，填充所需字段，保存。
2. host 连接 Discord；收到消息 → 按 sender 路由工作区 → agent 自动回复。

## 开发

```bash
# 语法校验
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/discord.mjs
```

License: MIT。
