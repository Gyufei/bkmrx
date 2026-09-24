# bkmrx

bkmrx 是一套本地优先的个人信息工作台，由 macOS 桌面应用和 Chromium 浏览器扩展组成。桌面端在本机保存数据，并将书签能力通过仅监听回环地址的 HTTP API 提供给扩展使用。

```text
┌─────────────────────────────────────────────────────┐
│                    bkmrx Desktop                     │
│                                                     │
│  React + TypeScript ── Tauri IPC ── Rust domain      │
│          │                            │              │
│  书签 / 笔记 / Todo / 日历 / RSS       └── SQLite     │
└──────────────────────────┬──────────────────────────┘
                           │ 127.0.0.1:8733
                    Chrome / Edge 扩展
```

## 功能

- **书签与导航**：书签、标签、星标、全文搜索、网页预览，以及可自定义的常用站点导航分类。
- **Notes Workspace**：选择本机目录作为笔记工作区，编辑 Markdown，查看可信的自包含 HTML，并将其他文件交给系统应用打开。
- **Todo 与日历**：带标签、归档、开始日和截止日的待办；月历聚合本地事件、待办、农历、节气与节假日/调休信息。
- **RSS 阅读**：订阅、刷新和阅读 RSS/Atom，支持将文章保存为书签；可在设置中配置 RSSHub 服务。
- **数据可携带性**：书签数据集可导出，并只能在空书签域中初始化导入，避免意外合并覆盖。
- **浏览器快捷保存**：Chrome/Edge 扩展读取当前标签页，检查 URL 是否已保存，并通过桌面端本机 API 创建或更新书签。

所有核心数据保存在本机。第三方服务（当前包括小牛翻译和可选 RSSHub）由桌面端按需调用；浏览器扩展不存储独立的书签副本，也不接触服务凭据。

## 项目结构

```text
bkmrx/
├── apps/
│   ├── desktop/                 # Tauri 2 + React 19 桌面应用
│   │   ├── src/                 # React 工作区、页面与组件
│   │   └── src-tauri/src/       # Rust 领域模块、SQLite、IPC 与本机 HTTP 服务
│   └── chrome-extension/        # Svelte 5 + Vite Manifest V3 扩展
├── docs/                        # 功能设计、迁移记录与团队约定
├── CHANGELOG.md                 # 版本变更记录
├── package.json                 # pnpm 工作区统一命令
└── pnpm-workspace.yaml
```

桌面端的 Rust 后端按 `bookmarks`、`navigation`、`notes`、`todos`、`calendar`、`rss`、`settings` 等领域模块组织。SQLite 是书签、导航、待办、RSS 与日历事件的持久化边界；Notes Workspace 则保留用户选择目录中的原始文件。前端通过 Tauri IPC 调用桌面能力，书签 REST API 仅供本机扩展使用。

## 开始开发

### 环境要求

- macOS（当前桌面应用的发布目标）
- Node.js 18 或更高版本
- pnpm
- Rust toolchain，以及 Tauri 2 所需的 macOS 构建环境
- Chrome、Edge 或其他支持 Manifest V3 的 Chromium 浏览器（使用扩展时）

安装依赖：

```bash
pnpm install
```

常用命令：

```bash
pnpm dev                 # 启动桌面端 Vite 前端
pnpm tauri dev           # 启动完整 Tauri 桌面应用
pnpm dev:extension       # 监听构建浏览器扩展
pnpm build               # 构建全部工作区
pnpm test                # 运行全部测试
pnpm check               # 运行已配置的静态检查
```

桌面端 Rust 验证：

```bash
cd apps/desktop/src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

## 浏览器扩展

先构建扩展：

```bash
pnpm --filter bkmrx-ext build
```

随后在 `chrome://extensions/` 开启开发者模式，选择“加载已解压的扩展程序”，并加载 `apps/chrome-extension/dist`。使用扩展前，需启动 bkmrx Desktop；默认 API 地址为 `http://127.0.0.1:8733`。

开发、配置和故障排查请参阅 [扩展 README](apps/chrome-extension/README.md)。

## 更多文档

- [桌面端 README](apps/desktop/README.md)
- [版本变更记录](CHANGELOG.md)
- [功能与设计记录](docs/features/)
- [领域文档约定](docs/agents/domain.md)

## 许可证

MIT
