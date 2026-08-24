# harness-channel-qq

DeepSeek Harness 的一个 QQ 通道插件（薄壳），走 **OneBot v11**（NapCat / Lagrange / LLOneBot 的 WebSocket 端点）。

这是**跨协议扩展样板**：它和 `harness-channel-imessage`（iMessage）共用同一个消息总线核心 `@anarkhgatsby/deepseek-harness-core`，只替换了 channel 配置命名空间和适配器。

## 设计哲学

「一个 channel 一种协议，一个 channel 一个薄壳插件；消息总线只装一份。」加新通道只需：新建一个薄壳插件包，复制一份 adapter（连平台协议），从 `harness-core` 导入 `GatewayCore`，改配置命名空间。骨架不动，心智负担接近零。

## 架构

```
Harness Agent
     │
     ▼
 Cordis 通道插件（host: index.js）  ← harness-channel-qq
     │  接 QQAdapter (OneBot v11)
     ▼
 GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     │  统一消息总线：路由/去重/投递/流式回复/typing
     │  统一适配器接口 start()/send()/setTyping()/stop()
     ▼
 ┌──────────────────────────────┐
 │  OneBot v11 适配器 (WS)        │
 │  NapCat / Lagrange / LLOneBot │
 └──────────────────────────────┘
```

## 目录

- `index.js` — host 入口：注册 `qq` settings namespace、接 QQAdapter、启停网关、注册全局 `message` 工具、Typert remote `qqGateway`。
- `client.js` — web client：`TypertRemoteServiceLocator` 调 host 的 `qqGateway` 读写配置；`modeMeta` 渲染配置卡片。
- `lib/config.mjs` — `qq` 配置 schema 与 `normalizeSettings`（宽松校验 + 默认值）。
- `lib/adapters/qq.mjs` — OneBot v11 适配器：WS 连接、事件推送解析（text/image/at/reply）、私聊与群聊发送。
- `cordis.patch.yml` — Cordis 补丁：`--patch` 注入本插件。

## 前置条件

1. 用一个 OneBot v11 实现把 bot 接入 QQ。常用：
   - [NapCat](https://github.com/NapNeko/NapCatQQ)（推荐，功能全）
   - [Lagrange.Core](https://github.com/LagrangeDev/Lagrange.Core)
   - [LLOneBot](https://github.com/LLOneBot/LLOneBot)
2. 配置 OneBot 起一个 **WebSocket 逆向客户端**（连接 `ws://127.0.0.1:3001` 或你指定端口），或正向服务端。
3. 若有 token（`access_token`），在 `qq.token` 填上（走 `Authorization: Bearer` 头）。

## 使用

1. 在 dsh web 设置 → QQ，填 `wsUrl`（如 `ws://127.0.0.1:3001`）与 `token`（可选），保存。
2. host 连接 OneBot WS；收到消息 → 按 sender 路由工作区 → agent 自动回复。
3. 私聊目标传 QQ 号；群聊目标传 `group:<群号>`（适配器自动分发到私聊/群聊 API）。

## 出站目标格式

| 目标 | 格式 | 说明 |
|------|------|------|
| 私聊 | `10001` | 单个 QQ 号 |
| 群聊 | `group:123456` | 群号前缀 `group:` |

## 开发

```bash
# 语法校验
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/qq.mjs
```

License: MIT。
