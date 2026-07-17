# bkmrx 后端重构：从 shell 子进程到直接库集成

> 基于 2026-07-17 讨论沉淀。本文档作为后续实施计划的依据。

---

## 一、现状

当前所有书签操作都通过 `tokio::process::Command` 调用 `bkmr` CLI 子进程完成：

```rust
// bkmr.rs: 每个操作 fork 一个子进程
let mut cmd = tokio::process::Command::new(bkmr_path());
cmd.args(["search", "--json", "--limit", "50000"]);
let output = cmd.output().await...;
let raw: Vec<BkmrBookmarkRaw> = serde_json::from_slice(&output.stdout)...;
```

### 主要痛点

| 痛点 | 说明 |
|------|------|
| 子进程开销 | 每次操作 50-200ms fork 开销 |
| 路径脆弱 | `bkmr_path()` 硬编码 Homebrew/Cargo 路径，macOS .app 中经常找不到 |
| 输出格式不统一 | `search` 是 JSON、`tags` 是文本 "tag (count)"、`delete` 是交互式（pipe "y\\n"） |
| 错误处理原始 | 全部 `Result<..., String>` 无类型信息 |
| 搜索能力浪费 | 只用到了 `bkmr search --json`（FTS），`hybrid_search`（语义搜索）无法利用 |
| bkmr 升级依赖用户 | 用户需手动 `brew upgrade bkmr` 才能获得修复/新功能 |

---

## 二、目标

将 `bkmr` 作为 Rust 库直接链接到项目中，通过 `ServiceContainer` 调用 `BookmarkService` API，完全消除子进程交互。

```rust
// 目标代码：直接库调用
let container = ServiceContainer::new(&settings)?;
let bookmarks = container.bookmark_service.get_all_bookmarks(None, None)?;
container.bookmark_service.add_bookmark(url, title, tags, desc)?;
```

---

## 三、可行性结论

### 3.1 依赖可行性

`bkmr` 源码已下载到 `../bkmr/bkmr`，以 `path` 依赖引入：

```toml
[dependencies]
bkmr = { git = "https://github.com/sysid/bkmr", branch = "v8_maintenance" }
```

### 3.2 数据库兼容性

`ServiceContainer::new(&settings)` 内部调用 Diesel migrations：
- 数据库文件不存在 → 自动创建并执行所有 migration
- 数据库文件已存在 → 检查 schema 版本，跳过或增量 migration

可以直接使用用户已有的 `~/.config/bkmr/bkmr.db`，数据零迁移。

### 3.3 ONNX 运行时 / Embedding

`FastEmbedEmbedding::new(model)` **不加载 ONNX 运行时**。ONNX 的加载发生在第一次 `embed()` 调用时（语义搜索 / backfill）。

当前 `bkmrx` 只用到了：
- `get_all_bookmarks()`
- `search_bookmarks()` / `search_bookmarks_by_text()`
- `add_bookmark()` / `update_bookmark()` / `delete_bookmark()`
- `get_tags()`

这些方法[都]不会触发 `embed()`，因此 ONNX 对现有功能无影响。

| 场景 | ONNX 是否被加载 | 行为 |
|------|----------------|------|
| 用户有 ONNX（本机） | 首次语义搜索时加载 | 可用 `hybrid_search` |
| 用户无 ONNX | 从不加载 | CRUD + FTS 正常工作，语义搜索返回错误 |

### 3.4 Config 兼容性

```rust
let settings = load_settings(Some(
    &Path::new("~/.config/bkmr/config.toml")
))?;
```

直接读取用户已有配置，路径展开、`BKMR_DB_URL` 环境变量覆盖均自动处理。

### 3.5 EmbeddingOpts 缺少 enabled 开关

当前 `EmbeddingOpts` 只有 `model: String`，没有 `enabled: bool`。
如果需要（首次启动时优雅降级），可以在本地源码修改两处：

```rust
// config.rs - 增加字段
pub struct EmbeddingOpts {
    pub enabled: bool,
    pub model: String,
}

// service_container.rs - 检查开关
fn create_embedder(config: &Settings) -> ApplicationResult<Arc<dyn Embedder>> {
    if !config.embeddings.enabled {
        return Ok(Arc::new(DummyEmbedding));
    }
    // ... 原逻辑
}
```

`DummyEmbedding` 已在 `infrastructure/embeddings/dummy_provider.rs` 中实现。

### 3.7 首次安装用户的初始化和降级

对于新用户（没有 `~/.config/bkmr/config.toml` 也没有 `bkmr.db`），**不需要也不应该模拟 `bkmr --generate-config` 和 `bkmr create-db`**。

这两个命令做的事分别是：
- `--generate-config` → 生成一个含默认值的 config.toml 文件
- `create-db` → 创建 SQLite 数据库文件并执行 migrations

而 `ServiceContainer::new(&settings)` 已经内部完成了这两件事：
- Diesel migrations 在数据库文件不存在时**自动创建**并建表
- `Settings` 的 `Default` 实现提供了所有合理默认值

所以初始化流程只需要构造 `Settings`：

```rust
// 新用户：直接构造 Settings，无需 config 文件
let settings = Settings {
    db_url: "~/.config/bkmr/bkmr.db".into(),
    ..Default::default()
};
// ServiceContainer::new 会自动创建 DB 文件和表
let container = ServiceContainer::new(&settings)?;
```

**现有用户 vs 新用户的统一初始化路径：**

```rust
fn init_container() -> Result<ServiceContainer, Error> {
    let config_path = dirs::home_dir()
        .map(|h| h.join(".config/bkmr/config.toml"));

    // 用户已有 config → 从文件加载（保留所有自定义设置）
    // 用户没有 config → 用 Default 值
    let settings = match config_path.filter(|p| p.exists()) {
        Some(path) => load_settings(Some(path.as_path()))?,
        None => Settings {
            db_url: dirs::home_dir()
                .map(|h| h.join(".config/bkmr/bkmr.db"))
                .unwrap_or_else(|| PathBuf::from("bkmr.db"))
                .to_string_lossy()
                .to_string(),
            ..Default::default()
        },
    };

    ServiceContainer::new(&settings)
}
```

这样无论是已有 bkmr 配置的老用户，还是全新安装的用户，调用同一个函数就能初始化。
### 3.8 并发安全

`ServiceContainer` 内部使用 `Arc`，服务本身是 `Send + Sync`。
SQLite 通过连接池管理并发，比当前两个独立进程（app + CLI）操作同一数据库更安全。

---

## 四、需要修改的文件清单

### 删除

| 文件 | 原因 |
|------|------|
| `src-tauri/src/bkmr.rs` | 全部函数被 `BookmarkService` / `TagService` 替代 |
| `src-tauri/src/bkmr.rs` 中的 `bkmr_path()` | 不再需要查找 CLI 二进制 |
| `src-tauri/src/bkmr.rs` 中的 `deserialize_tags` | 不再需要手动解析标签 JSON |
| `src-tauri/src/bkmr.rs` 中的 `get_tags()` 文本解析 | 改为 `tag_service.get_all_tags()` |

### 重写

| 文件 | 改动 |
|------|------|
| `src-tauri/src/commands.rs` | 所有命令改为 `container.bookmark_service.*` 调用 |
| `src-tauri/src/http_server.rs` | handler 改为直接调 `BookmarkService`，不再走 CLI 子进程 |

### 新增 / 修改

| 文件 | 改动 |
|------|------|
| `Cargo.toml` | 加 `bkmr = { path = "../bkmr/bkmr" }` |
| `src-tauri/src/main.rs` | 启动时创建 `ServiceContainer`，存为全局状态 |
| `src-tauri/src/lib.rs` | 可能需新增模块暴露 `ServiceContainer` |
| `src/settings/SettingsPage.tsx` | 可能新增数据库路径配置项 |

### 不修改

| 文件 | 原因 |
|------|------|
| 所有前端 `.tsx` / `.ts` 文件 | 前端通过 Tauri command 调用后端，接口不变量 |
| `src-tauri/src/notes.rs` | 笔记功能不依赖 bkmr |
| `src-tauri/src/settings.rs` | bkmr 的配置通过 `load_settings` 加载，不由我们的 settings 管理 |

---

## 五、类型映射

### bkmr 的 Bookmark vs 当前的 BkmrBookmark

```rust
// 当前定义（bkmr.rs）
pub struct BkmrBookmark {
    pub id: u64,
    pub url: String,
    pub title: String,
    pub tags: Vec<String>,
    pub description: String,
    pub modified: String,
}

// bkmr 库的 Bookmark 有更多字段：
// id, url, title, description, tags, access_count,
// created_at, updated_at, accessed_at
```

推荐直接用 `JsonBookmarkView` 序列化返回给前端：

```rust
use bkmr::infrastructure::json::JsonBookmarkView;

let bookmarks = container.bookmark_service.get_all_bookmarks(None, None)?;
let views = JsonBookmarkView::from_domain_collection(&bookmarks);
// 序列化后返回给前端
```

`JsonBookmarkView` 字段稳定，与 CLI 的 `--json` 输出一致，前端可以直接使用。

---

## 六、实施步骤（草案）

### Phase 1：依赖接入 & 基础初始化

1. 在 `Cargo.toml` 添加 `bkmr` git 依赖（从 GitHub v8_maintenance 分支）
2. 在 `main.rs` 实现通用初始化函数（含新用户/老用户分支），`ServiceContainer` 存入全局 `OnceLock`
3. 验证 `load_settings` 能读取现有 `~/.config/bkmr/config.toml`
4. 验证 `ServiceContainer::new` 能打开现有 `bkmr.db` 并完成 migration

### Phase 2：替换 CRUD 命令

按风险从低到高逐个替换：

5. `load_all_bookmarks` → `bookmark_service.get_all_bookmarks()`
6. `get_all_tags` → `tag_service.get_all_tags()`
7. `add_bookmark` → `bookmark_service.add_bookmark()`
8. `update_bookmark` → `bookmark_service.update_bookmark()`
9. `delete_bookmarks` → `bookmark_service.delete_bookmark()`
10. `check_bookmark` / `show_bookmark` → `bookmark_service.get_bookmark()`

### Phase 3：搜索升级

11. 用 `bookmark_service.search_bookmarks()` + `BookmarkQuery` 替代 Fuse.js
12. 可选：接入 `bookmark_service.hybrid_search()` 启用语义搜索

### Phase 4：清理

13. 删除 `bkmr.rs` 全部代码
14. 删除 `bkmr_path()`、`deserialize_tags` 等辅助函数
15. 更新 HTTP server handler 直接使用 `BookmarkService`
16. 验证端到端功能（CRUD + 搜索 + 标签 + 同步）

---

## 七、风险与注意事项

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| `fastembed` 依赖链重，编译时间长 | 中 | 仅 path 依赖，`ort-download-binaries` feature 在首次编译时下载 |  
| bkmr 的 `ServiceContainer` 内部依赖版本冲突 | 低 | 与当前项目已有的 `tauri`、`tokio`、`serde` 等版本做兼容性检查 |
| SQLite 同时被 app 和外部 CLI 访问 | 低 | 通过连接池管理，比当前两个进程更安全 |
| `BookmarkQuery` 接口无法完全适配当前前端分页/排序 | 低 | `get_all_bookmarks(None, None)` 返回全部，前端分页逻辑不变 |
| 现有的 `BkmrBookmark` 与 `Bookmark` 字段差异 | 低 | 用 `JsonBookmarkView` 桥接，前端兼容 |

---

## 八、附录

### 8.1 相关代码位置

| 内容 | 路径 |
|------|------|
| bkmr 依赖 | crates.io 或 GitHub v8_maintenance 分支 |
| bkmr config | `~/.config/bkmr/config.toml` |
| bkmr 数据库 | `~/.config/bkmr/bkmr.db` |
| 当前 shell 包装 | `src-tauri/src/bkmr.rs` |
| Tauri 命令 | `src-tauri/src/commands.rs` |
| HTTP 服务 | `src-tauri/src/http_server.rs` |
| 主入口 | `src-tauri/src/main.rs` |
| 设置页 | `src/settings/SettingsPage.tsx` / `useSettings.ts` |

### 8.2 初始化代码范例（最终形态）

```rust
// main.rs setup 阶段（同时处理新用户和老用户）
use bkmr::config::load_settings;
use bkmr::infrastructure::di::ServiceContainer;
use std::path::PathBuf;
use std::sync::OnceLock;

static CONTAINER: OnceLock<ServiceContainer> = OnceLock::new();

fn init_container() -> Result<ServiceContainer, Box<dyn std::error::Error>> {
    let config_path = dirs::home_dir()
        .map(|h| h.join(".config/bkmr/config.toml"));

    let settings = match config_path.filter(|p| p.exists()) {
        // 老用户：读取现有 config
        Some(path) => load_settings(Some(path.as_path()))?,
        // 新用户：使用默认配置
        None => {
            let db_path = dirs::home_dir()
                .map(|h| h.join(".config/bkmr/bkmr.db"))
                .unwrap_or_else(|| PathBuf::from("bkmr.db"));
            Settings {
                db_url: db_path.to_string_lossy().to_string(),
                ..Default::default()
            }
        },
    };

    ServiceContainer::new(&settings)
}

.setup(|_app| {
    let container = init_container()
        .expect("Failed to initialize bkmr service");
    CONTAINER.set(container).ok();
    Ok(())
})
```

### 8.3 替换后命令示例

```rust
// 当前（shell 方式）
#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<bkmr::BkmrBookmark>, String> {
    bkmr::get_all_bookmarks().await
}

// 目标（库方式）
#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<JsonBookmarkView>, String> {
    let container = CONTAINER.get().ok_or("Container not initialized")?;
    let bookmarks = container.bookmark_service
        .get_all_bookmarks(None, None)
        .map_err(|e| e.to_string())?;
    Ok(JsonBookmarkView::from_domain_collection(&bookmarks))
}
```
