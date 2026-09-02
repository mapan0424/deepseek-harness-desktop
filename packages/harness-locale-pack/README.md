# @anarkhgatsby/deepseek-harness-locale-pack

<div align="center">

[![npm version](https://img.shields.io/npm/v/@anarkhgatsby/deepseek-harness-locale-pack.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@anarkhgatsby/deepseek-harness-locale-pack)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Plugin-orange.svg?style=flat-square)](https://github.com/mapan0424/deepseek-harness-desktop)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/mapan0424/deepseek-harness-desktop)

**Comprehensive Multi-Language & Ethnic Minority Language Pack for DeepSeek Harness**

[简体中文文档](README.zh-CN.md) · [Documentation](https://github.com/mapan0424/deepseek-harness-desktop) · [Report Bug](https://github.com/mapan0424/deepseek-harness-desktop/issues)

</div>

---

## 📖 Overview

`@anarkhgatsby/deepseek-harness-locale-pack` is an official-grade, non-invasive community localization extension designed for [DeepSeek Harness (DSH)](https://github.com/mapan0424/deepseek-harness-desktop).

While DeepSeek Harness natively ships with only basic Simplified Chinese (`zh`) and English (`en`), this plugin expands the language landscape to **13 global & ethnic minority languages**, including native support for China's major ethnic minority languages: **Tibetan**, **Mongolian**, **Uyghur** (with native Right-to-Left / RTL layout), and **Nuosu Yi**.

---

## ✨ Key Features

- 🇨🇳 **Full Coverage for China's Major Ethnic Minority Languages**:
  - **Tibetan (`bo` / བོད་སྐད།)**: Native stack-glyph rendering and standard Tibetan terminology.
  - **Mongolian (`mn` / ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ)**: Traditional Mongolian script font bindings.
  - **Uyghur (`ug` / ئۇيغۇرچە)**: Automatic Right-to-Left (**RTL**) layout switching, Arabic script typography, and UI alignment adaptation.
  - **Nuosu Yi (`ii` / ꆈꌠꉙ)**: Liangshan standard Yi syllabary glyphs.
- 🌐 **Global Language Matrix**:
  - Full support for **Traditional Chinese (`zh-TW`)**, **Japanese (`ja`)**, **Korean (`ko`)**, **French (`fr`)**, **German (`de`)**, **Russian (`ru`)**, and **Spanish (`es`)**.
- ⚡ **Zero-Reload Instant Responsive Switch**:
  - Built with a **Bidirectional Inverted Index Engine** and double-frame render scheduling. Selecting any language in the dropdown updates the entire UI in **0.1ms without restarting the app or refreshing the page**.
- 🛡️ **Zero-Invasive Architecture**:
  - Built on standard Cordis runtime plugin slots (`cordis.patch.yml`).
  - **100% Non-destructive**: Modifies 0 bytes of upstream official `@deepseek-ai/*` files.
  - **Scope Isolation**: Strictly translates UI components while protecting user chat history, code blocks, and workspace session titles from accidental corruption.
- 🔒 **100% Local & Privacy Guaranteed**:
  - Dictionaries and user preferences run entirely in the local client. No external network requests, no telemetry, and zero access to credentials or API keys.

---

## 🗺️ Supported Language Matrix

| Code | Native Name | Display Name | Direction | Font Stack & Layout |
| :--- | :--- | :--- | :---: | :--- |
| `zh` | 简体中文 | Simplified Chinese | LTR | System Default |
| `en` | English | English | LTR | System Default |
| `zh-TW` | 繁體中文 | Traditional Chinese | LTR | PingFang TC, Microsoft JhengHei |
| `bo` | བོད་སྐད། | Tibetan | LTR | Kailasa, Tibetan Machine Uni, Noto Sans Tibetan |
| `mn` | ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ | Mongolian | LTR | Menk Haratig, Mongolian Baiti, Noto Sans Mongolian |
| `ug` | ئۇيغۇرچە | Uyghur | **RTL** | UKIJ Tuz, Alkatip Tor, Microsoft Uighur, Noto Sans Arabic |
| `ii` | ꆈꌠꉙ | Nuosu Yi | LTR | Nuosu SIL, Microsoft Yi Baiti, Noto Sans Yi |
| `ja` | 日本語 | Japanese | LTR | Hiragino Sans, Meiryo, Noto Sans CJK JP |
| `ko` | 한국어 | Korean | LTR | Apple SD Gothic Neo, Malgun Gothic |
| `fr` | Français | French | LTR | System Default |
| `de` | Deutsch | German | LTR | System Default |
| `ru` | Русский | Russian | LTR | System Default |
| `es` | Español | Spanish | LTR | System Default |

---

## 🚀 Installation & Usage

### 1. Install via DSH CLI

Run the following command in your terminal:

```bash
dsh plugin --profile web add @anarkhgatsby/deepseek-harness-locale-pack
```

### 2. Switch Language in the UI

1. Open **DeepSeek Harness**;
2. Click **Settings** (⚙️) ➔ Navigate to **General**;
3. In the **Language** dropdown, select your desired language (e.g. `བོད་སྐད། (藏文)`, `ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ (蒙古文)`, `ئۇيغۇرچە (维吾尔文)`, `ꆈꌠꉙ (彝文)`);
4. The entire interface will instantly switch with native typography and alignment!

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│              DeepSeek Harness Host / Core               │
└────────────────────────────┬────────────────────────────┘
                             │ Cordis Lifecycle Hook
                             ▼
┌─────────────────────────────────────────────────────────┐
│     @anarkhgatsby/deepseek-harness-locale-pack          │
├────────────────────────────┬────────────────────────────┤
│  1. Inverted Index Engine  │  2. Scope DOM Observer     │
│  - 650+ Exact Phrase Pairs │  - Real-time MutationWatch │
│  - Multi-directional Map   │  - Double RAF Dispatch     │
├────────────────────────────┼────────────────────────────┤
│  3. RTL Typography Engine  │  4. Dynamic Schema Hook    │
│  - Direction: rtl for 'ug' │  - Extends ctx.locale      │
│  - Native Ethnic Font Stac │  - Preserves user states   │
└────────────────────────────┴────────────────────────────┘
```

1. **AST-Driven Official Lexicon Extraction**: Extracted from all 40+ official `@deepseek-ai/dsh-client-ui-*` packages to guarantee 100% lexical fidelity;
2. **Multi-Language Inverted Index**: Allows instantaneous transitions from any source language to any target language without losing canonical keys;
3. **Reactive Double-Frame Scheduling**: Synchronously swaps DOM nodes and catches React portal re-renders within the next `requestAnimationFrame`.

---

## 🤝 Contributing

Contributions are welcome! If you would like to improve translations or add new languages:

1. Fork the repository;
2. Edit or add translation entries in `scripts/build-instant-refresh-locale.mjs`;
3. Run `npm test` to verify contract integrity;
4. Submit a Pull Request.

---

## 📄 License & Disclaimer

- **License**: Released under the [MIT License](LICENSE).
- **Disclaimer**: This is an independent, community-developed plugin and is not officially affiliated with DeepSeek AI.

