# bkmrx

bkmrx 是一个仅在 macOS 本机运行的 Tauri 书签与 Markdown 笔记工具。书签由 Rust 后端通过 `rusqlite` 直接维护，WebView、HTTP API 和 Chrome 扩展都通过同一个 `BookmarkService` 访问数据。

## 书签能力

- SQLite 是唯一事实来源，数据库位于 `~/Library/Application Support/com.bkmrx/bookmarks.db`。
- `bookmarks`、`tags`、`bookmark_tags` 使用规范化关系模型。
- 中文搜索使用 FTS5 Trigram；1–2 个 Unicode 字符使用安全参数化 LIKE 回退。
- 默认列表、标签筛选、全文搜索和组合搜索统一使用不透明游标分页。
- React 前端通过 TanStack Query `useInfiniteQuery` 每页加载 50 条。
- 设置页支持 JSON v1 原子导出、严格预检、SHA-256 确认和事务合并导入。
- 本机 HTTP API 监听 `127.0.0.1:8733`，供 Chrome 扩展使用。

不包含语义搜索、向量索引、ONNX、sqlite-vec 或 WebView SQL 权限。

## 本地路径

| 内容 | 路径 |
|---|---|
| SQLite | `~/Library/Application Support/com.bkmrx/bookmarks.db` |
| 设置 | `~/Library/Application Support/com.bkmrx/settings.json` |
| 迁移备份根目录 | `/Users/gyf/MyLib/bkmr-sync/migration-backups/` |

不同 Mac 之间不直接同步 SQLite；使用设置页的 JSON 导出与导入。

## 开发

要求 Apple Silicon Mac、Rust toolchain、Node.js 18+ 和 pnpm。

```bash
pnpm install
pnpm test
pnpm build

cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
cd ..

pnpm tauri dev
pnpm tauri build --bundles app
```

## 架构

```text
React / Tauri IPC ─┐
                   ├─ BookmarkService ─ Repository ─ SQLite
Chrome / Axum API ─┘                  └─ BookmarkSearch ─ FTS5 Trigram
```

`BookmarkSearch` 是可替换边界。将来可以增加 Meilisearch 实现，但 SQLite 继续作为唯一事实来源，上层分页与 DTO 不变。

Rust 书签代码位于 `src-tauri/src/bookmarks/`：

- `repository.rs`：CRUD、标签关系和 FTS 同事务维护；
- `search.rs`：Trigram、短查询 LIKE 和游标；
- `service.rs`：Tauri 与 HTTP 共用的业务入口；
- `transfer.rs`：永久保留的 JSON v1 导入导出。

## HTTP API

应用启动后可访问 `http://127.0.0.1:8733/api/docs`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/bookmarks` | 查询与游标分页 |
| POST | `/api/bookmarks` | 创建 |
| GET | `/api/bookmarks/by-url?url=` | 按 URL 查询 |
| GET | `/api/bookmarks/:id` | 按 ID 查询 |
| PATCH | `/api/bookmarks/:id` | 局部更新 |
| DELETE | `/api/bookmarks/:id` | 删除 |
| GET | `/api/tags` | 标签与计数 |

错误统一返回：

```json
{
  "error": {
    "code": "bookmark_url_conflict",
    "message": "A bookmark with this URL already exists",
    "details": {}
  }
}
```

## 迁移与回滚

- [迁移操作手册](docs/migration/runbook.md)
- [回滚操作手册](docs/migration/rollback.md)

一次性 BKMR 迁移工具只在 `legacy-migration` feature 下构建，并在真实迁移成功后从源码删除。日常跨设备传输只使用 JSON v1。

## 许可证

MIT
