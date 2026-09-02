# @anarkhgatsby/deepseek-harness-channel-wecom

DeepSeek Harness 企业微信通道插件 —— **智能机器人 · WebSocket 长连接模式**。

机器人主动向企业微信建立 `wss` 长连接，**无需公网 IP、无需回调 URL、无需消息加解密**，本地/内网直接运行。收到消息后交给 DSH 网关（GatewayCore）路由到 Agent 处理，回复经流式消息（stream）原路返回。

> 协议对齐官方 `@wecom/aibot-node-sdk`（v1.0.7 实测验证）。

## 设计哲学

「一个 channel 一种协议，一个 channel 一个薄壳插件；消息总线只装一份。」本插件只做"平台门面"：注册 `wecom` settings namespace、接适配器、注册全局 `message` 工具；消息总线（路由/去重/投递/会话映射）统一在 `@anarkhgatsby/deepseek-harness-core` 的 `GatewayCore`。

## 架构

```
Harness Agent
     |
     v
 Cordis 通道插件（host: index.js）  <- harness-channel-wecom
     |  接 WecomAdapter
     v
 GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     |  统一消息总线：路由/去重/投递/流式回复/typing
     |  统一适配器接口 start()/send()/setTyping()/stop()
     v
 企业微信智能机器人适配器（WS 长连接，纯 IO 只连只收发）
```

## 特性

- 🔌 **WebSocket 长连接**：出站直连 `wss://openws.work.weixin.qq.com`，内网可部署
- 🔐 **免加解密**：安全握手内置于 wss 层，仅需 `botId` + `secret`
- 💓 **心跳保活**：30s ping + 指数退避自动重连（上限 10 次）
- 📨 **去重**：msgid 级去重（10 分钟 TTL），服务端重推不重复处理
- 💬 **双路发送**：
  - 被动回复：透传回调 `req_id`，`stream` 格式（finish=true 单条完成）
  - 主动发送：`aibot_send_msg`，支持 markdown（供 `message_wecom` 工具/通知使用）
- ⏱️ **6 分钟流式窗口**：窗口过期（errcode 846608）自动降级为主动发送

## 目录

- `index.js` — host 入口：注册 `wecom` settings namespace、接 WecomAdapter、启停网关、注册全局 `message_wecom` 工具、Typert remote `wecomGateway`
- `client.js` — web client：`TypertRemoteServiceLocator` 调 host 的 `wecomGateway` 读写配置；`modeMeta` 渲染配置卡片
- `lib/config.mjs` — `wecom` 配置 schema 与 `normalizeSettings`（宽松校验 + 默认值）
- `lib/adapters/wecom.mjs` — 企业微信智能机器人适配器：WS 长连接协议收发实现
- `cordis.patch.yml` — Cordis 补丁：`--patch` 注入本插件

## 前置条件（企业微信侧）

1. 企业微信管理后台 → **工作台 → 智能机器人 → 创建机器人 → 手动创建**
2. 选择 **API 模式创建**
3. 连接方式选择 **「使用长连接」**（⚠️ 与"设置接收消息回调地址"互斥，选错则收不到消息）
4. 记录页面生成的 **Bot ID** 和 **Secret**
5. **可见范围必须包含使用机器人的成员**（⚠️ 最常见故障点：可见范围没配，消息永远不会路由到机器人）

## 安装

```bash
# npm 安装打包产物
npm install @anarkhgatsby/deepseek-harness-channel-wecom-0.1.0.tgz
# 或本地开发 link
npm link /path/to/harness-channel-wecom
```

`ws` 为可选依赖（Node 内置 WebSocket 握手该网关偶发失败，建议装上）。

## 配置

在 `~/.dsh/settings.yaml` 添加：

```yaml
wecom:
  botId: "aibS9-XXXXXXXXXXXXXXXXXXXXXXXX"        # 机器人 Bot ID
  secret: "0Y3UNbXXXXXXXXXXXXXXXXXXXXXXXXXXXX"   # 长连接专用 Secret（非 Webhook 的 Token/AESKey）
  defaultWorkspace: "/Users/you/dsh/default"     # 默认工作区
  autoReply: true
  streamReplies: true
  allowlist: []                                  # 为空 = 不限；填 userid 列表则白名单
```

也可用环境变量：`WECOM_BOT_ID` / `WECOM_BOT_SECRET`。

> ⚠️ Secret 是长连接专用密钥，与 Webhook 模式的 Token/EncodingAESKey **不是一回事**。请妥善保管，避免泄露。

## 运行

重启 DSH（或重载插件），日志应出现：

```
[wecom] 连接 wss://openws.work.weixin.qq.com ...
[wecom] ✓ 握手成功，发送订阅
[wecom] ✓ 认证成功，开始接收消息
```

在企微 **工作台 → 智能机器人** 里点开机器人发消息即可对话。

## 消息类型支持

| 接收 | 说明 |
|------|------|
| text | 文本（完整支持） |
| voice | 语音（企微已转文本，直接可用） |
| image / file / mixed | 占位处理（`[image]`），媒体下载/解密接入开发中 |

| 发送 | 说明 |
|------|------|
| stream（被动回复） | 对话回复，markdown 渲染 |
| markdown（主动发送） | `message_wecom` 工具，单聊 target 填成员 userid |

## 全局工具

插件注册 `message_wecom` 工具，Agent 可主动发消息：

```json
{
  "action": "send",
  "channel": "wecom",
  "target": "MaPan",
  "message": "构建完成 ✅"
}
```

## 开发

```bash
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/wecom.mjs
```

## 排错

| 现象 | 原因/解决 |
|------|-----------|
| `853000 invalid bot_id or secret` | 凭据错误；确认是长连接页面的 BotID/Secret |
| 认证成功但收不到消息 | **检查可见范围**；确认发消息对象是这个机器人；群里需 @ |
| `40008 invalid message type` | 回复格式问题（必须 stream），本插件已内置正确格式 |
| 连接反复断开 | 另一处用同一 BotID 建了新连接（单 bot 单连接，新踢旧） |
| 重连次数超限停止 | 网络问题或凭据失效，修复后重启 DSH |

## License

MIT
