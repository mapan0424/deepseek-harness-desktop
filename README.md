# DeepSeek Harness for macOS（非官方客户端）

一个面向 macOS 的 DeepSeek Harness 桌面外壳。项目使用 **Tauri + 系统 WebView** 管理原生窗口和应用生命周期，在本机启动 DeepSeek Harness 的 `dsh web` 服务，并加载其官方 Web UI。

> **非官方声明：** 本项目由第三方独立开发和分发，不是 DeepSeek 官方产品，未经 DeepSeek 赞助、认可或背书，也不代表与 DeepSeek 存在隶属关系。“DeepSeek”和“DeepSeek Harness”仅用于说明兼容或内置的上游项目。MIT 代码许可不授予商标权。应用图标右下角的“非官方”角标、窗口标题以及第三方 Bundle ID 均用于避免身份混淆。

> **0.1 预览：** 当前发布包**没有** Apple Developer ID 签名和公证。可以正常分发，但 macOS 会拦截首次打开。请只从本仓库 [Releases](https://github.com/mapan0424/deepseek-harness-desktop/releases) 下载，并按下面的 [安装 0.1（未签名）](#安装-01未签名) 操作。

## 为什么要做这个项目

DeepSeek Harness 本身已经提供成熟的 Web UI。直接通过浏览器运行非常适合开发和快速体验，但作为日常桌面工具仍有一些摩擦：

- 使用前需要安装 Node.js，并在终端中启动 `dsh web`；
- 用户需要记住或管理本地端口，再手动打开浏览器；
- 浏览器标签页与 Harness 后台进程的生命周期彼此独立；
- 端口冲突、启动失败和后台日志不容易被普通用户发现；
- 桌面分发、签名、公证、Dock 图标和后续原生菜单等能力没有统一入口。

本项目的目标不是重写 DeepSeek Harness，而是把这些桌面环境中的启动和管理工作收进一个可分发的 macOS App：用户打开 App，App 启动本地 Harness 服务，确认服务就绪后展示界面；用户退出 App，App 同时回收由它启动的后台进程。

## 为什么复用官方 Web UI，而不是重新做一套界面

DeepSeek Harness 处于 developer preview，功能和接口仍在快速演进。重新实现聊天、Markdown、流式响应、工具调用、审批、设置和插件 UI，不仅工作量大，也很容易与上游行为产生偏差。

复用 `dsh web` 有几个实际优势：

1. **体验一致**：会话、Markdown、流式输出、工具调用和审批流程与 Harness Web UI 保持一致。
2. **上游兼容成本更低**：桌面层主要负责启动、窗口和生命周期，不需要复制所有业务状态。
3. **减少双重实现**：修复和新能力可以更多地来自 Harness 自身，而不是在桌面端再维护一份。
4. **插件兼容更自然**：Harness 的核心理念是“一切皆插件”；复用其运行时和前端比重新解释插件协议更稳妥。
5. **便于后续演进**：如果未来需要原生菜单、文件选择器或通知，可以逐步增加原生桥接，而不必先重写整个产品。

代价也很明确：这不是纯 SwiftUI 原生界面，主内容仍运行在 macOS 系统 WebView 中；上游 Web UI 的兼容性变化仍可能影响客户端。

## 为什么选择 Tauri

这个客户端需要的原生能力相对集中：创建窗口、定位 App 资源目录、启动和回收子进程、读取日志，以及后续接入菜单、文件选择器、通知和自动更新。Tauri 很适合承担这层薄外壳。

相较于常见方案：

| 方案 | 优势 | 本项目中的取舍 |
| --- | --- | --- |
| 浏览器 + 手动运行 dsh | 最简单、最接近上游 | 仍需终端、Node.js、端口管理和手动回收进程 |
| Electron | Web 生态成熟、跨平台一致性强 | 通常需要随 App 携带 Chromium；对于只做薄外壳的场景体积和运行开销偏高 |
| Swift / SwiftUI 全量重写 | 最原生，可深度整合 macOS | 需要重新实现并持续追踪完整 Harness UI 和交互协议，维护成本最高 |
| **Tauri（当前方案）** | 使用系统 WebView，Rust 负责生命周期；适合渐进增加原生能力 | WebView 行为受系统版本影响，仍需维护 Rust 与前端桥接 |

选择 Tauri 并不是声称它在所有场景都优于 Electron 或 SwiftUI，而是因为当前目标是一个**尽可能薄、可分发、能跟随上游演进的桌面外壳**。

## 为什么正式包内置 Node.js 和 dsh

开发模式可以直接通过 npm 启动 Harness，但如果正式 App 仍依赖用户机器上的 Node.js，会带来版本不一致、PATH 不可见、首次下载失败和 npm 包更新漂移等问题。

因此正式构建会打包：

- 与当前架构匹配的 Node.js 运行时；
- 固定版本的 `@deepseek-ai/dsh`；
- dsh 的生产依赖闭包；
- 对应的 lockfile、许可证和第三方声明。

这样做的优势是：

- **开箱即用**：用户无需单独安装 Node.js、pnpm 或 dsh；
- **可复现性更好**：发行包绑定明确的 Node.js 与 dsh 版本，不受全局环境变化影响；
- **不依赖首次启动下载**：安装后启动不需要临时从 npm 获取程序；
- **问题更容易定位**：同一个版本的 App 使用一致的运行时组合；
- **分发边界清晰**：依赖闭包和许可证都由构建流程记录。

相应代价是 App 体积会明显增加，而且每次升级 dsh 或 Node.js 都需要重新构建、测试并复核许可证。

## 工作方式

```text
DeepSeek Harness.app
├── Tauri 原生窗口
├── Rust 生命周期管理层
│   ├── 选择可用的 localhost 端口
│   ├── 解压并启动内置 Node.js + dsh
│   ├── 捕获 stdout / stderr
│   ├── 检查 HTTP 服务是否就绪
│   └── App 退出时终止子进程
└── macOS 系统 WebView
    └── 加载 http://127.0.0.1:<动态端口> 的 Harness Web UI
```

启动流程：

1. 优先尝试端口 `3080`；
2. 如果端口已占用，向系统申请一个可用的本地端口；
3. 正式包首次运行时，将内置运行时归档解压到 App 数据目录下的缓存位置；
4. 使用内置 Node.js 启动固定版本的 `dsh web`；
5. 轮询本地 HTTP 服务，确认就绪后再加载主界面；
6. 捕获 dsh 的标准输出和错误输出，启动失败时在界面中显示实际日志；
7. App 退出时终止由当前 App 启动的 dsh 子进程。

服务只通过 `127.0.0.1` 访问，不会为了桌面外壳主动暴露到局域网。该设计不等同于完整安全沙箱：Harness 本身具有工具调用和文件操作能力，实际权限仍取决于 Harness 配置、插件、用户审批和 macOS 进程权限。

## 当前优势

- 一个 App 完成启动、等待、展示和退出，无需手动维护终端进程；
- 正式包无需预装 Node.js、pnpm 或 dsh；
- 端口 `3080` 被占用时自动切换，不直接启动失败；
- 使用 Harness Web UI，避免重新实现核心交互并降低行为漂移；
- 使用 macOS 系统 WebView，不额外内置一份 Chromium；
- 保留 dsh 实际启动日志，便于诊断运行时和配置问题；
- App 退出时回收本地 dsh 进程，减少残留后台服务；
- 构建时自动生成 npm 和 Rust/Tauri 依赖许可证报告；
- 保留上游 MIT License、Node.js 完整许可证及包内第三方通知；
- 已使用独立 Bundle ID 和“非官方”视觉标识，降低与官方发行版混淆的风险。

## 当前限制

- 当前正式构建目标仅为 Apple Silicon（`aarch64`）；
- 尚未提供 Intel 或 Universal Binary；
- 0.1 刻意不签名、不公证，便于先把可运行包发出去；打开方式见 [安装 0.1（未签名）](#安装-01未签名)；
- 主界面是系统 WebView，并非纯原生 SwiftUI；
- App 会随包携带 Node.js 和完整 dsh 运行时，因此安装包不会像普通薄 WebView 外壳那么小；
- dsh 仍处于 developer preview，上游可能发生兼容性破坏；
- API Key、模型、插件和工作区行为主要由 DeepSeek Harness 自身配置决定；
- 还没有自动更新、完整原生菜单和面向最终用户的工作区管理界面；
- 当前 CSP 配置仍需在正式安全审计中进一步收紧。

## 安装 0.1（未签名）

可以。0.1 作为 GitHub 预览版，**暂时不签名是合理的**：受众是愿意自己构建或接受一次系统提示的开发者，不必先办 Developer ID（每年付费、还要走公证）。代价是双击不会像正式软件那样直接打开。

未签名包在 macOS 上通常会看到「无法验证开发者」，有时会误报「已损坏」。后者多半是隔离属性（quarantine），不是文件真坏了。

**只从本仓库 Releases 下载。** 不要用网盘、群文件或来路不明的镜像。

### 推荐：去掉隔离属性后再打开

1. 打开 `.dmg`，把 `DeepSeek Harness.app` 拖到「应用程序」。
2. 不要先双击。在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

3. 再从「应用程序」打开。

如果 App 不在「应用程序」里，把路径换成你实际放置的位置。

### 备选：系统设置里允许这一次

1. 双击后如果被拦截，打开 **系统设置 → 隐私与安全性**。
2. 滚到页面下半部分，找到刚才被拦的 App。
3. 点 **仍要打开**，按提示确认。

部分系统版本也可以在 Finder 里对 App **按住 Control 再点按 → 打开**。若提示「已损坏」，请改用上面的 `xattr` 命令。

### 不要这样做

- 不要关闭 SIP；
- 不要为了装这个 App 去打开「任何来源」；
- 不要对整盘执行来路不明的 `xattr` / `spctl` 脚本。

0.1 只覆盖 Apple Silicon（`aarch64`）。Intel Mac 请自行构建，或等后续 Universal / 签名版本。

## 开发运行

### 环境要求

- macOS；
- Node.js；
- pnpm；
- Rust toolchain；
- Xcode Command Line Tools；
- 按 DeepSeek Harness 文档配置可用的模型或 API 凭据。

安装依赖并启动：

```bash
pnpm install
pnpm tauri dev
```

开发模式找不到内置运行时时，会调用：

```bash
npx --yes @deepseek-ai/dsh web --port 3080
```

因此开发模式可能访问 npm registry，并依赖本机 Node.js 与网络环境。正式发行包不会在首次启动时通过 npm 下载 dsh。

## 构建 macOS App

```bash
pnpm build:macos
```

该命令依次执行：

```bash
pnpm prepare:runtime   # 准备 Node.js、dsh、生产依赖与 npm 许可证清单
pnpm prepare:licenses  # 从 Cargo.lock 生成 Rust/Tauri 许可证报告
pnpm tauri build       # 生成 .app 和 .dmg
```

产物位于：

```text
src-tauri/target/release/bundle/macos/DeepSeek Harness.app
src-tauri/target/release/bundle/dmg/DeepSeek Harness_<version>_aarch64.dmg
```

### Intel（单独脚本）

Apple Silicon 上的 `pnpm build:macos` 只会打出 arm64 包。Intel 用另一条命令，不改现有流程：

```bash
pnpm build:macos:intel
```

它会：

1. 下载官方 Node.js **darwin-x64**（不拷本机 Homebrew 的 arm64 Node）；
2. 按 `x64` 安装 dsh 生产依赖，只保留 `darwin-x64` 原生模块；
3. 用 Rust target `x86_64-apple-darwin` 打包。

本机 Homebrew rustc 只有 aarch64 标准库时，需要先装 rustup：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add x86_64-apple-darwin
```

产物位于：

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/macos/DeepSeek Harness.app
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/DeepSeek Harness_<version>_x64.dmg
```

`src-tauri/resources/dsh-runtime/`、运行时压缩包、`src-tauri/resources/.cache/`、`node_modules/` 和 Rust `target/` 都是生成物，不提交到 Git 仓库。再打 Apple Silicon 包时执行 `pnpm build:macos` 即可覆盖回 arm64 运行时。

## 版本与升级原则

内置 dsh 版本在 [`scripts/prepare-runtime.mjs`](scripts/prepare-runtime.mjs) 中固定。升级时不应只修改版本号，还应完成：

1. 重新生成生产运行时；
2. 验证会话、流式输出、工具调用和审批流程；
3. 验证动态端口与进程回收；
4. 重新生成并复核 npm 依赖清单；
5. 重新生成并复核 Rust/Tauri 许可证报告；
6. 检查新增依赖是否存在非标准或限制性许可证；
7. 重新构建并检查 `.app` 与 `.dmg` 中的 Legal 文件。

## 许可证与分发

- 桌面外壳采用 [MIT License](LICENSE)；
- 内置 DeepSeek Harness 采用 MIT License，其版权与完整许可文本随发行包保留；
- 构建时从实际内置的 npm 生产依赖闭包生成包名、精确版本和声明许可证清单；
- Node.js 的完整许可证及 bundled-component notices 随内置运行时分发；
- 构建时从锁定的 Cargo 依赖图生成并打包 Rust/Tauri 完整许可证报告；
- 详细说明见 [`src-tauri/legal/THIRD_PARTY_NOTICES.md`](src-tauri/legal/THIRD_PARTY_NOTICES.md)。

发布二进制前必须复核自动生成的 npm 与 Rust/Tauri 报告。许可证生成失败时，不应发布构建产物。

App 名称保留为 **DeepSeek Harness**，用于清晰说明其用途；为避免暗示官方身份：

- 图标右下角带有“非官方”角标；
- 窗口与启动页标注“非官方客户端”；
- Bundle ID 使用 `io.github.mapan0424.harness-desktop`，而非 DeepSeek 官方域名；
- App 内随附独立的非官方及无背书声明。

以上是工程层面的许可证与分发处理，不构成法律意见。公开商业分发或上架应用商店前，建议对商标、服务条款和所有第三方依赖再进行专业法律复核。

## 路线图

- Intel / Universal Binary；
- Apple Developer ID 签名和 notarization；
- 原生菜单与快捷键；
- 工作区选择和最近项目；
- 更清晰的权限确认与安全边界；
- 自动更新；
- 将 Harness Home、缓存和工作区路径提供为可配置项；
- 收紧 WebView CSP；
- 持续跟进 DeepSeek Harness 上游版本与许可证变化。

## 上游项目

- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness
- 官方网站：https://deepseek.com/harness
