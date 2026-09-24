# bkmrx Desktop

bkmrx Desktop 是 bkmrx 的本地运行时与数据中心：它提供 React 桌面界面、Rust 领域服务、SQLite 持久化、Tauri IPC，以及供浏览器扩展使用的本机 HTTP API。

[返回项目首页](../../README.md) · [浏览器扩展](../chrome-extension/README.md) · [版本变更记录](../../CHANGELOG.md)

## 工作区

| 工作区 | 能力 |
|---|---|
| 书签 | 书签、标签、星标、全文搜索、网页预览和常用导航分类 |
| 笔记 | 以用户选择的 Notes Workspace 管理 Markdown、HTML 与其他本地文件 |
| Todo | 待办、标签、状态、归档、开始日、截止日和 Markdown 导出 |
| 日历 | 日历事件、Todo 投影、农历、节气、节假日与调休 |
| RSS | 订阅管理、文章阅读、图片下载与将文章保存为书签 |
| 设置 | Notes Workspace、书签数据初始化、RSSHub 和翻译 Provider 配置 |

## 架构

```text
React 19 + TypeScript
        │
        ├── Tauri IPC ────────── Rust 领域模块 ─── SQLite
        │                         ├── bookmarks / navigation
        │                         ├── todos / calendar / rss
        │                         └── settings / notes / preview
        │
Chrome 扩展 ── Axum HTTP API ─── BookmarkStore
```

- `src/`：React 页面、领域 UI、TanStack Query 数据协调，以及由 `tauri-specta` 生成的 IPC 类型绑定。
- `src-tauri/src/`：Rust 领域模块、数据库迁移、安全出站 HTTP、文件系统策略、本机 API 和 Provider 运行时。
- 书签、导航、待办、RSS 与日历事件保存在应用数据目录中的 SQLite；Notes Workspace 中的文件始终存放在用户选择的目录。
- 本机 API 默认仅绑定 `127.0.0.1:8733`，当前供浏览器扩展调用书签、标签和描述翻译接口。

## 开发

要求：macOS、Node.js 18+、pnpm、Rust toolchain 和 Tauri 2 所需的 macOS 构建环境。

从仓库根目录安装依赖后：

```bash
pnpm tauri dev
pnpm --filter bkmrx test
pnpm --filter bkmrx build
pnpm --filter bkmrx tauri build --bundles app
```

运行 Rust 测试与静态检查：

```bash
cd apps/desktop/src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

开发模式会从 Rust 命令签名生成 `src/bindings.ts`；该文件是前后端 IPC 类型的单一契约，应随 Rust 命令变更一并更新。

## 本地服务与外部 Provider

应用启动后会尝试启动 `http://127.0.0.1:8733`。可通过 `http://127.0.0.1:8733/api/health` 检查状态，`/api/docs` 提供当前 REST API 的交互说明。

翻译与 RSSHub 均为可选服务：未配置时，书签、笔记、Todo、日历和 RSS 的本地能力仍可使用。翻译凭据保存在桌面应用的 Application Settings 中，只由 Rust 进程使用，不会进入 WebView 或浏览器扩展构建产物。

## 数据管理

- 书签数据集包含书签、标签、导航分类及其关联；不包含 Todo、RSS、Notes Workspace 或 Application Settings。
- 导入仅可初始化空书签域，不执行合并导入。
- 如需在设备间迁移书签，请使用设置页的数据导出与初始化功能；Notes Workspace 文件请自行通过文件系统同步或备份。

## 许可证

MIT
