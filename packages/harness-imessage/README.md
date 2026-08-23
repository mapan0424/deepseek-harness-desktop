# harness-imessage

DeepSeek Harness 的一个统一 iMessage 通道插件。把「本地 Mac imsg」「Photon 云端托管线路」「云中继（Claw Messenger / Sendblue）」三种 iMessage 接法收敛到**一条消息总线**之后，通过 `mode` 切换传输，无需改动数据面。

## 设计哲学

DeepSeek Harness Desktop 的卖点是「给普通人开箱即用」。iMessage 是 Apple 私有协议，没有官方开放 API，所以把它做成**可选插件（cordis patch overlay）**，而不是默认门槛：

- 默认不强制、不要求关 SIP；
- 本地 imsg 是数据不出机的正统做法，但需要 Mac + Messages.app + 「自动化/全盘访问」授权；
- Photon / 云中继是「开箱即用」路径，但数据会经过第三方云。

三种通道统一走 `imessageGateway`（Typert remote）配置页 + `GatewayCore` 消息总线，切换零改动。

## 架构

```
Harness Agent
     │
     ▼
 Cordis 通道插件（host: index.js）
     │  按 mode 选适配器
     ▼
 GatewayCore（统一消息总线：路由/去重/投递/流式回复/typing）
     │  统一适配器接口 start()/send()/setTyping()/stop()
     ▼
 ┌────────────┬─────────────┬─────────────┐
 │ imsg 适配器 │ photon 适配器│  relay 适配器 │
 │ (本地 RPC)  │ (云 WS)       │ (云轮询/HTTP) │
 └────────────┴─────────────┴─────────────┘
```

## 目录

- `index.js` — host 入口：注册 settings namespace、选适配器、启停网关、注册全局 `message` 工具、Typert remote。
- `client.js` — web client：`TypertRemoteServiceLocator` 调 host 的 `imessageGateway` 读写配置；`modeMeta` 渲染三种模式卡片。
- `lib/gateway-core.mjs` — 消息总线核心：路由、去重、投递 agent、取回复回发、流式回复/工具提示、typing keepalive。
- `lib/config.mjs` — 统一配置 schema 与 `normalizeSettings`（宽松校验 + 默认值）。
- `lib/adapters/imsg.mjs` — 本地 iMessage：`imsg rpc`（JSON-RPC over stdio）。
- `lib/adapters/photon.mjs` — Photon 云端：Spectrum WebSocket，device flow 授权。
- `lib/adapters/relay.mjs` — 云中继：Claw Messenger / Sendblue HTTP 抽象。
- `cordis.patch.yml` — Cordis 补丁：`--patch` 注入本插件（与 insights 同构）。

## 使用（本地 imsg 优先）

1. 确保 Mac 已登录 Messages.app，并授予终端「自动化 + 全盘访问」。
2. 安装 imsg CLI（用于 `imsg rpc`）。
3. 在 dsh web 设置 → iMessage，选择 `imsg` 并保存。
4. host 启动 `imsg rpc` 监听；收到消息 → 按 sender 路由工作区 → agent 自动回复。

## 三种模式对比

| 模式 | 数据 | 设备要求 | 授权 | 能力 |
|------|------|---------|------|------|
| `imsg` | 本机 | Mac + Messages | 自动化/全盘访问 | 收发/附件/群聊/tapback（高级需关 SIP） |
| `photon` | 第三方云 | 无 | RFC 8628 浏览器 | 纯文本一对一 |
| `relay` | 第三方云 | 无 | API key | Claw/Sendblue 支持的能力 |

## 开发

```bash
# 语法校验
node --check index.js
node --check client.js
node --check lib/gateway-core.mjs
node --check lib/config.mjs
node --check lib/adapters/imsg.mjs
node --check lib/adapters/photon.mjs
node --check lib/adapters/relay.mjs
```

Lices: MIT。
