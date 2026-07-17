# 后端重构实施任务清单

> 基于 `backend-rebuild-plan.md` 拆解为可执行的任务。每个任务包含：目标文件、代码变化、验证方式。

---

## Phase 1：依赖接入 & 基础初始化

### 1.1 添加 bkmr 依赖

| 字段 | 值 |
|------|-----|
| 文件 | `src-tauri/Cargo.toml` |
| 操作 | 在 `[dependencies]` 末尾添加一行 |

```toml
bkmr = { git = "https://github.com/sysid/bkmr", branch = "v8_maintenance" }
```

验证：`cargo check` 通过（首次需下载依赖，约 2-5 分钟）。

---

### 1.2 创建容器模块 & 全局初始化

| 字段 | 值 |
|------|-----|
| 新建文件 | `src-tauri/src/container.rs` |
| 修改文件 | `src-tauri/src/lib.rs` |

```rust
// container.rs
use std::sync::OnceLock;
use bkmr::infrastructure::di::ServiceContainer;
use bkmr::config::Settings;

static CONTAINER: OnceLock<ServiceContainer> = OnceLock::new();

pub fn init(config_path: Option<&std::path::Path>) -> Result<(), String> {
    let settings = match config_path.filter(|p| p.exists()) {
        Some(path) => bkmr::config::load_settings(Some(path))
            .map_err(|e| format!("加载配置失败: {e}"))?,
        None => {
            let db_path = dirs::home_dir()
                .map(|h| h.join(".config/bkmr/bkmr.db"))
                .unwrap_or_else(|| std::path::PathBuf::from("bkmr.db"));
            Settings {
                db_url: db_path.to_string_lossy().to_string(),
                ..Default::default()
            }
        }
    };
    let container = ServiceContainer::new(&settings)
        .map_err(|e| format!("初始化服务失败: {e}"))?;
    CONTAINER.set(container).map_err(|_| "Container already initialized".into())?;
    Ok(())
}

pub fn get() -> &'static ServiceContainer {
    CONTAINER.get().expect("Container not initialized")
}
```

`lib.rs` 注册新模块：

```diff
  pub mod settings;
+ pub mod container;
  pub mod notes;
  pub mod bkmr;
  pub mod commands;
  pub mod http_server;
```

> `dirs` crate 是 bkmr 的传递依赖，一般可用。如果编译报找不到，在 Cargo.toml 加 `dirs = "6"`。

---

### 1.3 在 main.rs setup 中初始化

| 字段 | 值 |
|------|-----|
| 文件 | `src-tauri/src/main.rs` |

在 setup 闭包中、`notes::set_app_handle` 之前加入：

```rust
// 初始化 bkmr 服务容器（老用户读现有 config，新用户自动创建）
let config_path = dirs::home_dir()
    .map(|h| h.join(".config/bkmr/config.toml"));
crate::container::init(config_path.as_deref())
    .expect("Failed to initialize bkmr container");
```

验证：启动应用，无崩溃。老用户的书签和标签正常显示。首次安装用户~/.config/bkmr/ 下自动生成 bkmr.db。

---

## Phase 2：替换 CRUD 命令

> 逐个替换 `commands.rs` 中的 Tauri 命令。每个替换后都可以独立测试。
>
> 替换模式：`bkmr::xxx()` -> `crate::container::get().bookmark_service.xxx()`

### 2.1 load_all_bookmarks

```diff
  pub async fn load_all_bookmarks() -> Result<Vec<bkmr::BkmrBookmark>, String> {
-     bkmr::get_all_bookmarks().await
+     let container = crate::container::get();
+     let bookmarks = container.bookmark_service
+         .get_all_bookmarks(None, None)
+         .map_err(|e| e.to_string())?;
+     // bookmarks: Vec<bkmr::domain::bookmark::Bookmark>
+     // 需要转成 bkmr::BkmrBookmark（或直接改用 JsonBookmarkView）
+     todo!("转换逻辑或直接改前端类型")
  }
```

**关于类型转换**：bkmr 库的 `Bookmark` 字段更多（id / url / title / description / tags / access_count / created_at / updated_at / accessed_at）。有两种方案：
- **方案 A**：增加 `from_domain` 转成当前的 `BkmrBookmark`，前端不动
- **方案 B**：返回 `JsonBookmarkView`（与 CLI --json 输出一致），前端直接消费新字段

实施时选择方案 A 兼容性更好，后续再切方案 B。

### 2.2 get_all_tags

```diff
  pub async fn get_all_tags() -> Result<Vec<bkmr::BkmrTag>, String> {
-     bkmr::get_tags().await
+     let container = crate::container::get();
+     let tags = container.tag_service
+         .get_all_tags()
+         .map_err(|e| e.to_string())?;
+     Ok(tags.into_iter().map(|(tag, count)| bkmr::BkmrTag {
+         name: tag.value().to_string(),
+         count: count as u64,
+     }).collect())
  }
```

### 2.3 add_bookmark

```diff
  pub async fn add_bookmark(...) -> Result<u64, String> {
-     bkmr::add_bookmark(&url, &title, &tags, &description.unwrap_or_default()).await
+     let container = crate::container::get();
+     let bookmark = container.bookmark_service
+         .add_bookmark(&title, &url, &tags, description.as_deref(), None, None)
+         .map_err(|e| e.to_string())?;
+     Ok(bookmark.id.value().into())
  }
```

### 2.4 update_bookmark

```diff
  pub async fn update_bookmark(...) -> Result<(), String> {
-     bkmr::update_bookmark(id, &title, &tags, &description.unwrap_or_default()).await
+     let container = crate::container::get();
+     container.bookmark_service
+         .update_bookmark(id.into(), &title, &tags, description.as_deref(), None)
+         .map_err(|e| e.to_string())?;
+     Ok(())
  }
```

### 2.5 delete_bookmarks

```diff
  pub async fn delete_bookmarks(ids: Vec<u64>) -> Result<u64, String> {
-     bkmr::delete_bookmarks(&ids).await
+     let container = crate::container::get();
+     for id in &ids {
+         container.bookmark_service
+             .delete_bookmark((*id).into())
+             .map_err(|e| e.to_string())?;
+     }
+     Ok(ids.len() as u64)
  }
```

### 2.6 check_bookmark / show_bookmark

```diff
  pub async fn check_bookmark(url: String) -> Result<Option<bkmr::BkmrBookmark>, String> {
-     bkmr::check_bookmark(&url).await
+     let container = crate::container::get();
+     let all = container.bookmark_service
+         .get_all_bookmarks(None, None)
+         .map_err(|e| e.to_string())?;
+     Ok(all.into_iter().find(|b| b.url.as_str() == url)
+         .map(|b| /* 转换为 BkmrBookmark */))
  }
```

show_bookmark 类似：

```diff
  pub async fn show_bookmark(id: u64) -> Result<Option<bkmr::BkmrBookmark>, String> {
-     bkmr::show_bookmark(id).await
+     let container = crate::container::get();
+     let bm = container.bookmark_service
+         .get_bookmark(id.into())
+         .map_err(|e| e.to_string())?;
+     Ok(bm.map(|b| /* 转换为 BkmrBookmark */))
  }
```

### 2.7 backup_bookmarks（导出）

```diff
  pub async fn backup_bookmarks(dir: String) -> Result<String, String> {
-     bkmr::export_all(&dir).await
+     let container = crate::container::get();
+     let bookmarks = container.bookmark_service
+         .get_all_bookmarks(None, None)
+         .map_err(|e| e.to_string())?;
+     let views = bkmr::infrastructure::json::JsonBookmarkView::from_domain_collection(&bookmarks);
+     let json = serde_json::to_string_pretty(&views).map_err(|e| e.to_string())?;
+     let date = chrono::Local::now().format("%Y-%m-%d").to_string();
+     let path = std::path::Path::new(&dir).join(format!("bookmarks-{date}.json"));
+     std::fs::write(&path, &json).map_err(|e| e.to_string())?;
+     Ok(path.to_string_lossy().to_string())
  }
```

---

## Phase 3：替换 HTTP Server

当前 `http_server.rs` 中的 6 个 handler 也通过 `crate::bkmr::xxx()` 调用 CLI。替换为 `crate::container::get()` 调用：

| handler | 替换调用 |
|---------|---------|
| `add_bookmark_handler` | `bookmark_service.add_bookmark()` |
| `check_bookmark_handler` | `bookmark_service.get_all_bookmarks()` + url 过滤 |
| `update_bookmark_handler` | `bookmark_service.update_bookmark()` |
| `get_bookmark_handler` | `bookmark_service.get_bookmark()` |
| `delete_bookmark_handler` | `bookmark_service.delete_bookmark()` |
| `get_tags_handler` | `tag_service.get_all_tags()` |

替换模式与 Phase 2 完全相同。完成后 `http_server.rs` 不再引用 `crate::bkmr`。

验证：Chrome 扩展添加书签后桌面端实时收到通知。

---

## Phase 4：清理

### 4.1 删除 bkmr.rs

删除 `src-tauri/src/bkmr.rs`，从 `lib.rs` 移除 `pub mod bkmr;`。

包含的待删除代码：
- `bkmr_path()` / bkmr 二进制查找
- `BkmrBookmarkRaw` / `deserialize_tags()` 手动 JSON 解析
- 所有 `get_all_bookmarks()` / `hsearch()` / `search_by_tags()` / `export_all()` 等
- `run_bkmr()` 辅助函数
- `delete_bookmarks()` 中的 "y\\n" pipe hack

### 4.2 移动残留类型

将 `BkmrBookmark`、`BkmrTag` 定义（若仍被前端引用）移到 `commands.rs` 或 `types.rs`。

### 4.3 移除 Fuse.js（可选）

接入 `bookmark_service.search_bookmarks()` 后移除：

```diff
- "fuse.js": "^7.4.2",
```

及 `App.tsx` 中：
- `import Fuse from "fuse.js"`
- `fuseRef` / `useMemo` 搜索逻辑
- `INITIAL_LOAD` / `displayCount` 相关本地分页

---

## 任务依赖关系

```
Phase 1               Phase 2                     Phase 3          Phase 4
1.1 加依赖 ----+--->  2.1 load_all_bookmarks
               |     2.2 get_all_tags
1.2 容器模块 --+--->  2.3 add_bookmark
               |     2.4 update_bookmark
1.3 setup 注册 -+--->  2.5 delete_bookmarks
                     2.6 check/show_bookmark
                     2.7 backup_bookmarks
                              |
                              +--> 3 HTTP server handler  --> 4.1 删 bkmr.rs
                                                           4.2 移类型
                                                           4.3 移除 Fuse.js
```

Phase 2 内的 7 个命令可以独立替换，无严格顺序。建议先替换 `load_all_bookmarks` 和 `get_all_tags`（最直观验证）。

---

## 最终验收清单

| # | 检查项 | 验证方式 |
|---|--------|---------|
| 1 | `cargo check` + `npx tsc --noEmit` 通过 | 命令行 |
| 2 | 书签列表正常展示（全部/搜索/标签筛选） | 手动测试 |
| 3 | 标签面板显示所有标签及计数 | 手动测试 |
| 4 | 添加书签后列表实时更新 | 手动测试 |
| 5 | 编辑书签（标题/标签/描述）后列表刷新 | 手动测试 |
| 6 | 删除书签后列表实时更新 | 手动测试 |
| 7 | Chrome 扩展添加书签后桌面端同步 | 手动测试 |
| 8 | 设置页"立即备份"功能正常 | 手动测试 |
| 9 | 新用户首次启动不报错，数据库自动创建 | 删 ~/.config/bkmr/bkmr.db 后启动 |
| 10 | bkmr.rs 被删除，无残留引用 | grep -r "bkmr::" src-tauri/src |
