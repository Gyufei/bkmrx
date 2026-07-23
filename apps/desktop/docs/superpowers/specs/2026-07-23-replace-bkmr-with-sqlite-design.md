# bkmrx 移除 BKMR 并自建 SQLite 书签后端设计

> 日期：2026-07-23  
> 状态：已确认  
> 适用仓库：`/Users/gyf/MyLib/bkmr-sync/bkmrx`  
> 关联仓库：`/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext`

## 1. 背景

当前 bkmrx 通过 `bkmr_lib` 使用 BKMR 的书签、标签、FTS5、向量搜索和数据库迁移能力。实际业务只需要本地书签 CRUD、标签管理、全文搜索、访问次数、JSON 备份以及 Chrome 扩展调用。

现有调用链：

```text
React
  → Tauri Commands
    → service.rs
      → bkmr_lib::ServiceContainer
        → Diesel / rusqlite / FTS5 / sqlite-vec / ONNX
```

当前默认数据库：

```text
~/.config/bkmr/bkmr.db
```

已检查的真实数据库共有 2145 条书签，旧表字段包括：

```text
id, URL, metadata, tags, desc, flags, last_update_ts,
embedding, content_hash, created_ts, embeddable,
file_path, file_mtime, file_hash, opener, accessed_at
```

其中：

- `metadata` 是书签标题；
- `flags` 是访问次数；
- `embedding` 当前全部为空；
- `content_hash` 仅服务于向量嵌入；
- 当前 App 新增书签时不抓取网页元数据；
- 当前 App 不需要 BKMR 的系统标签约束；
- 当前 App 不需要向量或语义搜索。

## 2. 目标

1. 删除 `bkmr_lib`、Diesel、ONNX、sqlite-vec 和全部 BKMR 服务容器依赖。
2. 使用 Rust `rusqlite` 直接维护 SQLite。
3. 使用规范化的书签、标签和书签标签关系表。
4. 使用 FTS5 Trigram 支持中文和英文子串搜索。
5. 对 1–2 个 Unicode 字符的查询回退到安全的 `LIKE`。
6. 为默认列表、标签筛选、文本搜索及组合搜索提供统一游标分页。
7. 前端使用 React Query `useInfiniteQuery`。
8. 保留适度的搜索接口，使未来可新增 Meilisearch 等实现。
9. SQLite 永远是唯一事实来源，搜索索引是可删除、可重建的派生数据。
10. 新增版本化 JSON 导出、预检和安全合并导入。
11. 一次性迁移当前 BKMR 数据，迁移完成后彻底删除迁移代码。
12. 更新 Chrome 扩展和前端，不为旧字段或旧 API 保留兼容适配。
13. 构建 Apple Silicon `.app` 并完成本机安装、验收与回滚演练。

## 3. 非目标

- 不实现向量搜索、语义搜索或嵌入生成。
- 不实现 Meilisearch；只保留可替换搜索边界。
- 不实现多设备 SQLite 文件同步。
- 不把活跃 SQLite 文件放进 iCloud Drive、Dropbox 等同步目录。
- 不兼容旧 BKMR 或旧 App JSON 格式。
- 不实现 DMG、Apple Developer 签名、公证、自动更新或发布流水线。
- 不构建 Intel 或 Universal macOS 包。
- 不保留旧 Tauri Commands、旧 HTTP 响应或旧字段别名。

## 4. 已确认的设计原则

### 4.1 整洁优先于兼容

当前 App、前端和 Chrome 扩展都在本机并可协调升级。因此：

- 删除旧 DTO、旧命令和旧错误字符串判断；
- 不使用 serde alias；
- 不保留 deprecated API；
- 同步更新 App、扩展与文档；
- 产品名 `bkmrx` 和 Bundle Identifier `com.bkmrx` 保留。

### 4.2 数据边界

WebView 不接触 SQL 或数据库 schema：

```text
WebView
  → Tauri Commands / HTTP API
    → BookmarkService
      → BookmarkRepository / BookmarkSearch
        → rusqlite
          → SQLite
```

不安装 `tauri-plugin-sql`。原生文件选择使用 `tauri-plugin-dialog`，但 JSON 读取、解析和写库全部在 Rust 后端完成。

### 4.3 事实来源

- SQLite 保存全部业务事实。
- FTS5 是 SQLite 内的派生搜索索引。
- 未来外部搜索引擎只能是可重建索引。
- CRUD 必须先成功写入 SQLite。
- 搜索后端失败不得损坏书签事实数据。

## 5. 方案比较

### 5.1 单一 `db.rs`

优点：

- 代码最少；
- 交付最快。

缺点：

- CRUD、标签、搜索、导入导出和迁移容易堆积；
- 未来新增搜索实现会牵动业务服务。

### 5.2 Repository + Search 接口

优点：

- Repository 只负责事实数据；
- Search 只负责查询和排序；
- Service 维持业务约束；
- 可替换搜索实现不会影响上层；
- 当前实现仍然足够轻量。

缺点：

- 比单文件方案增加少量接口代码。

### 5.3 完整端口适配器和事件驱动

优点：

- 扩展能力最强；
- 适合复杂外部索引同步。

缺点：

- 当前没有事件总线、outbox 或远程服务需求；
- 会显著增加代码、依赖和测试成本。

### 5.4 结论

采用方案 5.2，只实现：

- `SqliteBookmarkRepository`
- `SqliteFtsSearch`

不提前实现 Meilisearch、索引同步队列、事件总线或 outbox。

## 6. 模块结构

```text
src-tauri/src/
├── database.rs
├── bookmarks/
│   ├── mod.rs
│   ├── model.rs
│   ├── repository.rs
│   ├── search.rs
│   ├── service.rs
│   └── transfer.rs
├── commands.rs
├── http_server.rs
├── settings.rs
├── lib.rs
└── main.rs
```

职责：

- `database.rs`
  - 解析 `app_data_dir`；
  - 打开 SQLite；
  - 设置 PRAGMA；
  - 运行新数据库 schema migration；
  - 提供受控连接边界。
- `bookmarks/model.rs`
  - 领域模型；
  - API DTO；
  - 分页 DTO；
  - JSON 导入导出 DTO；
  - 结构化错误类型。
- `bookmarks/repository.rs`
  - `BookmarkRepository`；
  - SQLite CRUD；
  - 标签关系；
  - 批量装载；
  - 访问次数；
  - FTS 文档事务同步。
- `bookmarks/search.rs`
  - `BookmarkSearch`；
  - `SqliteFtsSearch`；
  - 游标编码与验证；
  - Trigram、短查询回退和标签组合。
- `bookmarks/service.rs`
  - 业务校验；
  - Repository 与 Search 编排；
  - 分页结果组装；
  - JSON 合并事务；
  - 事件通知。
- `bookmarks/transfer.rs`
  - JSON v1 格式；
  - 导出；
  - 导入预检；
  - 文件 hash；
  - 格式校验。
- `commands.rs`
  - Tauri 适配；
  - 不包含 SQL。
- `http_server.rs`
  - Axum 适配；
  - HTTP 状态映射；
  - 不包含 SQL。

临时迁移工具：

```text
src-tauri/src/bin/migrate_bkmr.rs
```

它由 `legacy-migration` feature 隔离。正式 App 不得依赖该 binary。真实迁移和验收完成后删除 binary、feature、专用测试和旧依赖。

## 7. 数据库位置与初始化

正式数据库：

```text
~/Library/Application Support/com.bkmrx/bookmarks.db
```

正式设置：

```text
~/Library/Application Support/com.bkmrx/settings.json
```

路径必须通过 Tauri v2 `app.path().app_data_dir()` 获取，不手写 `HOME`。

每个连接启用：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

schema 版本使用：

```sql
PRAGMA user_version;
```

规则：

- 新库从 0 开始运行所有新 schema migration；
- migration 在事务中执行；
- 成功后才更新 `user_version`；
- 数据库版本高于 App 支持版本时拒绝启动；
- 旧 BKMR 数据迁移不进入 App 启动流程。

## 8. 数据库 schema

### 8.1 `bookmarks`

```sql
CREATE TABLE bookmarks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    url           TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    access_count  INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    accessed_at   INTEGER NULL
);
```

时间统一保存 UTC Unix 毫秒。API 与 JSON 转换为 RFC 3339。

URL 规则：

- 保存前 trim；
- 唯一性按完整 URL；
- 不删除 query；
- 不删除 fragment；
- 不改变大小写；
- 不做未经确认的 canonicalization。

### 8.2 `tags`

```sql
CREATE TABLE tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);
```

### 8.3 `bookmark_tags`

```sql
CREATE TABLE bookmark_tags (
    bookmark_id INTEGER NOT NULL
        REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL
        REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX idx_bookmark_tags_tag_bookmark
    ON bookmark_tags(tag_id, bookmark_id);
```

### 8.4 `bookmarks_fts`

FTS5 使用 Trigram，`rowid` 与 `bookmarks.id` 一致。索引内容：

- URL；
- 标题；
- 描述；
- 聚合标签文本。

FTS 是派生数据。Repository 必须在同一个事务中更新：

1. 业务表；
2. 标签关系；
3. 对应 FTS 文档。

提供内部 `rebuild_search_index()`，可从三张业务表重建全部 FTS 文档。

## 9. 领域模型和统一命名

统一书签模型：

```text
Bookmark
- id
- url
- title
- description
- tags
- access_count
- created_at
- updated_at
- accessed_at
```

以下旧名称全部删除：

- `BkmrBookmark`
- `BkmrTag`
- `metadata`
- `flags`
- `modified`
- `bkmr_config_path`
- `bkmr_version`
- `bkmr_repo`
- `onnx_available`

Rust、Tauri IPC、HTTP JSON、TypeScript 与 JSON 导出统一使用 snake_case，不做字段转换层。

## 10. CRUD 语义

### 10.1 新增

- URL trim 后不能为空；
- URL 唯一；
- 标题为空时由业务层使用 URL；
- 标签 trim、去重并忽略空标签；
- 一次事务写书签、标签关系和 FTS；
- 不抓取网页元数据；
- 不创建 embedding。

### 10.2 更新

- 使用明确的 patch 输入；
- 只更新请求中出现的字段；
- 标签字段出现时替换完整标签集合；
- 内容变化更新 `updated_at`；
- 更新 FTS 文档；
- 返回更新后的完整 Bookmark。

### 10.3 删除

- 删除书签；
- 外键级联删除关系；
- 清理无引用标签由明确的 Repository 操作完成；
- 删除 FTS 文档；
- 全部在一个事务中。

### 10.4 访问记录

- `access_count + 1`；
- `accessed_at` 设置为当前时间；
- 不改变 `updated_at`；
- 不重建 FTS。

## 11. 搜索边界

```text
BookmarkService.search(request)
  → BookmarkSearch.search(request)
    → ordered bookmark IDs + cursor
  → BookmarkRepository.get_by_ids(ids)
    → complete bookmarks in search order
```

`BookmarkSearch` 的替代实现必须满足：

- 相同输入校验；
- 相同标签“全部匹配”语义；
- 相同分页结构；
- 稳定且不透明的游标；
- 返回有序书签 ID；
- 不拥有书签事实数据。

当前仅实现 `SqliteFtsSearch`。

## 12. 搜索规则

### 12.1 查询类型

1. 空文本、空标签：
   - 按 `updated_at DESC, id DESC`。
2. 空文本、有标签：
   - 书签必须包含全部标签；
   - 按 `updated_at DESC, id DESC`。
3. 1–2 个 Unicode 字符：
   - 对 URL、标题、描述、聚合标签执行参数化 LIKE；
   - 转义 `%`、`_` 和 escape 字符；
   - 不拼接 SQL。
4. 3 个及以上 Unicode 字符：
   - 使用 FTS5 Trigram；
   - 用户输入作为安全的字面查询；
   - 特殊字符不得产生 FTS 语法错误。
5. 文本加标签：
   - 文本产生候选；
   - 关系表保证全部标签命中。

### 12.2 排序

- 默认与纯标签：
  - `updated_at DESC`
  - `id DESC`
- 文本：
  - FTS 相关度；
  - `updated_at DESC`
  - `id DESC`

`access_count` 不参与默认排序。

### 12.3 中文要求

必须覆盖：

- 单个汉字；
- 两个汉字；
- 三个及以上汉字；
- 中英文混合；
- 标题、URL、描述和标签；
- 特殊符号。

不使用：

- `porter trigram`；
- 双 FTS 索引；
- Jieba；
- ICU 自定义 tokenizer。

## 13. 分页契约

```text
BookmarkPageRequest
- query: String
- tags: Vec<String>
- cursor: Option<String>
- page_size: u32

BookmarkPage
- items: Vec<Bookmark>
- next_cursor: Option<String>
```

约束：

- 默认 `page_size = 50`；
- 范围 `1..=100`；
- cursor 对调用方不透明；
- cursor 包含版本和查询模式；
- cursor 必须与查询条件匹配；
- cursor 损坏、未知版本或不匹配返回 `invalid_cursor`；
- 每次查询 `page_size + 1` 条判断是否有下一页；
- 默认列表可使用 `(updated_at, id)` keyset；
- SQLite FTS 初始实现可在内部使用受控 offset；
- 未来搜索实现可使用自己的 token。

所有列表路径统一分页：

- 默认列表；
- 纯标签；
- 文本；
- 文本加标签。

标签统计单独查询，不跟随书签分页。

## 14. React Query

`BookmarkView` 改用 `useInfiniteQuery`：

```text
queryKey:
  bookmarks + normalized query + sorted tags + page size

initialPageParam:
  null

getNextPageParam:
  lastPage.next_cursor
```

列表数据：

```text
pages.flatMap(page => page.items)
```

加载规则：

- IntersectionObserver 触底取下一页；
- 仅在 `hasNextPage && !isFetchingNextPage` 时触发；
- 首屏加载与下一页加载显示不同状态；
- 下一页失败保留已加载数据并允许重试；
- query 或 tags 改变后从第一页开始；
- CRUD、JSON 导入和 HTTP 变更事件失效书签无限查询；
- 标签变化同时失效标签统计。

## 15. Tauri Commands

建议命令：

```text
query_bookmarks
create_bookmark
update_bookmark
delete_bookmarks
get_bookmark_by_url
get_tags
record_bookmark_access
export_bookmarks
preview_bookmark_import
apply_bookmark_import
get_settings
update_settings
get_system_info
```

删除：

```text
load_all_bookmarks
hybrid_search_bookmarks
check_bookmark
backup_bookmarks
```

Tauri 错误返回结构化 `AppError`，不再只返回字符串。

## 16. HTTP API

服务地址保留：

```text
http://127.0.0.1:8733
```

API：

```text
GET    /api/health
GET    /api/bookmarks?query=&tags=&cursor=&page_size=
POST   /api/bookmarks
GET    /api/bookmarks/by-url?url=
GET    /api/bookmarks/:id
PATCH  /api/bookmarks/:id
DELETE /api/bookmarks/:id
GET    /api/tags
```

响应：

- 单资源直接返回资源；
- 分页返回 `BookmarkPage`；
- POST 返回 `201 + Bookmark`；
- PATCH 返回更新后的 Bookmark；
- DELETE 返回 204；
- 不返回无意义的 `status` 字符串；
- 不使用统一 `{ data }` 包装。

错误：

```json
{
  "error": {
    "code": "bookmark_url_conflict",
    "message": "Bookmark URL already exists",
    "details": {
      "url": "https://example.com"
    }
  }
}
```

稳定错误码：

| code | HTTP |
|---|---:|
| `validation_error` | 400 |
| `invalid_cursor` | 400 |
| `bookmark_not_found` | 404 |
| `bookmark_url_conflict` | 409 |
| `unsupported_import_format` | 422 |
| `import_validation_failed` | 422 |
| `database_error` | 500 |
| `internal_error` | 500 |

Chrome 扩展与 App 同步升级，不保留旧 API 适配。

## 17. JSON 导出

唯一格式：

```json
{
  "format_version": 1,
  "exported_at": "2026-07-23T19:30:00Z",
  "app_version": "0.1.0",
  "bookmarks": [
    {
      "url": "https://example.com",
      "title": "Example",
      "description": "",
      "tags": ["docs"],
      "access_count": 3,
      "created_at": "2026-07-01T08:00:00Z",
      "updated_at": "2026-07-20T08:00:00Z",
      "accessed_at": null
    }
  ]
}
```

JSON 不导出数据库 ID。跨设备身份是完整 URL。

导出要求：

- 在一致性读事务中读取；
- 先写同目录临时文件；
- flush 和 fsync；
- 原子重命名；
- 文件名包含精确时间；
- 新版只导出 v1；
- 不兼容旧 BKMR 或旧 App JSON。

## 18. JSON 导入

### 18.1 预检

```text
preview_bookmark_import(path)
```

返回：

```text
ImportPreview
- file_hash
- total
- create_count
- update_count
- skip_count
```

严格校验：

- `format_version = 1`；
- 必需字段；
- RFC 3339 时间；
- URL；
- 标签；
- 文件内重复 URL；
- 不支持未知格式。

任一无效记录阻止确认。

### 18.2 应用

```text
apply_bookmark_import(path, file_hash)
```

执行前重新读取并校验 SHA-256，防止预检后云盘替换文件。

整批使用一个事务。

合并规则：

- 本机无 URL：新增；
- 本机有 URL且导入 `updated_at` 更新：覆盖标题、描述和完整标签集合；
- 导入记录相同或更旧：跳过内容更新；
- `created_at` 取较早；
- `access_count` 取较大；
- `accessed_at` 取较新非空；
- 标签 trim、去重、丢弃空值；
- FTS 同事务更新；
- 任一失败全部回滚。

## 19. 设置页

删除：

- BKMR 配置路径；
- BKMR 版本；
- BKMR 仓库；
- ONNX 状态。

显示：

- App 数据目录；
- SQLite 路径；
- schema 版本；
- 搜索后端，例如 `sqlite_fts5_trigram`。

JSON 区域：

- 配置默认备份目录；
- 导出 JSON；
- 通过原生保存窗口临时选择导出位置；
- 通过原生打开窗口选择 JSON；
- 展示预检统计；
- 二次确认后导入；
- 展示结构化成功或错误信息。

## 20. 旧数据库字段迁移

保留：

| 旧字段 | 新字段 |
|---|---|
| `id` | `id`，保留原值 |
| `URL` | `url` |
| `metadata` | `title` |
| `desc` | `description` |
| `tags` | `tags` + `bookmark_tags` |
| `flags` | `access_count` |
| `created_ts` | `created_at` |
| `last_update_ts` | `updated_at` |
| `accessed_at` | `accessed_at` |

丢弃：

- `embedding`
- `content_hash`
- `embeddable`
- `file_path`
- `file_mtime`
- `file_hash`
- `opener`

## 21. 备份

迁移备份目录：

```text
/Users/gyf/MyLib/bkmr-sync/migration-backups/<时间戳>/
```

该目录位于 bkmrx Git 仓库之外。

迁移前必须生成：

1. SQLite Backup API 一致性快照；
2. 包含全部迁移字段的完整 JSON；
3. `manifest.json`。

manifest 记录：

- 源数据库路径；
- 生成时间；
- 文件大小；
- SHA-256；
- `PRAGMA integrity_check`；
- 书签数；
- 最大 ID；
- 标签统计；
- 时间和空值统计。

备份完成前不得创建正式新库。

## 22. 一次性迁移工具

临时配置：

```toml
[[bin]]
name = "migrate_bkmr"
required-features = ["legacy-migration"]
```

迁移流程：

1. 要求旧 App 退出；
2. 确认 8733 端口释放；
3. 检查源库；
4. 创建三份备份；
5. 创建 `bookmarks.db.migrating`；
6. 在一个事务中转换业务数据；
7. 构建 FTS；
8. 验证新库；
9. 原子移动到正式 App 数据目录。

目标库已存在时默认拒绝覆盖。

迁移失败时：

- 旧数据库不变；
- 备份不变；
- 仅清理或隔离临时目标；
- 不创建正式目标库。

## 23. 迁移验证

必须对比：

- 总书签数；
- URL 集合；
- 最大 ID；
- 每条记录的 ID；
- 标题；
- 描述；
- 访问次数；
- 创建时间；
- 更新时间；
- 最近访问时间；
- 每条书签的标签集合；
- 外键；
- FTS 行数。

执行：

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

搜索抽查：

- 中文单字；
- 中文双字；
- 中文三字以上；
- 英文；
- URL；
- 特殊字符；
- 标签；
- 文本加标签；
- 翻页无重复和遗漏。

## 24. 迁移代码退场

真实迁移通过后删除：

- `src-tauri/src/bin/migrate_bkmr.rs`
- legacy migration fixture 和测试；
- `legacy-migration` feature；
- `bkmr_lib`；
- Diesel；
- ONNX / ORT；
- fastembed；
- sqlite-vec；
- 只服务于旧迁移的依赖；
- Cargo.lock 中失去引用的依赖。

检查：

```text
bkmr_lib
ServiceContainer
BkmrBookmark
BkmrTag
HybridSearch
SearchMode
ONNX
embedding
sqlite_vec
sqlite-vec
fastembed
ort
```

产品名 `bkmrx`、仓库目录名和历史设计文档不是残留。

## 25. 构建与安装

目标：

```text
aarch64-apple-darwin
```

每台 Mac 可以拉取同一源码版本后独立构建。

不做：

- Universal；
- Intel；
- DMG；
- 公证；
- 发布。

安装顺序：

1. 完成迁移和迁移代码退场；
2. 运行全部测试和生产构建；
3. 构建 Release `.app`；
4. 退出旧 App；
5. 备份 `/Applications/bkmrx.app`；
6. 安装新版 `/Applications/bkmrx.app`；
7. 启动并检查只访问新数据库；
8. 重新加载同步升级的 Chrome 扩展。

## 26. 回滚

如果新版验收失败：

1. 退出新版；
2. 将新数据库、WAL、SHM 和日志移动到故障保留目录；
3. 不删除故障数据；
4. 恢复旧 `/Applications/bkmrx.app`；
5. 旧 App 继续使用未修改的 `~/.config/bkmr/bkmr.db`；
6. 使用迁移报告定位问题；
7. 修复后从旧库重新迁移。

## 27. 影响范围

### 27.1 bkmrx Rust

- 删除 `container.rs`；
- 重建 `service.rs`；
- 新增 database/repository/search/transfer；
- 更新 Commands；
- 更新 HTTP server；
- 更新 main/lib；
- 更新 settings；
- 更新 Cargo.toml/Cargo.lock；
- 更新 API docs；
- 删除 BKMR/向量依赖。

### 27.2 bkmrx React

- 统一 Bookmark DTO；
- 统一结构化错误；
- 改造 API 层；
- `useInfiniteQuery`；
- ResultList 真分页；
- CRUD 缓存失效；
- 设置页 JSON 导入导出；
- 设置页系统信息。

### 27.3 Chrome 扩展

- 新路径；
- 新响应；
- 新错误结构；
- 统一字段；
- 更新文档；
- 完整连接、检查、创建和更新验收。

### 27.4 数据

- 旧库只读保留；
- 新库新路径；
- 设置新路径；
- JSON v1；
- 迁移报告与备份在上层目录。

## 28. 自动测试

### 28.1 Database/Repository

- 首次建库；
- migration 幂等；
- 未知未来版本拒绝；
- CRUD；
- URL 冲突；
- 标签去重；
- 标签级联；
- 无引用标签清理；
- 访问次数；
- 事务回滚；
- FTS 同步；
- FTS 重建。

### 28.2 Search

- 空查询；
- 标签全部匹配；
- 中文单字；
- 中文双字；
- Trigram；
- 英文；
- URL；
- 特殊字符；
- 相关度；
- 稳定排序；
- 第一页；
- 最后一页；
- 空页；
- 无重复；
- 无遗漏；
- 错误游标；
- 查询变化后旧游标拒绝。

### 28.3 JSON

- v1 round-trip；
- 空库导入；
- 已有数据合并；
- 新增/更新/跳过统计；
- 文件 hash 变化；
- 重复 URL；
- 无效时间；
- 未知格式；
- 合并规则；
- 整批回滚。

### 28.4 Service/API

- Tauri 与 HTTP 行为一致；
- AppError；
- HTTP 状态；
- GET page；
- POST；
- GET by URL；
- GET by ID；
- PATCH；
- DELETE；
- tags；
- health。

### 28.5 React

- query key；
- pageParam；
- getNextPageParam；
- 下一页失败；
- query/tags 变化；
- CRUD 失效；
- import 失效。

### 28.6 迁移 CLI

- 字段映射；
- ID 保留；
- 标签映射；
- 丢弃字段；
- 备份门禁；
- 源库损坏；
- 目标已存在；
- 中途失败；
- 验证失败；
- 不产生正式目标库。

## 29. 人工验收

- 真实迁移前后 2145 条一致；
- 首屏只加载 50 条；
- 滚动加载下一页；
- 中文单/双/多字搜索；
- 标签筛选；
- 文本加标签；
- CRUD；
- 访问次数；
- JSON 导出；
- JSON 预检；
- JSON 合并导入；
- HTTP API；
- Chrome 扩展；
- 设置保存；
- App 重启；
- WAL；
- Release 安装；
- 回滚。

## 30. 完成标准

只有全部满足才算完成：

1. Rust 测试通过；
2. HTTP 合约测试通过；
3. 前端测试、类型检查和生产构建通过；
4. Chrome 扩展验证通过；
5. Apple Silicon Release `.app` 构建成功；
6. 本机安装成功；
7. 真实数据库迁移报告通过；
8. 备份清单完整；
9. 新 App 不访问旧库；
10. 旧 App 和旧库仍可回滚；
11. 无 BKMR/向量/迁移 CLI 运行时代码残留；
12. App、API 和扩展文档同步更新。

## 31. 后续可扩展方向

未来需要 Meilisearch 时：

1. 新增 `MeilisearchSearch`；
2. 继续实现同一 `BookmarkSearch` 契约；
3. SQLite 保持事实来源；
4. 外部索引可全量重建；
5. 上层分页和 DTO 不变；
6. FTS5 可作为降级后端。

本次不实现上述能力，只保证当前接口不会阻碍后续替换。
