<div align="center">
  <p><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>
  <img src="docs/assets/app-icon.png" width="128" height="128" alt="DeepSeek Harness for macOS 图标">
  <h1>DeepSeek Harness for macOS</h1>
  <p><strong>保留 Harness 的完整能力，带来打开即用的 Mac 体验。</strong></p>
  <p>无需 Node.js、终端命令或运行环境配置。下载、打开，开始工作。</p>

  <p>
    <a href="https://github.com/mapan0424/deepseek-harness-desktop/releases/latest"><img src="https://img.shields.io/github/v/release/mapan0424/deepseek-harness-desktop?style=flat-square&label=release&color=111111" alt="GitHub Release"></a>
    <img src="https://img.shields.io/badge/macOS-12.7.6%2B-111111?style=flat-square&logo=apple" alt="macOS 12.7.6+">
    <img src="https://img.shields.io/badge/Apple%20Silicon-arm64-111111?style=flat-square" alt="Apple Silicon arm64">
    <img src="https://img.shields.io/badge/Intel-x86__64-111111?style=flat-square" alt="Intel x86_64">
    <img src="https://img.shields.io/badge/Windows-x86__64-111111?style=flat-square&logo=windows11" alt="Windows x86_64">
    <a href="LICENSE"><img src="https://img.shields.io/github/license/mapan0424/deepseek-harness-desktop?style=flat-square&color=111111" alt="MIT License"></a>
  </p>

  <p>
    <a href="https://github.com/mapan0424/deepseek-harness-desktop/releases/latest"><strong>下载最新版本</strong></a>
    · <a href="https://github.com/deepseek-ai/deepseek-harness">上游 Harness</a>
    · <a href="https://github.com/mapan0424/deepseek-harness-desktop/issues">问题与建议</a>
  </p>
</div>

<p align="center">
  <img src="docs/assets/deepseek-harness-macos.png" width="900" alt="DeepSeek Harness for macOS 产品界面">
</p>

<p align="center"><sub>一个 App，完整封装 Harness、官方 Node.js 与对应架构的原生依赖。</sub></p>

## ✨ 为什么值得使用

### 真正的开箱即用

无需提前安装或维护：

- Node.js
- npm / pnpm
- Homebrew
- DeepSeek Harness CLI
- 额外运行时与首次启动下载

下载对应 DMG，将 App 放入“应用程序”，打开即可开始。发行包固定并内置完整运行环境，不会受到全局 Node 版本、PATH 或包管理器状态影响。

### 保留 Harness 的完整体验

这不是功能缩水的聊天壳。客户端直接承载 DeepSeek Harness Web UI，持续保留其核心能力：

- 多轮会话与流式回复
- Markdown 与代码内容
- 工作区和上下文管理
- 工具调用与审批流程
- 模型、凭据和插件配置
- Harness 上游持续演进的交互体验
- 内置 **Harness Insights**：本地 Token、模型和工具使用洞察，支持 Golden Ratio 活跃热力图与双主题
- 内置**全渠道消息网关**：可视化配置、飞书 / Lark、企业微信 / WeCom，以及 macOS 上的 iMessage
- 内置**多语言与民族语言包**：支持藏文、传统蒙古文、维吾尔文、凉山彝文、繁体中文、日文、韩文等无缝即时切换

桌面层不重复发明 Harness，而是让它在桌面系统上运行得更自然。内置插件以独立 Cordis 架构开发，与上游源码解耦，随安装包统一开箱交付。

### 消息通道

安装包会预置已验证的消息通道插件，打开 Harness 后可在设置中的“消息通道”页面直接配置：

- **可视化配置**：统一管理通道参数、授权状态、默认工作区和会话状态；
- **飞书 / Lark**：配置企业自建应用后，支持 WebSocket 长连接实时接收事件与开放 API 卡片/文本流式回复；
- **企业微信 / WeCom**：配置自建应用凭据后，即可将企业微信对话与本地 Harness 智能体无缝打通；
- **iMessage**：仅 macOS 提供，支持本地 Messages/chat.db 模式；首次使用需要授予完全磁盘访问和自动化权限。

Windows 安装包不会携带 iMessage 插件，配置页面也不会显示 iMessage，避免出现不可用入口。

### 🌐 多语言与民族语言支持 (Locale Pack)

客户端预置了强大的本地化语言包，支持在设置中即时切换显示语言，包含：
- **少数民族语言**：藏文 (བོད་ཡིག)、传统蒙古文 (ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ)、维吾尔文 (ئۇيغۇرچە)、凉山彝文 (ꆈꌠꉙ)；
- **多国与地区语言**：繁体中文 (繁體中文)、日文 (日本語)、韩文 (한국어)、法文 (Français)、德文 (Deutsch)、俄文 (Русский)、西班牙文 (Español) 及英文 (English)。

### 更像一个真正的 Mac App

- 独立窗口与 Dock 入口
- 自动启动本地 Harness 服务
- 自动选择可用端口
- 启动完成后直接进入工作台
- 关闭窗口后驻留系统托盘，再次打开无需重新等待 Harness 启动
- 左键托盘图标查看本周 Token、模型调用、7 日趋势和 Token 构成
- 右键托盘图标查看本周摘要，并打开或退出 DeepSeek Harness
- dsh 意外退出时自动原端口恢复一次，失败后进入本地恢复页
- 从托盘或系统菜单退出时自动回收后台进程
- 使用 macOS 系统 WebView，不额外携带 Chromium
- 无需保留终端窗口或手动管理本地服务

### 本地运行，数据由你掌控

Harness 服务只监听本机 `127.0.0.1`。会话、设置、工作区和凭据继续由本地 Harness 管理；桌面客户端不会为了启动 UI 将本地服务暴露到局域网。

模型请求的目标和数据处理方式取决于你在 Harness 中选择的模型服务与配置。

### 旧设备兼容矩阵

不把仍在使用的 Intel Mac 排除在外。每种架构都有独立的安装包、Node.js 运行时和原生依赖，减少混合架构带来的体积与兼容性问题。

| 平台 | 发布包 | 状态 | 自动化验证 |
| --- | --- | --- | --- |
| macOS 12.7.6+ Apple Silicon | `DeepSeek.Harness_*_macos_arm64.dmg` | 支持 | arm64 App、最低系统版本、原生模块、内置运行时与 Markdown/WebKit 兼容性 |
| macOS 12.7.6+ Intel | `DeepSeek.Harness_*_macos_x86_64.dmg` | 支持 | Intel App、x86_64 原生模块、最低系统版本、内置运行时与 Markdown/WebKit 兼容性 |
| Windows 10 / 11 x64 | `setup.exe` 或 `*.msi` | 支持 | x86_64 安装包、展开后的运行时、原生依赖、Markdown 与 bundle 完整性 |

macOS 12.7.6 是当前发行包声明的最低版本；Intel 和 Apple Silicon 使用对应架构的 DMG。矩阵反映发行包和自动化检查结果，具体性能与 WebKit 行为仍可能受设备型号和系统补丁版本影响。

## 🚀 下载与安装

前往 [GitHub Releases](https://github.com/mapan0424/deepseek-harness-desktop/releases/latest)，根据系统和处理器选择安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS Apple Silicon（M1 / M2 / M3 / M4 等） | `DeepSeek.Harness_*_macos_arm64.dmg` |
| macOS Intel | `DeepSeek.Harness_*_macos_x86_64.dmg` |
| Windows 10 / 11 x64（推荐） | `DeepSeek.Harness_*_windows_x86_64-setup.exe` |
| Windows x64 企业部署 | `DeepSeek.Harness_*_windows_x86_64.msi` |

### macOS

1. 打开 DMG；
2. 将 `DeepSeek Harness.app` 拖入“应用程序”；
3. 启动 App，并在 Harness 中配置需要使用的模型或 API 凭据。

如果 macOS 首次打开时阻止运行，请确认文件来自本仓库 Release，再执行：

```bash
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

### Windows

1. 下载并运行 `setup.exe`；
2. 完成安装后从开始菜单打开 DeepSeek Harness；
3. 在 Harness 中配置需要使用的模型或 API 凭据。

MSI 主要用于企业或批量部署。Windows 10/11 通常已内置应用所需的 Microsoft Edge WebView2 Runtime。

### 自动更新

从 `v0.2.0` 起，已安装的桌面 App 会在启动完成后延迟检查 GitHub Releases。发现新版本时，App 会先显示更新说明；确认后自动下载、停止本地 dsh、安装并重启到新版本。macOS Apple Silicon、macOS Intel 和 Windows x64 都使用各自架构的签名更新包。

`v0.1.9` 及更早版本没有自动更新能力，需要手动安装一次 `v0.2.0`；之后的版本即可在 App 内完成后续更新。

## 🧭 它如何工作

```text
DeepSeek Harness.app
├── 原生 macOS / Windows 窗口与系统托盘
├── Rust / Tauri 桌面层
│   ├── 启动内置运行时
│   ├── 选择本地端口与端口自愈
│   ├── 等待服务就绪
│   └── 管理进程生命周期
├── 官方 Node.js 运行时
├── DeepSeek Harness 核心 (Agent / Session / LLM)
├── 内置插件矩阵 (Cordis Plugins)
│   ├── Harness Insights (Token / 模型用量看板)
│   ├── Harness Channels (飞书 / 企微 / iMessage / 设置界面)
│   └── Harness Locale Pack (多语言与民族语言包)
└── 系统 WebView
    └── Harness Web UI
```

正式发行包直接从 App Resources 运行唯一一份内置 runtime，不在首次启动时下载或解压第二份副本。桌面层负责环境和生命周期，Harness 负责 Agent、会话、模型、工具及插件能力。

## 🌊 项目愿景

我们希望它不只是“能启动 Harness 的外壳”，而是一个长期可靠的 macOS 入口：

- **降低门槛**：让更多人无需理解 Node.js 工具链也能使用 Harness；
- **忠于上游**：尽可能保持 Harness 的能力、交互和插件生态；
- **尊重平台**：逐步完善菜单、快捷键、通知、文件交互和自动更新；
- **兼顾旧设备**：在合理范围内继续支持仍有价值的 Intel Mac 与旧版 macOS；
- **本地优先**：把运行环境、进程和数据边界保持在用户可理解、可掌控的范围内；
- **可复现分发**：锁定并验证运行时、架构和依赖，让同一版本拥有一致体验。

如果你希望 Harness 成为每天都能从 Dock 打开的生产力工具，欢迎试用、反馈和参与改进。

## 🛠️ 开发

### 环境

- macOS
- Node.js
- pnpm
- Rust toolchain
- Xcode Command Line Tools

### 本地运行

```bash
pnpm install
pnpm tauri dev
```

### 构建 Apple Silicon

```bash
pnpm build:macos
```

产物：

```text
src-tauri/target/release/bundle/dmg/DeepSeek Harness_<version>_aarch64.dmg
```

### 构建 Intel Mac

```bash
pnpm build:macos:intel
```

产物：

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/DeepSeek Harness_<version>_x64.dmg
```

### 构建 Windows x64

Windows 安装包由原生 Windows GitHub Actions Runner 构建：

```text
Actions → Build Windows x64 → Run workflow
```

也可以在 Windows x64 开发机运行：

```bash
pnpm build:windows
```

构建流程会自动：

- 下载并校验对应架构的官方 Node.js；
- 安装固定版本的 Harness 生产依赖；
- 保留对应架构的原生模块；
- 应用 macOS 12.7.6 WebKit 兼容处理；
- 验证 Markdown 行为、Mach-O 架构与最低系统版本；
- 生成 npm 与 Rust/Tauri 第三方许可证报告；
- 检查运行时只有一份，不产生首次启动缓存副本；
- 内置并验证独立的 Harness Insights 插件。

## 🤝 贡献

欢迎通过 [Issues](https://github.com/mapan0424/deepseek-harness-desktop/issues) 提交：

- macOS 或 Windows 兼容性问题
- Intel、Apple Silicon 或 Windows x64 运行反馈
- 桌面体验建议
- 构建与分发改进
- 上游 Harness 升级适配

提交问题时建议附上 macOS 版本、处理器架构和可公开的错误信息，请勿上传 API Key 或其他凭据。

## 📄 许可证与声明

桌面外壳采用 [MIT License](LICENSE)。DeepSeek Harness 及其他内置组件保留各自的版权和许可证；完整第三方说明见 [`src-tauri/legal/THIRD_PARTY_NOTICES.md`](src-tauri/legal/THIRD_PARTY_NOTICES.md)。

本项目由社区独立开发和分发，不是 DeepSeek 官方产品，也不代表获得 DeepSeek 的赞助、认可或背书。“DeepSeek”与“DeepSeek Harness”仅用于说明兼容的上游项目。

## 🔗 相关项目

- [DeepSeek Harness (上游核心)](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness Plugins (官方与社区插件矩阵)](https://github.com/mapan0424/deepseek-harness-plugins)
- [DeepSeek Harness 官方网站](https://deepseek.com/harness)

## 🌐 友情链接 (Links)

- [LINUX DO 社区](https://linux.do)
