# Harness Marketplace 设计方案

## 1. 架构总览

```
packages/harness-marketplace/          ← 新插件，和 Insights 同级
├── package.json                       ← @anarkhgatsby/dsh-marketplace
├── cordis.patch.yml                   ← 顶层 bundle 声明
├── registry.json                      ← 分类 + 索引（构建时生成，可远程更新）
├── lib/
│   ├── index.js                       ← 服务端：搜索、分类、推荐、安装
│   ├── client.js                      ← 客户端：设置页 UI
│   └── sync.js                        ← 后台同步 registry
├── assets/
│   └── category-icons/                ← 10 个分类图标（SVG）
└── scripts/
    └── build-registry.mjs             ← 从 npm + 1024Store 生成 registry.json
```

**加载方式**：和 Insights 完全一样——`install-bundled-plugins.mjs` 内置打包，`prepare_bundled_plugins()` 启动时复制到 `$DSH_HOME/node_modules`，`--patch` 挂载。

## 2. 数据模型

### 2.1 registry.json

```json
{
  "version": "2026-08-21T00:00:00Z",
  "categories": [
    {
      "id": "terminal",
      "label": { "zh": "终端与命令", "en": "Terminal & Shell" },
      "icon": "terminal",
      "order": 1,
      "children": [
        {
          "id": "terminal/bash",
          "label": { "zh": "bash 执行", "en": "Bash" }
        },
        {
          "id": "terminal/pwsh",
          "label": { "zh": "pwsh 执行", "en": "PowerShell" }
        },
        {
          "id": "terminal/emulator",
          "label": { "zh": "终端模拟器", "en": "Terminal Emulator" }
        },
        {
          "id": "terminal/jobs",
          "label": { "zh": "后台任务", "en": "Background Jobs" }
        }
      ]
    }
  ],
  "plugins": [
    {
      "npm": "@deepseek-ai/dsh-tool-bash",
      "github": "deepseek-ai/deepseek-harness",
      "name": { "zh": "Bash 工具", "en": "Bash Tool" },
      "description": {
        "zh": "为模型提供 bash 命令执行能力，支持沙箱和安全审批",
        "en": "Model-facing bash tool with sandbox and approval support"
      },
      "categories": ["terminal/bash", "filesystem/sandbox"],
      "tags": ["bash", "shell", "official"],
      "official": true,
      "desktop": false,
      "homepage": "https://github.com/deepseek-ai/deepseek-harness",
      "installs": 125000,
      "stars": 177000,
      "updated": "2026-08-15T00:00:00Z"
    }
  ],
  "updated": "2026-08-21T12:00:00Z"
}
```

### 2.2 分类树（10 个一级，34 个二级）

| 一级 | 二级 | 典型插件 |
|---|---|---|
| terminal 终端与命令 | bash, pwsh, emulator, jobs | `dsh-tool-bash`, `dsh-TUI` |
| filesystem 文件与系统 | read-write, search, edit, sandbox, system-info | `dsh-tool-fs`, `dsh-sandbox` |
| network 网络与搜索 | web-search, web-fetch, mcp, api | `dsh-tool-web`, `dsh-mcp-client` |
| agent Agent 协作 | subagent, workflow, goal, teams | `dsh-tool-subagent`, `agent-teams` |
| conversation 对话增强 | skill, persona, feedback, session | `dsh-skill`, `dsh-persona` |
| data 数据与存储 | persistence, vector, sql, attachment | `dsh-session-persistence-jsonl` |
| ui 界面与体验 | sidebar, theme, tui, desktop | `DSH-better-sidebar`, `dsh-web-ui` |
| analytics 数据与分析 | usage, token, stats, telemetry | `deepseek-harness-insights` |
| model 模型与供应商 | deepseek, third-party, local, mock | `dsh-llm-pi-ai` |
| dev 开发与工具 | framework, types, test, build | `dsh-cordis-*`, `dsh-invariants` |

### 2.3 插件状态

每个插件在 UI 中有四种状态，由客户端实时查询 `dsh-host-plugin-inventory` 判断：

| 状态 | 含义 |
|---|---|
| 未安装 | 可安装 |
| 安装中 | 后台 `dsh plugin add` 执行中 |
| 已安装 | 当前 profile 已加载 |
| 可卸载 | 非内置 bundle，可移除 |

## 3. 服务端 API（lib/index.js）

```js
export const name = "harness-marketplace"
export const inject = ["sessionProjections", "locale"]

export function apply(ctx) {
  // 3.1 注册核心服务
  ctx.provide("marketplace", {
    // 搜索
    async search(query, { locale, category, official, sort }) {
      // 1. 本地 registry 精确匹配（分类、标签、名称）
      // 2. npm 实时搜索补充（新包、registry 未收录的）
      // 3. 合并去重，按 sort 排序
    },

    // 获取分类树
    categories() {
      // 返回 registry.categories
    },

    // 获取推荐
    async recommendations(installedPlugins) {
      // 1. 基于已安装插件推荐互补品（同分类、不同插件）
      // 2. 按热度排序的官方插件
      // 3. 最近更新的社区插件
    },

    // 安装
    async install(npmName) {
      // spawn: dsh plugin --profile web add <npmName>
      // 返回 { ok: true } 或 { error: "..." }
    },

    // 卸载
    async uninstall(npmName) {
      // spawn: dsh plugin --profile web remove <npmName>
    },

    // 获取已安装列表
    installed() {
      // 调 ctx.get("pluginInventory").list()
      // 返回当前 profile 已加载的插件清单
    }
  })

  // 3.2 后台同步 registry
  ctx.effect(() => {
    syncRegistry(ctx) // 启动时拉取最新 registry.json
  })
}
```

## 4. 客户端 UI（lib/client.js）

### 4.1 页面布局

```
┌─────────────────────────────────────────────────────┐
│  🔌 插件市场                                         │
│  为你的 Harness 添加更多能力                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🔍 搜索插件（名称、分类、标签）                   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌── 热门 ── 官方 ── 已安装 ────────────────────┐   │
│  │                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ 🖥 终端   │  │ 📁 文件   │  │ 🌐 网络   │   │   │
│  │  │  与命令   │  │  与系统   │  │  与搜索   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ 🤖 Agent │  │ 💬 对话   │  │ 🗄 数据   │   │   │
│  │  │  协作     │  │  增强     │  │  与存储   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ 🎨 界面   │  │ 📊 数据   │  │ 🔧 开发   │   │   │
│  │  │  与体验   │  │  与分析   │  │  与工具   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐                                │   │
│  │  │ 🔌 模型   │                                │   │
│  │  │  与供应商 │                                │   │
│  │  └──────────┘                                │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ── 推荐 ────────────────────────────────────────   │
│  ┌──────────────────────────────────────────────┐   │
│  │ ⭐ 4.8K  dsh-tool-bash          [已安装]      │   │
│  │ 为模型提供 bash 命令执行能力                   │   │
│  │ 🏷 官方 · bash · shell                        │   │
│  ├──────────────────────────────────────────────┤   │
│  │ ⭐ 2.1K  dsh-tool-web           [安装]         │   │
│  │ 网页搜索和抓取能力                             │   │
│  │ 🏷 官方 · web · search                        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 4.2 交互流程

**浏览分类**：
1. 点击分类卡片 → 展开该分类的二级列表
2. 每个插件卡片显示：名称、描述、标签、安装状态
3. 点击「安装」→ 按钮变「安装中…」→ 完成变「已安装」

**搜索**：
1. 输入关键词 → 实时过滤（本地 registry，< 100ms）
2. 无结果时 → 触发 npm 实时搜索（显示「搜索 npm 中…」，< 2s）
3. npm 搜索结果标记「来自 npm」，区分 registry 收录的插件

**推荐 Tab**：
- 热门：按 npm 下载量 + GitHub stars 加权排序
- 官方：只显示 `@deepseek-ai/dsh-*` 范围的包
- 已安装：当前 profile 已加载的插件列表

### 4.3 注入方式

```js
// client.js
const inject = ["slots", "connection", "locale"]
function apply(ctx) {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register({
      name: "settings.section",
      id: "harness-marketplace",
      order: 20,  // 在 Insights (order: 25) 之前
      label: () => ctx.locale.bind("marketplace")("nav"),
      inject: () => ({
        api: ctx.get("connection").api,
        marketplace: ctx.get("marketplace"),
        locale: ctx.locale
      })
    }, MarketplaceSection)
  )
}
```

## 5. Registry 生成脚本（scripts/build-registry.mjs）

```js
// 在构建时运行，生成 registry.json
// 数据来源：
//   1. 手动维护的 packages/harness-marketplace/registry-base.json（核心插件 + 分类）
//   2. npm keyword "dsh-plugin" 实时搜索（补充新插件）
//   3. DSH 1024Store 的 awesome 列表（补充 GitHub 元数据）

async function buildRegistry() {
  const base = JSON.parse(await readFile("packages/harness-marketplace/registry-base.json"))

  // 从 npm 拉取最新插件列表
  const npmPlugins = await fetchNpmPlugins("keywords:dsh-plugin")

  // 从 1024Store 拉取 stars + 分类
  const awesomePlugins = await fetchAwesomeList()

  // 合并
  const merged = mergePlugins(base, npmPlugins, awesomePlugins)

  // 写入
  await writeFile("packages/harness-marketplace/registry.json", JSON.stringify(merged, null, 2))
}
```

## 6. 打包集成

修改 `scripts/install-bundled-plugins.mjs`：

```js
// 原来只装 Insights
await installBundledPlugin("harness-insights", runtimeRoot)

// 现在加 Marketplace
await installBundledPlugin("harness-marketplace", runtimeRoot)

// 两个插件共用同一个 --patch 文件
// cordis.patch.yml 里两个 insert 条目
```

`cordis.patch.yml`：
```yaml
- insert:
    - id: harness-desktop-insights
      name: "@anarkhgatsby/deepseek-harness-insights"
    - id: harness-desktop-marketplace
      name: "@anarkhgatsby/dsh-marketplace"
```

## 7. 远程更新 Registry

Registry 不需要每次 App 发版才更新。启动时从 GitHub raw 拉取最新：

```js
// lib/sync.js
async function syncRegistry(ctx) {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/mapan0424/deepseek-harness-desktop/main/packages/harness-marketplace/registry.json"
    )
    if (res.ok) {
      const remote = await res.json()
      // 写入本地缓存
      await writeRegistry(remote)
    }
  } catch {
    // 使用内置的 registry.json 降级
  }
}
```

## 8. 实施计划

| 阶段 | 内容 | 工时 |
|---|---|---|
| 1 | 创建 `packages/harness-marketplace/` 骨架 + `registry-base.json`（手动录入 50 个核心插件） | 1 天 |
| 2 | 服务端 `lib/index.js`：搜索、分类、推荐、安装/卸载 | 1 天 |
| 3 | 客户端 `lib/client.js`：分类卡片 + 搜索框 + 推荐列表 + 安装按钮 | 1.5 天 |
| 4 | `scripts/build-registry.mjs`：npm + 1024Store 自动抓取 | 0.5 天 |
| 5 | 打包集成 + 远程更新 + 测试 | 0.5 天 |
| **合计** | | **4.5 天** |

## 9. 和 anywhere-labs 的区别

| | 你的 Marketplace | anywhere-labs Market |
|---|---|---|
| 数据源 | npm + 1024Store + 手动维护 | DSH Community Fabric |
| 安装方式 | `dsh plugin add`（标准） | 内置 pnpm |
| 分类 | 10 大类 34 小类 | 设计阶段 |
| 推荐 | 热度 + 互补 + 官方优先 | 设计阶段 |
| 上线状态 | 可立即开发 | 尚未上线 |
| 桌面端标记 | ✅ 有（`desktop: true`） | ❌ 无 |