# harness-channel-imessage

DeepSeek Harness 的本机 iMessage 通道插件。插件只通过 macOS 的 `Messages.app` 和本地 `chat.db` 收发消息，不使用 `imsg` CLI、Photon 或任何云中继。

## 隐私设计

- 消息数据不经过第三方云服务。
- 入站消息从 `~/Library/Messages/chat.db` 只读轮询。
- 出站消息通过 macOS `/usr/bin/osascript` 控制 `Messages.app` 发送。
- 不需要安装额外的 CLI，也不需要配置云端 API Key。
- 需要为 DeepSeek Harness 授予“完全磁盘访问”和“自动化 → 信息”权限。

## 架构

```
Harness Agent
     │
     ▼
Cordis 通道插件（host: index.js）
     │
     ▼
GatewayCore（来自 @anarkhgatsby/deepseek-harness-core）
     │  统一消息总线：路由 / 去重 / 投递 / 流式回复
     ▼
LocalAdapter
     ├── chat.db：读取入站消息
     └── Messages.app：发送出站消息
```

## 配置

插件保留 `local` 模式作为兼容标识，但当前没有模式选择项。配置页面只展示：

- `chatDb`：Messages 数据库路径，默认 `~/Library/Messages/chat.db`
- `defaultWorkspace`：默认工作空间路径
- 自动回复
- 流式回复

收到消息后，插件会根据 sender 路由到对应工作空间，并由 Harness Agent 自动回复。

## 代码结构

- `index.js` — 注册 `imessage` settings namespace、启动本地网关和 `message_imessage` 工具。
- `client.js` — 导出本地模式的客户端元数据。
- `lib/config.mjs` — 本地模式配置 schema 与归一化逻辑。
- `lib/adapters/local.mjs` — `chat.db` 监听与 `Messages.app` AppleScript 发送。
- `cordis.patch.yml` — Cordis 补丁入口。

## 开发

```bash
node --check index.js
node --check client.js
node --check lib/config.mjs
node --check lib/adapters/local.mjs
```

License: MIT。
