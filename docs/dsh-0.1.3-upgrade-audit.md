# DSH 0.1.3-alpha.1 升级审计

本文件记录桌面端从 `@deepseek-ai/dsh 0.1.2-rc.1` 升级到
`0.1.3-alpha.1` 时对本地兼容层的处理决定。

## 运行时准备

- 三个平台的 bundled runtime 目标版本统一为 `0.1.3-alpha.1`。
- 准备脚本会先查询 npm registry；目标包尚未发布时会在删除旧 runtime 之前失败，避免破坏本地构建环境。
- Node.js 版本保持 `22.23.2`，不随 DSH 升级变更。

## 兼容性补丁

| 补丁 | 决定 | 当前处理 |
| --- | --- | --- |
| GFM email autolink | MODIFY | 继续使用精确字符串匹配；只允许目标 frontend 中恰好一个旧表达式，结构变化直接失败。 |
| ES class static blocks | MODIFY | 保留旧 WebKit 兼容转换；新版 bundle 若不再包含目标结构则不修改，最终验证仍拒绝残留的 `static {`。 |
| `Promise.withResolvers` | MODIFY | 保留 polyfill，并改为带固定 id 的幂等注入与验证，避免同名业务代码造成误判。 |
| `READY_MARKUP` | MODIFY | 仅在上游仍使用旧直接调用时替换；验证阶段仍会拒绝不带 fallback 的直接调用。 |
| Desktop loopback auth | KEEP | 这是桌面端本地服务的行为适配，不属于 DSH 版本本身的已知修复。 |
| macOS titlebar drag/maximize | KEEP | 这是 Tauri 原生窗口交互适配，与上游 DSH 版本无关。 |

## GatewayCore streaming

`agent/assistant-stream` 的实时文本分片由 GatewayCore 接收并合并后发送；Session 中的最终 settlement 作为历史事实来源。已增加以下保护：

- 同一个 session 不重复发送实时分片和最终 `assistant/message`。
- 不同 session 使用独立的发送计数，避免并发通道相互影响。
- `abandoned` attempt（例如取消回复）不会把半截文本发送到外部通道。
- 不支持新事件的旧 runtime 仍回退到原有 Session 轮询路径。

## 当前阻塞

截至本次审计，`@deepseek-ai/dsh@0.1.3-alpha.1` 及其相关运行时包尚未出现在 npm registry，因此还不能完成真实的三平台 runtime 重建、bundle patch 审计和安装包验证。目标包可安装后，必须重新运行全部兼容性与平台构建测试。
