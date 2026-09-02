# @anarkhgatsby/deepseek-harness-locale-pack

<div align="center">

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-locale-pack.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-locale-pack)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Plugin-orange.svg?style=flat-square)](https://github.com/mapan0424/deepseek-harness-desktop)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/mapan0424/deepseek-harness-desktop)

**面向 DeepSeek Harness 的全域多语言与中国少数民族语言扩展插件包**

[English Documentation](README.md) · [项目主页](https://github.com/mapan0424/deepseek-harness-desktop) · [提交问题与建议](https://github.com/mapan0424/deepseek-harness-desktop/issues)

</div>

---

## 📖 项目简介

`@anarkhgatsby/deepseek-harness-locale-pack` 是一款专为 [DeepSeek Harness (DSH)](https://github.com/mapan0424/deepseek-harness-desktop) 打造的**全域多语言与中国少数民族语言扩展插件**。

DeepSeek Harness 官方原版默认仅内置了简体中文（`zh`）与英文（`en`）。本插件打破了语言壁垒，为全球用户以及少数民族地区开发者提供了包括 **藏文**、**蒙古文**、**维吾尔文**（原生 RTL 从右至左自适应）与 **凉山规范彝文** 在内的 **13 种主流语言与民族语言** 原生母语级体验。

---

## ✨ 核心特性

- 🇨🇳 **全面支持中国四大少数民族语言**：
  - **藏文 (`bo` / བོད་སྐད།)**：规范叠字结构渲染与纯正计算机术语对齐；
  - **蒙古文 (`mn` / ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ)**：传统与规范蒙古文字形排版绑定；
  - **维吾尔文 (`ug` / ئۇيغۇرچە)**：自适应 **从右向左（RTL）** 排版布局，阿拉伯字母文字与文本对齐无缝切换；
  - **彝文 (`ii` / ꆈꌠꉙ)**：凉山规范彝文音节文字与字形支持。
- 🌐 **国际主流语言全矩阵覆盖**：
  - 同步支持 **繁體中文 (`zh-TW`)**、**日本語 (`ja`)**、**한국어 (`ko`)**、**Français (`fr`)**、**Deutsch (`de`)**、**Русский (`ru`)**、**Español (`es`)**。
- ⚡ **0 毫秒即时响应式切换（无需重启 / 刷新）**：
  - 搭载 **全语言双向倒排索引引擎（Bidirectional Inverted Index Engine）** 与双渲染帧调度机制；
  - 在「设置」中切换任意语言，界面瞬间 100% 同步变身，告别“刷新才能生效”的迟滞感。
- 🛡️ **非侵入式架构与绝对安全**：
  - 严格基于官方 Cordis 插件生命周期（`cordis.patch.yml`）装载，**对官方 `@deepseek-ai/*` 核心代码 0 侵入、0 修改**；
  - **作用域严格隔离**：只精准翻译系统 UI、侧边栏、设置面板与按钮，严格保护用户聊天消息正文、代码块与自定义会话标题不受任何破坏。
- 🔒 **100% 本地化与隐私安全**：
  - 字典包与用户偏好完全存储于本地，不发起任何网络请求，不上传任何遥测数据，绝不触碰任何 API 凭据。

---

## 🗺️ 支持的语言列表

| 语言代码 | 原生名称 | 中文名称 | 文字方向 | 默认字体与排版适配 |
| :--- | :--- | :--- | :---: | :--- |
| `zh` | 简体中文 | 简体中文 | 从左向右 (LTR) | 系统默认 |
| `en` | English | 英语 | 从左向右 (LTR) | 系统默认 |
| `zh-TW` | 繁體中文 | 繁体中文 | 从左向右 (LTR) | PingFang TC, Microsoft JhengHei |
| `bo` | བོད་སྐད། | 藏文 | 从左向右 (LTR) | Kailasa, Tibetan Machine Uni, Noto Sans Tibetan |
| `mn` | ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ | 蒙古文 | 从左向右 (LTR) | Menk Haratig, Mongolian Baiti, Noto Sans Mongolian |
| `ug` | ئۇيغۇرچە | 维吾尔文 | **从右向左 (RTL)** | UKIJ Tuz, Alkatip Tor, Microsoft Uighur, Noto Sans Arabic |
| `ii` | ꆈꌠꉙ | 凉山规范彝文 | 从左向右 (LTR) | Nuosu SIL, Microsoft Yi Baiti, Noto Sans Yi |
| `ja` | 日本語 | 日语 | 从左向右 (LTR) | Hiragino Sans, Meiryo, Noto Sans CJK JP |
| `ko` | 한국어 | 韩语/朝鲜语 | 从左向右 (LTR) | Apple SD Gothic Neo, Malgun Gothic |
| `fr` | Français | 法语 | 从左向右 (LTR) | 系统默认 |
| `de` | Deutsch | 德语 | 从左向右 (LTR) | 系统默认 |
| `ru` | Русский | 俄语 | 从左向右 (LTR) | 系统默认 |
| `es` | Español | 西班牙语 | 从左向右 (LTR) | 系统默认 |

---

## 🚀 安装与使用

### 1. 终端命令行一键安装

在终端运行以下命令：

```bash
dsh plugin --profile web add @anarkhgatsby/deepseek-harness-locale-pack
```

### 2. 界面切换语言

1. 打开 **DeepSeek Harness** 客户端；
2. 点击左下角 **「设置」**（⚙️） ➔ 进入 **「通用设置」**；
3. 在 **「语言」** 下拉列表中选择你需要的语言（如 `བོད་སྐད། (藏文)`、`ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ (蒙古文)`、`ئۇيغۇرچە (维吾尔文)`、`ꆈꌠꉙ (彝文)` 等）；
4. 界面将即时呈现对应语言的母语级排版与文字！

---

## 🏗️ 技术架构原理

```
┌─────────────────────────────────────────────────────────┐
│              DeepSeek Harness Host / Core               │
└────────────────────────────┬────────────────────────────┘
                             │ Cordis 插件生命周期注入
                             ▼
┌─────────────────────────────────────────────────────────┐
│     @anarkhgatsby/deepseek-harness-locale-pack          │
├────────────────────────────┬────────────────────────────┤
│  1. 全语言双向倒排索引     │  2. 精准作用域 DOM 监听    │
│  - 650+ 官方 AST 精确词典  │  - 实时 MutationObserver   │
│  - 任意语言 ➔ 标准 Key 映射│  - Double RAF 渲染调度     │
├────────────────────────────┼────────────────────────────┤
│  3. RTL 排版与民族字体栈   │  4. 动态 Schema 劫持扩展   │
│  - 维吾尔文 RTL 镜像布局   │  - 扩展 ctx.locale 服务    │
│  - 民族专属无衬线字体绑定  │  - 持久化 localStorage 状态│
└────────────────────────────┴────────────────────────────┘
```

1. **AST 官方全域词典提取**：通过 AST 扫描官方 40+ 个核心 UI 包，提取完整官方中文键值，确保词条 100% 对齐官方语境；
2. **双向倒排索引（Inverted Index）**：任意语言均可反向定位标准词条，支持在 13 种语言间任意多次连续切换；
3. **渲染帧双重触发（Double RAF）**：同步修改现有 DOM 树，并在随后的 `requestAnimationFrame` 捕获 React Portal/弹窗重新渲染的节点。

---

## 🤝 贡献与反馈

欢迎提交 PR 或 Issue！如果你想参与完善翻译或新增其他语言：

1. Fork 本仓库；
2. 在 `scripts/build-instant-refresh-locale.mjs` 中补充或优化对应语言的词典；
3. 运行 `npm test` 进行测试校验；
4. 提交 Pull Request。

---

## 📄 开源许可证与声明

- **开源协议**：本项目基于 [MIT License](LICENSE) 开源发布。
- **免责声明**：本插件为社区独立开源开发，非 DeepSeek AI 官方出品。

