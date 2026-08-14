# DeepSeek Harness for macOS

这是一个 Tauri macOS 客户端：使用原生窗口和生命周期管理，主界面复用 DeepSeek Harness 官方 Web UI，保证完整的会话、Markdown、流式输出、工具调用和审批体验。

> 本项目是非官方的第三方 macOS 客户端，不代表 DeepSeek 官方产品或官方背书。原项目采用 MIT License；发行包内包含许可证和第三方依赖声明。

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

## 后续发布工作

- 增加 Intel / Universal 构建；
- 将 API Key、Harness Home 和工作区迁移到 macOS Application Support；
- 增加原生菜单、工作区选择、权限确认和自动更新；
- 发布前完成 Apple Developer ID 签名和公证。
