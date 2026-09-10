# DSH 运行时升级手册

本手册只用于升级桌面端内嵌的 DeepSeek Harness（DSH）运行时。它不是
通用开发规范；处理普通功能、UI、文档或渠道问题时无需按本流程执行。

## 发布原则

- 桌面运行时、内嵌插件、npm 已发布版本、README 与 GitHub Release 必须
  表述同一套版本矩阵。
- 先完成本地验证，再推送版本标签；标签会触发 GitHub Actions 构建正式包。
- npm 由项目维护者手动发布。自动化助手只准备包、提供命令并核验结果。
- 不覆盖既有正式 Release。修复后的桌面端应使用新的 patch 版本，除非维护者
  明确要求重发同一标签。

## 1. 确认上游目标版本

同时查看 npm 和官方 Release，区分 `latest`、`next`、`alpha` 与 RC：

```bash
npm view @deepseek-ai/dsh version dist-tags versions --json
gh release view dsh-v<version> --repo deepseek-ai/deepseek-harness
```

记录目标精确版本与上游的破坏性变更，尤其是：会话格式、持久化和投影 API、
Agent/Inbox API、Web 插件 API、默认工具，以及平台行为。

## 2. 备份并更新 DSH 运行时

若上游涉及 Session 格式或持久化改动，先备份本机 `.dsh` 数据。禁止为了兼容性
问题删除、覆写或迁移原始会话日志；只能在可验证的情况下重建或恢复派生缓存。

将同一目标版本更新到以下三个构建脚本：

- `scripts/prepare-runtime.mjs`（macOS Apple Silicon）
- `scripts/prepare-runtime-intel.mjs`（macOS Intel）
- `scripts/prepare-runtime-windows.mjs`（Windows x64）

不要只修改 lockfile 或已生成的 `src-tauri/resources/dsh-runtime`。

## 3. 逐项检查内嵌插件

检查 `scripts/install-bundled-plugins.mjs` 中的全部插件：

- Harness Insights
- 可视化 Channel Config
- Gateway Core
- 飞书 / Lark
- 钉钉
- iMessage（仅 macOS）
- 企业微信 / WeCom
- Locale Pack

对于每一个插件，检查并测试：

1. Host API、Session Persistence / Projection API 是否改变；
2. Client / Web 插件 API 是否改变；
3. `peerDependencies` 是否应更新到新的 DSH/Cordis 版本；
4. 是否需要修改平台分支，尤其是 Windows 不得显示或打包 iMessage；
5. 是否需要修改中英文 README 中的支持 DSH 版本、依赖与迁移限制。

对于上游仍挂在 npm `next` 标签的 alpha 或 RC 版本，不能使用 `^` 范围来猜测
解析结果。先用干净的 pnpm/npm 安装验证；如稳定版 `latest` 尚未达到该版本，必须
将相关 DSH peer 精确锁定为目标版本，例如 `"0.1.5-rc.1"`。

## 4. 插件发布与版本一致性

若插件代码、依赖或兼容声明有改动：

1. 在 `../deepseek-harness-plugins` 更新插件源码、测试、版本号及中英文 README；
2. 推送插件 GitHub 仓库；
3. 由维护者手动在**具体插件目录**发布 npm；
4. 用 npm 查询确认准确版本已成为 `latest`；
5. 再将桌面端 `packages/` 的副本与
   `scripts/install-bundled-plugins.mjs` 的 `expectedVersion` 更新为同一版本。

示例：

```bash
cd "../deepseek-harness-plugins/packages/harness-insights"
npm publish --access public
npm view @anarkhgatsby/deepseek-harness-insights version dist-tags --json
```

不要跳过未发布的 patch 版本。例如 npm `latest` 为 `0.1.6` 时，下一次正常
发布应为 `0.1.7`，而不是 `0.1.8`。

## 5. 文档与版本号

更新以下内容：

- 桌面版 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`；
- 根目录 `README.md` 与 `README_EN.md`：内嵌 DSH、插件矩阵、支持平台与本次变更；
- 每个已改插件的 `README.md`、`README.zh-CN.md`：精确包版本、已验证的 DSH
  版本、peer dependencies、平台范围、数据边界与迁移说明；
- `.github/workflows/release.yml`：新增该桌面版本的 updater notes 与 Release notes。

README 不得宣称未经本地测试的兼容性。

## 6. 构建与自动化测试

最少执行：

```bash
pnpm test:insights
pnpm test:runtime:compat
pnpm test:plugins:runtime
pnpm test:plugins:boot
pnpm test:bundled-pnpm
pnpm test:updater
pnpm build:macos
```

`pnpm build:macos` 会准备 Apple Silicon 运行时、构建 DMG，并验证 macOS bundle。
若需要 Intel 或 Windows 发布包，也要分别运行对应平台构建或等待 GitHub Actions
执行相同版本的构建。

## 7. 本地验收清单

安装 ARM DMG 后至少验证：

- App 启动、断线重连、正常新建/恢复会话；
- Enter 发送、Esc 或 Ctrl+C 取消；
- Insights 的历史总量、模型、活动热力图、工具统计与缓存命中率；
- Channel Config 与已验证渠道的配置、收发流程；
- macOS iMessage 权限提示与收发；
- Windows 构建不携带、不显示 iMessage；
- App 内实际 DSH 与插件版本与本次发布矩阵一致。

## 8. 推送与发布

所有本地测试和 npm 版本核验通过后：

1. 推送桌面端代码；
2. 创建与 `package.json` 一致的 `v<desktop-version>` 标签并推送；
3. 等待 Release Action 完成 macOS ARM、macOS Intel 和 Windows 构建；
4. 确认 Release 资产、签名、`latest.json`、SHA256 清单和发布说明；
5. 最后核对 GitHub Release 与 npm `latest` 中的插件版本一致。

任何一个环节失败时，不推送正式标签；保留诊断信息并在修复后重新从测试门禁开始。
