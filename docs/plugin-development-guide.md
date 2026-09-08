# 🛠️ DeepSeek Harness 插件开发与接入指南

本文档介绍如何在 `deepseek-harness` Monorepo 体系下开发、调试并发布一个全新的 Harness 插件。

---

## 1. 插件基础认知

DeepSeek Harness 采用 **Cordis 插件化架构** 与 **前端模块注入机制**：
* **服务端能力**：通过 `cordis` 上下文（`ctx`）注册服务、消息监听器或数据处理中间件；
* **前端界面注入**：通过 `dsh.client.inject` 声明注入的 Web UI 模块，动态挂载设置面板、侧边栏或自定义组件。

---

## 2. 5 分钟创建新插件结构

在 `packages/` 目录下新建子文件夹（例如 `packages/harness-plugin-demo`）：

```text
packages/harness-plugin-demo/
├── index.js             # 服务端入口（Cordis 插件）
├── client.js            # 前端注入入口（可选）
├── cordis.patch.yml     # Cordis 配置补丁（可选）
├── package.json         # npm 元数据
├── README.md            # 插件说明文档
└── LICENSE              # 开源协议 (MIT)
```

### `package.json` 规范模板

```json
{
  "name": "@anarkhgatsby/deepseek-harness-plugin-demo",
  "version": "0.1.0",
  "description": "Demo plugin for DeepSeek Harness",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./package.json": "./package.json"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/mapan0424/deepseek-harness-desktop.git",
    "directory": "packages/harness-plugin-demo"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-locale"
      ],
      "platform": "web"
    }
  },
  "files": [
    "index.js",
    "client.js",
    "cordis.patch.yml",
    "README.md",
    "LICENSE"
  ],
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1"
  }
}
```

---

## 3. 本地调试技巧

1. 在根目录运行 `pnpm install`，新插件会自动被识别并链接；
2. 若涉及消息总线，可直接引用 `@anarkhgatsby/deepseek-harness-core` 进行跨渠道路由；
3. 构建并启动桌面端或执行测试：
   ```bash
   pnpm test:insights
   ```

---

## 4. 提交与独立发布

1. 执行 `pnpm changeset`，添加本次插件的更新描述；
2. 执行 `pnpm version:packages` 生成正式版本；
3. 执行 `pnpm publish:packages` 完成 npm 独立包上线。
