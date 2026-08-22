# Third-Party Notices

Harness Desktop for macOS is licensed under the MIT License in `APP_LICENSE`.
It embeds DeepSeek Harness and a production runtime dependency closure. Every
third-party component remains subject to its own license; nothing in this file
changes those terms.

## DeepSeek Harness

This distribution embeds `@deepseek-ai/dsh` version `0.1.1-rc.2`.

- Project: https://github.com/deepseek-ai/deepseek-harness
- Package: https://www.npmjs.com/package/@deepseek-ai/dsh
- License: MIT
- Copyright: Copyright (c) 2026 DeepSeek
- Full license text: `DEEPSEEK_HARNESS_LICENSE`

The upstream MIT license requires its copyright and permission notice to be
included in copies or substantial portions of the software. This distribution
includes that notice both here and inside the embedded npm package.

## Runtime npm dependencies

The release build generates `legal/RUNTIME_PACKAGE_INVENTORY.md` inside the
embedded runtime archive from the exact installed production dependency
closure. It records every embedded npm package's name, exact version, and
declared license. Package-provided `LICENSE`, `NOTICE`, `COPYING`, and README
files are retained next to package code under `node_modules/`.

`package-lock.json` in the embedded runtime records the exact dependency tree.
The generated inventory and package files, rather than a manually maintained
summary, are authoritative for a particular release artifact.

Some dependencies use licenses that require notices or attribution beyond a
short SPDX label. Their complete package-supplied texts remain in the embedded
runtime and must not be removed from release artifacts.

## Bundled Node.js runtime

The App embeds the Node.js executable used to run DeepSeek Harness. The build
copies the complete license file belonging to the exact bundled Node.js binary
to `legal/NODEJS_LICENSE` inside the embedded runtime. That file contains the
Node.js license and bundled-component notices and must remain in every release.
The generated runtime inventory records the exact Node.js version.

## Tauri and Rust dependencies

The desktop shell is built with Tauri and Rust crates. Their exact versions are
pinned in `src-tauri/Cargo.lock`; each remains governed by its own license.
The release build generates and ships `RUST_THIRD_PARTY_LICENSES.txt` from the
locked Cargo dependency graph. It includes exact crate versions, declared SPDX
expressions, repository metadata, and package-supplied license/notice texts.
Do not publish a binary if generation fails or the resulting report has not
been reviewed.

## Branding and affiliation

This is an independently developed, unofficial client. It is not a DeepSeek
product and is not sponsored, endorsed, or approved by DeepSeek. The names
“DeepSeek” and “DeepSeek Harness” are used only to identify compatibility and
the embedded upstream project. MIT licenses grant copyright permissions; they
do not grant trademark rights.

Use of DeepSeek APIs, models, or online services remains subject to the terms
applicable to those services.
