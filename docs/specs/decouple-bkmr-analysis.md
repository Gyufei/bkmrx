# bkmr 解耦分析文档

> 分析将 bkmr 从 bkmrx 中彻底替换为自建 SQLite 后端的可行性。
> 日期: 2026-07-23 | 基于 `bkmr_lib` rev `a6ca05e`（当前锁定版本）

---

## 1. bkmr 在 CRUD 之外的隐藏行为

替换 bkmr 前需要清楚它到底额外做了什么事。下面按操作逐一审查。

### 1.1 新增书签（`add_bookmark`）

bkmr `BookmarkServiceImpl::add_bookmark` 的实际流程：

```
1. exists_by_url(url) → 如果已存在，返回 409 BookmarkExists
2. if fetch_metadata && http/https URL:
     http::load_url_details(url) → 尝试抓取网页 title / description / keywords
   （抓取失败则静默降级为默认值）
3. Bookmark::new() → 验证系统标签约束（最多一个 _known_ 系统标签）
4. repository.add() → INSERT 到 bookmarks 表
   （FTS5 由 SQLite 触发器自动同步，无需手动维护）
5. if embeddable && id 存在:
     get_content_for_embedding() + upsert_embedding_for_bookmark()
     → 调用 ONNX 模型生成向量嵌入，写入 vec_bookmarks 表
```

**你替换后需要关注的点：**

| 行为 | 影响程度 | 说明 |
|------|---------|------|
| URL 唯一性检查 | ✅ 必须做 | 否则会插入重复 URL。不过前端已有 `checkBookmark` 流程兜底 |
| `fetch_metadata` 抓取网页 | ⚠️ 通常不影响 | bkmrx 调用时传的是 `false`，见 `service.rs:add_bookmark` |
| 系统标签验证（最多一个） | ❌ 不需要 | 当前 bkmrx 前端不创建/管理系统标签，用户只打普通 tag |
| FTS5 自动同步 | ✅ 必须做 | 使用 SQLite 触发器即可，一行 SQL 的事 |
| 嵌入生成 | ❌ 不需要 | 你已确认不刚需语义搜索 |

**结论：替换新增操作的净工作量很小。唯一必须复制的逻辑是 URL 唯一性检查 + 期望自己维护 FTS5 触发器。**

### 1.2 更新书签（`update_bookmark`）

```
1. 验证 id 有效性
2. 计算 embedding content hash → 检查内容是否变更
3. if embeddable:
     if 内容变更或 force_embedding:
       重新生成向量嵌入
4. repository.update()
   （FTS5 由 UPDATE 触发器反向删除旧行 + 插入新行）
```

**你替换后：**

| 行为 | 影响 | 说明 |
|------|------|------|
| id 验证 | ✅ 建议做 | 但 DB 层面会报错，不致命 |
| embedding 重算 | ❌ 不需要 | 不要语义搜索就不需要 |
| FTS5 自动同步 | ✅ 必须做 | 同新增，靠触发器 |

### 1.3 删除书签（`delete_bookmark`）

```
1. 验证 id 有效性
2. repository.delete() → DELETE FROM bookmarks WHERE id = ?
   （FTS5 由 DELETE 触发器自动同步）
3. 向量库：best-effort 删除嵌入（embedding 可能不存在，不报错）
```

**替换后：触发器自动处理 FTS5，SQLite 层面的 DELETE 足够。向量库删除不管。**

### 1.4 总结：bkmr 的"额外行为"

| 行为 | 是否必需 | 替代方案 |
|------|---------|---------|
| URL 唯一性检查 | ✅ 必需 | 自己维护 UNIQUE 约束或手动检查 |
| 网页元数据抓取 | ❌ 不需要 | 当前已传 `false` |
| 标签系统验证 | ❌ 不需要 | 用户标签无特殊约束 |
| FTS5 索引维护 | ✅ 必需 | SQLite 触发器（一行 SQL） |
| 嵌入生成/向量库 | ❌ 不需要 | 移除 |
| content_hash 追踪 | ❌ 不需要 | 仅用于嵌入变更检测 |
| opener 字段 | ⚠️ 如果需要 | 保持 `opener TEXT NULL` 列即可 |

**bkmr 的 CRUD 核心就是一层 SQLite 操作 + 可选嵌入，替换的复杂度比你想象的低很多。**

---

## 2. ORM 评估

### 2.1 当前状态

bkmrx 目前通过 `bkmr_lib` 间接依赖 **Diesel 2.3.11**（SQLite 后端）。bkmr 内部在 FTS5 查询处混用了 `rusqlite 0.35.0`。

你的 `bkmrx/Cargo.toml` 没有直接引入任何 ORM。

### 2.2 选项对比

| 选项 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **`rusqlite`** | 轻量，无宏编译开销，直接写 SQL，FTS5 支持好 | 无编译期 schema 检查，需手写 migrations | ⭐⭐⭐⭐⭐ |
| **Diesel** | 编译期类型安全，migrations 管理完善 | 编译慢，FTS5 仍需手写 raw SQL，过度设计 | ⭐⭐⭐ |
| **SeaORM** | 异步，功能丰富 | SQLite 支持一般，额外依赖链 | ⭐⭐ |
| **SQLx** | 异步，编译期检查 SQL | 需 `sqlx-cli`，独立 migrations 管理 | ⭐⭐⭐ |

### 2.3 建议：`rusqlite`

理由：

1. **操作集简单**：bookmark CRUD + FTS5 搜索 + tag 解析，不到 10 个查询模式。Diesel 的 compile-time safety 在这个规模下 ROI 很低。
2. **FTS5 必须手写 SQL**：Diesel 不支持 FTS5 的 `MATCH` 语法，最终还是得用 `sql_query()` 或 `rusqlite`。
3. **编译时间**：Diesel + `diesel_migrations` 的 SQLite feature 链显著增加编译时间。rusqlite 快得多。
4. **简单直接**：以后 schema 变化（加自定义字段）只需要改 migration SQL + 对应的 Rust struct。
5. **bkmr 自己也在用**：它的 FTS5 和 sqlite-vec 查询全部走 rusqlite，说明 Diesel 做不了的事最终还是 fallback。

```toml
# Cargo.toml 需要的依赖
rusqlite = { version = "0.35", features = ["bundled"] }
# 不需要 diesel、diesel_migrations 等
```

---

## 3. 数据库初始化

### 3.1 bkmr 当前的做法

`ServiceContainer::new(&settings)` 内部：
1. 检查 `__diesel_schema_migrations` 表是否存在
2. 如果不存在 → 自动运行所有 embedded migrations
3. 如果存在但版本落后 → 增量运行 pending migrations
4. 初始化 `sqlite-vec` 虚拟表（可选）

### 3.2 替换后的方案：`PRAGMA user_version`

```rust
fn init_db(db_path: &str) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("打开数据库失败: {e}"))?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("设置 PRAGMA 失败: {e}"))?;

    let current_version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    run_migrations(&conn, current_version)?;

    Ok(conn)
}
```

Migration 用函数列表 + user_version 管理：

```rust
fn run_migrations(conn: &Connection, from_version: i32) -> Result<(), String> {
    let migrations: Vec<(&str, fn(&Connection) -> Result<(), String>)> = vec![
        ("v1: 创建书签表和 FTS5", migrate_v1),
        // 以后追加：
        // ("v2: 添加 custom_fields", migrate_v2),
    ];

    let start = std::cmp::max(from_version, 0) as usize;
    for (desc, migrate_fn) in migrations.iter().skip(start) {
        migrate_fn(conn)?;
        let new_ver = start as i32 + 1;
        conn.pragma_update(None, "user_version", new_ver)
            .map_err(|e| format!("更新 schema 版本失败: {e}"))?;
    }
    Ok(())
}
```

### 3.3 首次安装与升级

| 场景 | user_version | 行为 |
|------|-------------|------|
| 新用户（无 DB 文件） | 文件不存在 | `Connection::open` 自动创建，user_version 为 0 → 跑所有 migration |
| 老用户（已有 DB） | N | 只跑 N 之后的 migration |
| 升级 app | N < 最新 | 自动跑增量 migration |

**不需要手动操作**，所有处理在 `init_db` 调用时自动完成。

---

## 4. 搜索方案

### 4.1 当前搜索路径

```
用户输入 → hybridSearchBookmarks(query, tags)
           → bkmr_lib::hybrid_search
             → FTS5 rank
             → 可选: 语义搜索 → 向量库查询
             → RRF 融合
             → hydrate Bookmark
```

你已确认：不刚需语义搜索。所以只需要 FTS5。

### 4.2 FTS5 就够了

SQLite FTS5 作为搜索方案已经很强，bkmr 自己也在用：

```sql
SELECT id, rank FROM bookmarks_fts
WHERE bookmarks_fts MATCH ?
ORDER BY rank
```

支持的特性：通配符、引号精确匹配、排除（`-`）、前缀搜索、NEAR 邻近搜索、BM25 相关性排序、自定义 tokenizer（porter unicode61 已启用）。

你当前的 `hybrid_search` 在无文本查询时退回 `get_all_bookmarks`，替换后也一样。

### 4.3 标签筛选

当前后端对空查询 + tags 做内存过滤。替换后可以直接在 SQL 层面做：

```sql
SELECT b.* FROM bookmarks b
JOIN bookmarks_fts fts ON b.id = fts.id
WHERE bookmarks_fts MATCH ?
  AND b.tags LIKE '%,rust,%'
ORDER BY rank
```

（当前 tag 存为 `,tag1,tag2,` 格式，LIKE 模式在万级数据量下够用。如果未来 tag 量暴增可以拆 tags 表。）

### 4.4 如果需要更高级的搜索

| 需求 | 方案 | 复杂度 |
|------|------|--------|
| 模糊搜索 | FTS5 porter tokenizer（已启用） | 零成本 |
| 中文分词 | 切换到 ICU tokenizer + ICU 扩展 | 低 |
| 自定义权重 | FTS5 `rank` 计算公式或按列权重 | 低 |
| Tantivy | 独立全文索引库 | 中 |

**建议**：先用 FTS5。万级书签量下性能绰绰有余。

---

## 5. 抽象层设计与迁移路径

### 5.1 当前调用关系

```
Frontend → bookmarks.api.ts → invoke.ts → Tauri IPC
  → commands.rs → service.rs → bkmr_lib (ServiceContainer → BookmarkServiceImpl)
```

### 5.2 目标调用关系

```
Frontend → bookmarks.api.ts → invoke.ts → Tauri IPC
  → commands.rs → service.rs → db.rs (rusqlite, 直接 SQL)
```

**前端、invoke.ts、commands.rs 的接口完全不变。**

### 5.3 具体替换策略

**第一步：新建 `src-tauri/src/db.rs`**

```rust
use rusqlite::Connection;
use std::sync::{Mutex, OnceLock};

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

pub fn init(path: &str) -> Result<(), String> { /* 打开 DB + 执行 migration */ }
pub fn get_conn() -> Result<MutexGuard<'static, Connection>, String> { ... }

// 查询函数
pub fn get_all_bookmarks() -> Result<Vec<BkmrBookmark>, String> { ... }
pub fn search_bookmarks(query: &str, tags: &[String]) -> Result<Vec<BkmrBookmark>, String> { ... }
pub fn add_bookmark(...) -> Result<BkmrBookmark, String> { ... }
pub fn update_bookmark(...) -> Result<(), String> { ... }
pub fn delete_bookmark(id: u64) -> Result<(), String> { ... }
pub fn get_all_tags() -> Result<Vec<BkmrTag>, String> { ... }
```

**第二步：重写 `service.rs`**

保持 `BkmrBookmark`、`BkmrTag` 类型和函数签名不变，内部从 `crate::container::get().bookmark_service.*` 改为 `crate::db::*`。

**第三步：清理**

1. 删除 `container.rs`
2. 删除 `Cargo.toml` 中 `bkmr_lib` 依赖
3. `commands.rs` 中 `get_system_info` 里的 `bkmr_lib::config` 引用替换为己实现

### 5.4 分阶段并行验证

| 阶段 | 改动 | 验证方式 | 风险 |
|------|------|---------|------|
| 1 | 加 `db.rs`，不改变任何现有代码 | `cargo check` 通过 | 无 |
| 2 | 重写 `service.rs`，指向 `db.rs` | 启动 app 全面测试书签功能 | **核心切换** |
| 3 | 删除 `bkmr_lib` + `container.rs` | `cargo check` + 编译大小 | 低 |
| 4 | 可选：加自定义字段 | 按需求测试 | 低 |

阶段 2 是核心切换。**前端零改动。**

---

## 6. 总工作量估计

| 模块 | 代码量 | 难度 |
|------|--------|------|
| `db.rs`（migration + FTS5 触发器 + CRUD + 搜索） | ~350 行 Rust | 低 |
| `service.rs` 重写 | ~80 行 Rust | 低 |
| 清理 `container.rs` + 依赖 | ~20 行 | 低 |
| **合计** | **~450 行** | **低～中** |

## 7. 不做的风险

维持现状的风险不在于性能（`bkmr_lib` 库调用完全可以接受），而是：

1. **schema 永远无法扩展**——不能加自定义字段
2. **搜索逻辑受限于 `HybridSearch` 接口**——不能调排序权重、不能加自定义索引
3. **bkmr 上游 break API 时需要 fork 修复**
4. **`fastembed`、`ort` 等依赖被静态链接但从未使用**——浪费编译时间和二进制大小

替换后这些限制全部消失。而你保留的 FTS5 搜索能力在功能上与当前无异。
