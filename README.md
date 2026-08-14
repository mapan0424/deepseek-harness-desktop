# DeepSeek Harness for macOS（非官方客户端）

这是一个非官方 Tauri macOS 客户端：使用原生窗口和生命周期管理，主界面复用 DeepSeek Harness Web UI，保证完整的会话、Markdown、流式输出、工具调用和审批体验。

> **非官方声明：** 本项目由第三方独立开发和分发，不是 DeepSeek 官方产品，未经 DeepSeek 赞助、认可或背书，也不代表与 DeepSeek 存在隶属关系。“DeepSeek”和“DeepSeek Harness”仅用于说明兼容或内置的上游项目。MIT 代码许可不授予商标权。

## 开发运行

```bash
pnpm install
pnpm tauri dev
```

开发版启动时会自动调用：

```bash
npx --yes @deepseek-ai/dsh web --port 3080
```

开发版需要 Node.js、可用的 `@deepseek-ai/dsh` 包，以及按 DeepSeek Harness 文档配置的 API Key。

## 构建 macOS App

```bash
pnpm build:macos
```

正式构建会把 Node.js、dsh 和生产依赖打进 App。用户不需要安装 pnpm、Node.js，也不需要首次启动时下载 dsh。产物位于 `src-tauri/target/release/bundle/`。

当前构建目标为 Apple Silicon（aarch64）。

## 已完成

- 正式包内置 dsh 运行时；
- 3080 被占用时自动选择可用端口；
- 启动失败时显示 dsh 实际日志；
- App 退出时自动回收本地 dsh 进程。

## 许可证与分发

- 桌面外壳采用 [MIT License](LICENSE)；
- 内置 DeepSeek Harness 采用 MIT License，其版权与完整许可文本随发行包保留；
- 构建时会从实际内置的 npm 依赖闭包生成精确的包名、版本和许可证清单；
- Node.js 的完整许可证及 bundled-component notices 会随内置运行时分发；
- 构建时会从锁定的 Cargo 依赖图生成并打包 Rust/Tauri 完整许可证报告；
- 详细说明见 [`src-tauri/legal/THIRD_PARTY_NOTICES.md`](src-tauri/legal/THIRD_PARTY_NOTICES.md)。

> 发布二进制前必须复核自动生成的 npm 与 Rust/Tauri 许可证报告；生成失败时构建会中止。

## 后续发布工作

- 增加 Intel / Universal 构建；
- 将 API Key、Harness Home 和工作区迁移到 macOS Application Support；
- 增加原生菜单、工作区选择、权限确认和自动更新；
- 持续复核自动生成的第三方许可证报告；
- 确认应用图标、名称和营销素材不暗示 DeepSeek 官方身份；
- 发布前完成 Apple Developer ID 签名和公证。
