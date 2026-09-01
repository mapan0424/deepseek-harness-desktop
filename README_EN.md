<div align="center">
  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
  <img src="docs/assets/app-icon.png" width="128" height="128" alt="DeepSeek Harness for macOS icon">
  <h1>DeepSeek Harness for macOS</h1>
  <p><strong>The full power of Harness, packaged as a Mac app you can simply open and use.</strong></p>
  <p>No Node.js setup, terminal commands, or runtime maintenance. Download, launch, and get to work.</p>

  <p>
    <a href="https://github.com/mapan0424/deepseek-harness-desktop/releases/latest"><img src="https://img.shields.io/github/v/release/mapan0424/deepseek-harness-desktop?style=flat-square&label=release&color=111111" alt="GitHub Release"></a>
    <img src="https://img.shields.io/badge/macOS-12.7.6%2B-111111?style=flat-square&logo=apple" alt="macOS 12.7.6+">
    <img src="https://img.shields.io/badge/Apple%20Silicon-arm64-111111?style=flat-square" alt="Apple Silicon arm64">
    <img src="https://img.shields.io/badge/Intel-x86__64-111111?style=flat-square" alt="Intel x86_64">
    <img src="https://img.shields.io/badge/Windows-x86__64-111111?style=flat-square&logo=windows11" alt="Windows x86_64">
    <a href="LICENSE"><img src="https://img.shields.io/github/license/mapan0424/deepseek-harness-desktop?style=flat-square&color=111111" alt="MIT License"></a>
  </p>

  <p>
    <a href="https://github.com/mapan0424/deepseek-harness-desktop/releases/latest"><strong>Download the latest release</strong></a>
    · <a href="https://github.com/deepseek-ai/deepseek-harness">Upstream Harness</a>
    · <a href="https://github.com/mapan0424/deepseek-harness-desktop/issues">Issues & ideas</a>
  </p>
</div>

<p align="center">
  <img src="docs/assets/deepseek-harness-macos.png" width="900" alt="DeepSeek Harness for macOS interface">
</p>

<p align="center"><sub>One app containing Harness, official Node.js, and native dependencies for your Mac architecture.</sub></p>

## ✨ Why use it

### Ready out of the box

You do not need to install or maintain:

- Node.js
- npm or pnpm
- Homebrew
- the DeepSeek Harness CLI
- extra runtimes or first-launch downloads

Download the right DMG, move the app to Applications, and launch it. Every release carries a pinned, self-contained runtime, unaffected by your global Node version, `PATH`, or package manager state.

### The complete Harness experience

This is not a reduced chat wrapper. It hosts the DeepSeek Harness Web UI directly and preserves the capabilities that make Harness useful:

- multi-turn sessions and streaming responses
- Markdown and code rendering
- workspaces and context management
- tool calls and approval flows
- model, credential, and plugin configuration
- an experience that can evolve with upstream Harness
- bundled **Harness Insights** for local Token, model, and tool usage analytics
- bundled messaging channels: visual configuration, Feishu / Lark, and iMessage on macOS

The desktop layer does not reinvent Harness. It makes Harness feel at home on desktop systems. Harness Insights is developed as an independent Cordis plugin, kept separate from upstream source, and delivered inside the same installer.

### Messaging channels

The installer includes the validated channel plugins. After launching Harness, configure them from the **Message Channels** settings page:

- **Visual configuration** for channel parameters, authorization state, and sessions;
- **Feishu / Lark** after configuring an enterprise custom app;
- **iMessage** on macOS, including the local Messages/chat.db mode. The first use requires Full Disk Access and Automation permissions.

The Windows installer does not ship the iMessage plugin, and iMessage is hidden from its configuration page because Messages.app is macOS-only.

### A proper Mac app

- a dedicated window and Dock entry
- automatic startup of the local Harness service
- automatic selection of an available port
- direct entry into the workspace once startup completes
- close-to-tray behavior, so reopening the window does not restart Harness
- left-click tray panel for weekly Tokens, model calls, a seven-day chart, and Token breakdown
- right-click tray summary with open and quit actions
- one automatic same-port recovery when dsh exits unexpectedly, followed by a local recovery page if needed
- automatic cleanup of background processes when the app quits from the tray or system menu
- the macOS system WebView instead of a bundled Chromium runtime
- no terminal window or manually managed local server

### Local-first by design

The Harness service listens only on `127.0.0.1`. Sessions, settings, workspaces, and credentials remain under local Harness management, and the desktop app does not expose the UI service to your local network.

Where model requests go—and how providers process them—depends on the model service you configure in Harness.

### Legacy-device compatibility matrix

Intel Macs that are still useful should not be left behind. Each architecture receives its own installer, Node.js runtime, and native dependencies, reducing the size and compatibility problems caused by mixed-architecture bundles.

| Platform | Release package | Status | Automated verification |
| --- | --- | --- | --- |
| macOS 12.7.6+ Apple Silicon | `DeepSeek.Harness_*_macos_arm64.dmg` | Supported | arm64 app, minimum OS, native modules, embedded runtime, and Markdown/WebKit compatibility |
| macOS 12.7.6+ Intel | `DeepSeek.Harness_*_macos_x86_64.dmg` | Supported | Intel app, x86_64 native modules, minimum OS, embedded runtime, and Markdown/WebKit compatibility |
| Windows 10 / 11 x64 | `setup.exe` or `*.msi` | Supported | x86_64 installers, expanded runtime, native dependencies, Markdown, and bundle integrity |

macOS 12.7.6 is the minimum version declared by the current release. Intel and Apple Silicon use their matching DMG. This matrix describes release artifacts and automated checks; performance and WebKit behavior can still vary by device model and system patch level.

## 🚀 Download and install

Open [GitHub Releases](https://github.com/mapan0424/deepseek-harness-desktop/releases/latest) and choose the package for your platform and processor:

| Platform | Package |
| --- | --- |
| macOS Apple Silicon (M1, M2, M3, M4, and later) | `DeepSeek.Harness_*_macos_arm64.dmg` |
| macOS Intel | `DeepSeek.Harness_*_macos_x86_64.dmg` |
| Windows 10 / 11 x64 (recommended) | `DeepSeek.Harness_*_windows_x86_64-setup.exe` |
| Windows x64 enterprise deployment | `DeepSeek.Harness_*_windows_x86_64.msi` |

### macOS

1. Open the DMG.
2. Drag `DeepSeek Harness.app` into Applications.
3. Launch the app and configure your preferred model or API credentials in Harness.

If macOS blocks the first launch, verify that the file came from this repository's Release page, then run:

```bash
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

### Windows

1. Download and run `setup.exe`.
2. Open DeepSeek Harness from the Start menu after installation.
3. Configure your preferred model or API credentials in Harness.

MSI is primarily intended for enterprise or managed deployment. Windows 10 and 11 normally include the required Microsoft Edge WebView2 Runtime.

### Automatic updates

Starting with `v0.2.0`, an installed desktop app checks GitHub Releases after startup has settled. When a newer release is available, the app shows its notes first; after confirmation it downloads the signed package, stops the local dsh process, installs the update, and restarts. macOS Apple Silicon, macOS Intel, and Windows x64 each use their matching signed updater package.

`v0.1.9` and earlier do not have updater support, so they require one manual install of `v0.2.0`. Later releases can be installed from inside the app.

## 🧭 How it works

```text
DeepSeek Harness.app
├── Native macOS window
├── Rust / Tauri desktop layer
│   ├── Starts the embedded runtime
│   ├── Selects a local port
│   ├── Waits for the service to become ready
│   └── Manages process lifecycle
├── Official Node.js
├── DeepSeek Harness
└── macOS system WebView
    └── Harness Web UI
```

Production builds run one embedded runtime directly from App Resources. Nothing is downloaded or unpacked into a second runtime copy on first launch. The desktop layer owns the environment and lifecycle; Harness owns agents, sessions, models, tools, and plugins.

## 🌊 Vision

The goal is not merely to make Harness launchable. It is to build a dependable macOS home for Harness:

- **Lower the barrier:** make Harness useful without requiring knowledge of the Node.js toolchain.
- **Stay faithful upstream:** preserve Harness capabilities, interaction patterns, and plugin ecosystem.
- **Respect the platform:** progressively improve menus, shortcuts, notifications, file interactions, and updates.
- **Keep valuable hardware useful:** support older Intel Macs and macOS releases where practical.
- **Remain local-first:** keep runtimes, processes, and data boundaries understandable and under user control.
- **Ship reproducibly:** pin and validate runtimes, architectures, and dependencies for a consistent release experience.

If you want Harness to become a daily tool you can launch from the Dock, try it, share feedback, and help shape what comes next.

## 🛠️ Development

### Requirements

- macOS
- Node.js
- pnpm
- Rust toolchain
- Xcode Command Line Tools

### Run locally

```bash
pnpm install
pnpm tauri dev
```

### Build for Apple Silicon

```bash
pnpm build:macos
```

Output:

```text
src-tauri/target/release/bundle/dmg/DeepSeek Harness_<version>_aarch64.dmg
```

### Build for Intel Mac

```bash
pnpm build:macos:intel
```

Output:

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/DeepSeek Harness_<version>_x64.dmg
```

### Build for Windows x64

Windows installers are built on a native Windows GitHub Actions runner:

```text
Actions → Build Windows x64 → Run workflow
```

They can also be built on a Windows x64 development machine:

```bash
pnpm build:windows
```

The build pipeline automatically:

- downloads and verifies official Node.js for the target architecture
- installs a pinned Harness production dependency closure
- retains native modules for the selected architecture
- applies macOS 12.7.6 WebKit compatibility handling
- verifies Markdown behavior, Mach-O architecture, and deployment targets
- generates npm and Rust/Tauri third-party license reports
- ensures the app contains one runtime without a first-launch cache copy
- bundles and verifies the independent Harness Insights plugin

## 🤝 Contributing

Use [Issues](https://github.com/mapan0424/deepseek-harness-desktop/issues) to report or discuss:

- macOS or Windows compatibility problems
- Intel, Apple Silicon, or Windows x64 feedback
- desktop experience improvements
- build and distribution work
- upgrades to newer Harness releases

When reporting a problem, include your macOS version, processor architecture, and any error information that is safe to share. Never upload API keys or credentials.

## 📄 License and notice

The desktop shell is available under the [MIT License](LICENSE). DeepSeek Harness and bundled components retain their respective copyrights and licenses. See [`src-tauri/legal/THIRD_PARTY_NOTICES.md`](src-tauri/legal/THIRD_PARTY_NOTICES.md) for details.

This is an independent community project. It is not an official DeepSeek product and does not imply sponsorship, endorsement, or affiliation. “DeepSeek” and “DeepSeek Harness” are used only to identify the compatible upstream project.

## 🔗 Related projects

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness website](https://deepseek.com/harness)

## 🌐 Friendly links

- [LINUX DO Community](https://linux.do)
