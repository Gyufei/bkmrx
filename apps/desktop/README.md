# bkmrx Desktop

bkmrx Desktop 是仅在 macOS 本机运行的 Tauri 书签与 Markdown 笔记应用。书签由 Rust 后端通过 `rusqlite` 直接维护，React WebView、本机 HTTP API 和 Chrome 扩展共用同一个 `BookmarkService`。

[返回项目首页](../../README.md) · [Chrome 扩展](../chrome-extension/README.md) · [系统架构](../../docs/ARCHITECTURE.md) · [HTTP API](../../docs/reference/http-api.md)

## 核心能力

- 使用 SQLite 作为书签数据的唯一事实来源。
- 使用规范化的 `bookmarks`、`tags` 和 `bookmark_tags` 关系模型。
- 中文全文搜索使用 FTS5 Trigram，1–2 个 Unicode 字符使用参数化 `LIKE` 回退。
- 默认列表、标签筛选、全文搜索和组合搜索统一使用不透明游标分页。
- React 前端通过 TanStack Query `useInfiniteQuery` 每页加载 50 条。
- 提供 Markdown 笔记的创建、编辑、重命名与删除。
- 支持 JSON v1 原子导出、严格预检、SHA-256 确认和事务合并导入。
- 在 `127.0.0.1:8733` 提供本机 HTTP API，供 Chrome 扩展调用。

项目不包含语义搜索、向量索引、ONNX、`sqlite-vec` 或 WebView SQL 权限。

## 本地数据

| 内容 | 路径 |
|---|---|
| SQLite | `~/Library/Application Support/com.bkmrx/bookmarks.db` |
| 设置 | `~/Library/Application Support/com.bkmrx/settings.json` |
| 迁移备份根目录 | `/Users/gyf/MyLib/bkmr-sync/migration-backups/` |

不同 Mac 之间不直接同步 SQLite；请使用设置页的 JSON 导出与导入传输数据。

## 开发

要求 Apple Silicon Mac、Node.js 18+、pnpm 和 Rust toolchain。

从仓库根目录执行：

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm tauri dev
pnpm tauri build --bundles app
```

Rust 检查：

```bash
cd apps/desktop/src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

## 架构

```text
React / Tauri IPC ─┐
                   ├─ BookmarkService ─ Repository ─ SQLite
Chrome / Axum API ─┘                  └─ BookmarkSearch ─ FTS5 Trigram
```

Rust 书签代码位于 `src-tauri/src/bookmarks/`：

- `repository.rs`：CRUD、标签关系和 FTS 同事务维护。
- `search.rs`：Trigram、短查询 `LIKE` 和游标分页。
- `service.rs`：Tauri 与 HTTP 共用的业务入口。
- `transfer.rs`：JSON v1 导入导出。

`BookmarkSearch` 是可替换边界。未来可以增加其他搜索实现，但 SQLite 仍是唯一事实来源，上层分页与 DTO 保持不变。

更多设计背景见[系统架构](../../docs/ARCHITECTURE.md)。

## HTTP API

应用启动后可访问 `http://127.0.0.1:8733/api/docs`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/bookmarks` | 查询与游标分页 |
| POST | `/api/bookmarks` | 创建书签 |
| GET | `/api/bookmarks/by-url?url=` | 按 URL 查询 |
| GET | `/api/bookmarks/:id` | 按 ID 查询 |
| PATCH | `/api/bookmarks/:id` | 局部更新 |
| DELETE | `/api/bookmarks/:id` | 删除书签 |
| GET | `/api/tags` | 查询标签与计数 |

完整参数、响应与错误格式见 [HTTP API 文档](../../docs/reference/http-api.md)。

## 相关项目

Chrome 扩展通过桌面端 HTTP API 保存当前网页，安装与调试方式见 [Chrome 扩展 README](../chrome-extension/README.md)。

## 许可证

MIT
