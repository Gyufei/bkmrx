下面把 bkmr 作为库在 Rust 中调用的方式、可用的服务/方法、示例代码和注意事项，做成一个完整可参考的说明（直接、可复制）。

要点概览
- bkmr 提供了一个“ServiceContainer”工厂，用来一次性创建并注入所有运行时依赖（数据库仓库、embedder、向量仓库、bookmark_service、tag_service、action_service 等）。在 CLI 中 main.rs 就是这样初始化的。
- 作为库使用时的典型流程：加载 Settings → 创建 ServiceContainer → 使用 container.bookmark_service / .tag_service / .action_service 等来做业务调用。
- BookmarkService 的接口非常完整（get_all_bookmarks、search_bookmarks、semantic_search、hybrid_search、get_bookmark、add_bookmark、update_bookmark、delete_bookmark 等），适合在应用/后端直接调用。
- 测试环境有 TestServiceContainer / TestContext 提供可重用的测试用 service bundle（DummyEmbedding、测试 SQLite、空向量仓库等），便于单元/集成测试。

主要类型和服务（简要）
- infrastructure::di::ServiceContainer
  - 字段（主要）：
    - bookmark_service: Arc<dyn BookmarkService>
    - tag_service: Arc<dyn TagService>
    - action_service: Arc<dyn ActionService>
    - embedder / vector_repository / bookmark_repository / clipboard_service / interpolation_service / template_service
  - 构造： ServiceContainer::new(&settings) -> ApplicationResult<ServiceContainer>
- application::services::bookmark_service::BookmarkService （trait）
  - 重要方法（选摘）：
    - get_all_bookmarks(sort_direction: Option<SortDirection>, limit: Option<usize>) -> ApplicationResult<Vec<Bookmark>>
    - search_bookmarks(&BookmarkQuery) -> ApplicationResult<Vec<Bookmark>>
    - search_bookmarks_by_text(&str) -> ApplicationResult<Vec<Bookmark>>
    - semantic_search(&SemanticSearch) -> ApplicationResult<Vec<SemanticSearchResult>>
    - hybrid_search(&HybridSearch) -> ApplicationResult<Vec<HybridSearchResult>>
    - get_bookmark(id) / add_bookmark(...) / update_bookmark(...) / delete_bookmark(id)
- application::services::tag_service::TagService
  - get_all_tags() -> ApplicationResult<Vec<(Tag, usize)>>  // tag + 使用计数
  - get_related_tags(&Tag) -> ApplicationResult<Vec<(Tag, usize)>>
  - parse_tag_string(...)
- infrastructure::json::JsonBookmarkView
  - JsonBookmarkView::from_domain_collection(&[Bookmark]) → Vec<JsonBookmarkView>
  - write_bookmarks_as_json(&views) 会把 JSON 打印到 stdout（CLI 内部用的 helper）

如何在你自己的 Rust 程序里调用（示例）
- 假设在同一工作区里依赖了 bkmr crate，示例展示“初始化容器 → 导出全部书签到 JSON”的最小代码：

```rust
use bkmr::config::load_settings;
use bkmr::infrastructure::di::ServiceContainer;
use bkmr::infrastructure::json::JsonBookmarkView;
use anyhow::Result;

fn export_all_bookmarks_to_json() -> Result<()> {
    // 1. 加载配置（可传 None 使用默认）
    let settings = load_settings(None)?; // or Settings::default()

    // 2. 创建 service container（会创建 DB 连接、embedder 等）
    let container = ServiceContainer::new(&settings)?;

    // 3. 调用 bookmark_service 获取所有书签（可按需传排序/limit）
    let bookmarks = container.bookmark_service.get_all_bookmarks(None, None)?;

    // 4. 转为 JSON 视图并序列化
    let views = JsonBookmarkView::from_domain_collection(&bookmarks);
    let json = serde_json::to_string_pretty(&views)?;
    println!("{}", json);

    Ok(())
}
```

- 如果你想在程序内部把数据返回给前端（而不是打印），直接把 `views` 序列化后返回即可（比如 warp/axum 的 HTTP handler 返回 serde_json::Value）。

使用 BookmarkQuery 做复杂筛选
- 如果你需要按标签、排序、limit、offset 等精细查询，构造 BookmarkQuery 并传给 bookmark_service.search_bookmarks：
```rust
use bkmr::domain::repositories::query::{BookmarkQuery, SortCriteria, SortField, SortDirection};

let query = BookmarkQuery::new()
    .with_text_query(Some("kubernetes"))
    .with_sort(SortCriteria::new(SortField::Modified, SortDirection::Descending))
    .with_limit(Some(100));
let results = container.bookmark_service.search_bookmarks(&query)?;
```

获取标签数据
- 直接使用 tag_service：
```rust
let tags_with_counts = container.tag_service.get_all_tags()?; // Vec<(Tag, usize)>
for (tag, count) in tags_with_counts {
    println!("{} ({})", tag.value(), count);
}
```
- CLI 层也有 `bkmr tags` 命令，CLI 在非管道化时会颜色化输出；如果管道化则输出纯文本，易于脚本解析。

在测试/开发中如何使用（TestServiceContainer / TestContext）
- 库里有 TestServiceContainer/TestContext 工具用于测试（初始化独立或共享测试 DB、DummyEmbedding 等）：
```rust
let test_container = bkmr::infrastructure::di::TestServiceContainer::new();
let bookmark_service = test_container.bookmark_service.clone();
let all = bookmark_service.get_all_bookmarks(None, None)?;
```
- 推荐在单元/集成测试里用 TestServiceContainer 或 TestContext 来避免影响生产数据。

直接从数据库读取（备选方案）
- 如果你只是想把所有书签导出到外部系统，另一条高效路径是直接读 SQLite 数据库（bkmr 使用 BKMR_DB_URL 配置或 config.toml 指定 DB 路径）。优点：快速、可分页、对大数据友好；缺点：需要了解 DB 模式与列名。
- 简单示例（shell + sqlite3）：
```sh
# 假设 BKMR_DB_URL=/path/to/bkmr.db
sqlite3 "$BKMR_DB_URL" "SELECT id, title, url, description, updated_at FROM bookmarks;" > bookmarks.csv
```
- 如果你需要“和 bkmr 一样”的 JSON 视图，建议用库方式（上面 ServiceContainer 示例）或把 sqlite 查询结果映射成你自己的 JSON。

关于语义 / 混合检索（如果要在应用内使用）
- BookmarkService 暴露 semantic_search 和 hybrid_search（RRF 融合）方法，如果 embedding 可用（embedder dimensions > 0），可以直接调用：
```rust
// 构造 SemanticSearch 或 HybridSearch domain 对象（库内类型），然后:
let sem_results = container.bookmark_service.semantic_search(&sem_search)?;
let hybrid_results = container.bookmark_service.hybrid_search(&hybrid_search)?;
```
（这些 domain 类型和使用方式在 crate 的 domain/search 或 application 层定义，按需要构造参数）

注意事项与实务建议
- ServiceContainer::new 会尝试打开并迁移数据库，并且根据配置选择 embedding provider（默认可能是本地 fastembed，需要 ONNX 运行时）；在某些环境中创建容器可能较慢或需要 native 依赖，生产中通常在启动阶段创建一次共享容器并复用。
- 如果只是“读取/导出数据”，用 bookmark_service.get_all_bookmarks(limit 分页) 比创建大量对象然后在内存中处理更安全；或者直接使用 SQL 分页查询更高效。
- 并发/线程：ServiceContainer 中的 repository/服务使用 Arc，服务本身是 Send + Sync 设计；在多线程 web 服务中按需 clone Arc 并发使用即可。但注意 SQLite 的并发限制（配置和 PRAGMA 对并发有影响）。
- 如果你要在服务中把结果暴露为 HTTP API，推荐序列化 JsonBookmarkView（fields 已定义且稳定），这样与 CLI 的 --json 输出一致，便于前后端一致性。

附：JsonBookmarkView 的字段（方便前端映射）
- id, url, title, description, tags (Vec<String>), access_count, created_at, updated_at, accessed_at

总结
- 最直接方式：在 Rust 程序中用 load_settings -> ServiceContainer::new -> container.bookmark_service.get_all_bookmarks() 获取全部书签；把结果用 JsonBookmarkView 序列化后返回给前端或写文件。
- 如果用于测试或本地开发，使用 TestServiceContainer / TestContext 可以避免复杂依赖（DummyEmbedding、测试 DB）。
- 若数据量大或需要自定义分页/聚合，考虑直接用 sqlite 查询（BKMR_DB_URL）或把 bookmark_service 的 limit/offset 结合使用。

如果你需要，我可以把上面的示例整理成一个完整的 minimal crate 示例（Cargo.toml + main.rs），或者给出把结果通过 HTTP 返回的 Axum/warp 示例 handler（包含 serde 序列化）。
