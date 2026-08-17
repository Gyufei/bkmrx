# bkmrx

bkmrx 是一套本地优先的书签与 Markdown 笔记工具，由 macOS 桌面应用和 Chrome 扩展组成。桌面端负责数据存储、搜索和本机 HTTP API；浏览器扩展通过该 API 快速保存当前网页。

```text
Chrome 扩展 ── HTTP API ──┐
                          ├─ BookmarkService ── SQLite
React / Tauri IPC ────────┘
```

所有书签数据只保存在本机 SQLite 中，扩展不维护独立副本。

## 子项目

| 项目 | 说明 | 文档 |
|---|---|---|
| Desktop | Tauri + React 桌面应用，提供书签、标签、搜索、Markdown 笔记和数据导入导出 | [桌面端 README](apps/desktop/README.md) |
| Chrome Extension | Manifest V3 浏览器扩展，用于保存当前页面并添加标签 | [扩展 README](apps/chrome-extension/README.md) |

## 仓库结构

```text
bkmrx/
├── apps/
│   ├── desktop/           # Tauri + React 桌面应用
│   └── chrome-extension/  # 零构建的 Chrome 扩展
├── docs/                  # 架构、API、迁移和开发文档
├── package.json           # 根目录统一命令
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

当前 pnpm workspace 只包含桌面端。Chrome 扩展由原生 HTML、CSS 和 JavaScript 构成，可直接加载，不需要安装依赖或执行构建。

## 开始开发

### 环境要求

- Apple Silicon Mac
- Node.js 18+
- pnpm
- Rust toolchain
- Chrome、Edge 或其他支持 Manifest V3 的 Chromium 浏览器

### 桌面端

在仓库根目录执行：

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm tauri dev
```

完整的 Rust 检查、应用打包和本地数据说明见[桌面端 README](apps/desktop/README.md)。

### Chrome 扩展

打开 `chrome://extensions/`，启用开发者模式，然后选择“加载已解压的扩展程序”，加载 `apps/chrome-extension`。

扩展依赖桌面应用运行在 `http://127.0.0.1:8733` 的本机 API。详细安装与调试方式见[扩展 README](apps/chrome-extension/README.md)。

## 项目文档

- [系统架构](docs/ARCHITECTURE.md)
- [文档索引](docs/README.md)
- [HTTP API](docs/reference/2026-07-24-http-api.md)
- [历史功能](docs/features/)

## 许可证

MIT
