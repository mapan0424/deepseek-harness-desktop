# harness-channel-dingtalk

DeepSeek Harness 的一个钉钉通道插件（薄壳）。开放 API。机器人 + Stream 模式收/发；需创建钉钉企业内部应用拿 appKey/appSecret，可配 Stream 模式（免公网 webhook）。

与 `harness-channel-qq`/`harness-channel-feishu` 共用同一个消息总线核心 `@anarkhgatsby/deepseek-harness-core`，只替换了 channel 配置命名空间（dingtalk）和适配器。

## 设计哲学

「一个 channel 一种协议，一个 channel 一个薄壳插件；消息总线只装一份。」加新通道只需：新建一个薄壳插件包，复制一份 adapter（连平台协议），从 `harness-core` 导入 `GatewayCore`，改配置命名空间。骨架不动，心智负担接近零。

## 架构

```
Harness Agent
     |
     v
 Cordis 通道插件（host: index.js）  <- harness-channel-dingtalk
     |  接 DingtalkAdapter
     v
 GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     |  统一消息总线：路由/去重/投递/流式回复/typing
     |  统一适配器接口 start()/send()/setTyping()/stop()
     v
 钉钉 适配器（纯 IO，只连只收发）
```

## 目录

- `index.js` — host 入口：注册 `dingtalk` settings namespace、接 DingtalkAdapter、启停网关、注册全局 `message` 工具、Typert remote `dingtalkGateway`。
- `client.js` — web client：`TypertRemoteServiceLocator` 调 host 的 `dingtalkGateway` 读写配置；`modeMeta` 渲染配置卡片。
- `lib/config.mjs` — `dingtalk` 配置 schema 与 `normalizeSettings`（宽松校验 + 默认值）。
- `lib/adapters/dingtalk.mjs` — 钉钉适配器：协议收发实现。
- `cordis.patch.yml` — Cordis 补丁：`--patch` 注入本插件。

## 前置条件

需创建钉钉企业内部应用（开发者后台），拿 appKey/appSecret；机器人启用二进/Stream 模式，或配置公网回调。

## 使用

1. 在 dsh web 设置 → 钉钉，填充 appKey/appSecret 等，保存。
2. host 连接钉钉；收到消息 → 按 sender 路由工作区 → agent 自动回复。

## 开发

```bash
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/dingtalk.mjs
```

License: MIT。
