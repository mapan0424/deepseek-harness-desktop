# Third-Party Notices

本 App 内置了 DeepSeek Harness 的 dsh 运行时及其生产依赖。每个第三方项目仍
受其自己的许可证约束；本文件不会改变这些许可证的条款。

## DeepSeek Harness

DeepSeek Harness 由 DeepSeek 发布，采用 MIT License。完整文本见同目录下的
`LICENSE` 文件。当前 App 内置的 dsh 版本为 `0.1.0-rc.6`。

原项目及源代码：

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/mapan0424/deepseek-harness

## Runtime npm dependencies

完整的精确版本依赖闭包记录在 App 内置运行时的 `package-lock.json` 中；运行时
中各 npm 包自带的 `LICENSE`、`NOTICE` 或 README 文件也会随包保留。以下是项目
公开声明的主要运行时依赖及其许可证类型：

| Package | License |
| --- | --- |
| `@agentclientprotocol/sdk` | Apache-2.0 |
| `@anthropic-ai/claude-agent-sdk` | See package license |
| `@anthropic-ai/sdk` | MIT |
| `@modelcontextprotocol/sdk` | MIT |
| `@opentelemetry/*` | Apache-2.0 |
| `@shikijs/langs` | MIT |
| `@tanstack/react-virtual` | MIT |
| `@vscode/ripgrep` | MIT |
| `chokidar` | MIT |
| `diff` | BSD-3-Clause |
| `katex` | MIT |
| `node-pty` | MIT |
| `react` / `react-dom` | MIT |
| `sharp` | Apache-2.0 |
| `shiki` | MIT |
| `turndown` | MIT |
| `typescript` | Apache-2.0 |
| `ws` | MIT |
| `yaml` | ISC |
| `zod` | MIT |
| `zustand` | MIT |

其他间接依赖以随包提供的 `package-lock.json` 和各包自身的许可证文件为准。

## Bundled Node.js runtime

本 App 为了让用户无需安装 Node.js，内置了一个 Node.js 运行时及其动态库。
Node.js、OpenSSL、ICU、libuv、nghttp2、nghttp3、brotli、zlib、sqlite 等组件
仍受其各自的许可证和版权声明约束；对应的运行时文件和包内许可证文件随内置
运行时一起分发。

## Distribution note

本 App 是非官方的 DeepSeek Harness macOS 客户端，不代表 DeepSeek 官方产品或
官方背书。DeepSeek API、模型和相关在线服务的使用还应遵守其各自的服务条款。
