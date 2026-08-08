# 书签标签侧边栏重构设计与规格

## 1. 背景与目标

当前书签侧边栏一次性加载并展示全部标签。标签数量增长后，常用标签不突出，长列表的浏览价值和可发现性都会下降。同时，默认书签列表固定为星标模式，用户无法在无搜索条件下直接切换到全部书签。

本次重构目标：

1. 无标签搜索词时，仅展示按书签数量倒序排列的前 50 个标签。
2. 支持搜索全部标签，而不是仅在前 50 个热门标签中做前端过滤。
3. 在无书签搜索条件时提供“全部 / 星标”视图切换。
4. 输入书签搜索词或选择标签后，保持现有书签搜索和标签筛选行为不变。
5. 参考 `sidebar.png` 调整侧边栏的信息层级，但复用现有设计令牌、标签颜色和组件体系。

## 2. 非目标

- 不改变书签文本搜索的 LIKE/FTS 路由、相关性或分页算法。
- 不改变多标签筛选的 AND 语义。
- 不新增标签编辑、删除、合并或手动排序。
- 不增加“全部书签数”“星标书签数”等聚合统计；参考图中的数字不是本次明确需求，新增它们需要额外统计契约。
- 不修改数据库 schema，不增加全文标签索引。
- 不改变 Chrome 扩展现有的标签列表调用结果。

## 3. 现状调研

### 3.1 前端

- `apps/desktop/src/bookmarks/BookmarkView.tsx`
  - 持有书签搜索词 `query` 和已选标签 `selectedTags`。
  - 当前通过 `query.length === 0 && selectedTags.length === 0` 推导 `starredView`，所以无条件时固定请求 `starred_only: true`。
  - 搜索词或标签存在时自动发送 `starred_only: false`，即现有“搜索时不受星标限制”的行为。
  - React Query 的书签缓存键已经包含 `starredOnly`，能安全缓存“全部”和“星标”两种结果。
- `apps/desktop/src/bookmarks/TagPanel.tsx`
  - 通过单一 `[TAGS]` 查询一次性加载全部标签。
  - 没有标签搜索状态、搜索框、50 条限制和“全部 / 星标”切换。
  - 标签选择支持多选，未选标签使用中性色，已选标签使用稳定的 `tagColor`。
- `apps/desktop/src/bookmarks/bookmarks.api.ts` 与 `apps/desktop/src/lib/invoke.ts`
  - 原始实现的 `getAllTagsApi()` / `invokeGetTags()` 不接受查询参数。
  - 书签查询契约已经包含 `starred_only`，无需新增书签接口字段。

### 3.2 后端

- `SqliteBookmarkRepository::get_tags()` 已按 `count(bookmark_id) DESC, tag.name ASC` 排序，但返回全部标签。
- 数据库已有：
  - `tags.name UNIQUE`；
  - `bookmark_tags(tag_id, bookmark_id)` 索引；
  - `bookmarks(starred_at DESC, id DESC)` 的星标部分索引。
- `BookmarkPageRequest.starred_only` 和 `SqliteFtsSearch::search_starred()` 已支持星标分页。
- `starred_only: false` 且空查询、空标签时，现有 `search_recent()` 可以直接作为“全部”视图。
- 当前 `starred_only: true` 分支不组合文本和标签条件。前端只在空查询、空标签时启用它，这个约束必须保留。
- 标签数据同时通过 Tauri 命令 `get_tags` 和 HTTP `GET /api/tags` 暴露。Chrome 扩展使用 HTTP 标签接口，因此不能无条件把该接口截断为 50 条。

### 3.3 后端支持结论

| 能力 | 当前是否支持 | 需要的改动 |
| --- | --- | --- |
| 无条件展示全部书签 | 支持 | 前端发送 `starred_only: false` |
| 无条件展示星标书签 | 支持 | 继续发送 `starred_only: true` |
| 文本/标签搜索不受视图切换影响 | 支持 | 前端在搜索态强制 `starred_only: false` |
| 热门标签前 50 | 排序已支持，limit 不支持 | 标签查询增加 `limit` |
| 从全部标签中搜索 | 不支持 | 标签查询增加 `query` |

结论：不需要架构重构或数据库迁移，只需在现有分层内扩展标签查询契约，并重构侧边栏的局部状态与布局。

## 4. 交互规格

### 4.1 侧边栏结构

从上到下分为：

1. 标题“标签”。
2. 标签搜索框，placeholder 为“筛选标签…”，带搜索图标和清空能力。
3. 可滚动标签区域。
4. 分隔线。
5. “全部”和“星标”两个视图入口，使用现有图标库；当前项使用侧边栏强调背景。

标签区域保留现有多选行为和数量展示。点击标签只改变书签标签筛选，不改变用户保存的“全部 / 星标”偏好。

### 4.2 标签列表规则

- 标签搜索词在请求前 `trim()`。
- 空搜索词：后端返回书签数最多的前 50 个标签；数量相同时按标签名升序，保证稳定顺序。
- 非空搜索词：在全部标签名中做包含匹配，最多返回 50 个结果，仍按书签数倒序、标签名升序。
- 标签搜索只筛选标签选择器，不修改主内容区的书签文本搜索词。
- 搜索使用 200ms 防抖，避免每次按键都调用 Tauri。
- 搜索结果为空时显示“未找到匹配标签”；请求失败时提供可见错误和重试入口。
- 为防止已选但不在热门前 50 或当前搜索结果中的标签变成不可见筛选条件，已选标签应固定展示在结果区顶部，并与接口结果去重。因已选项产生的额外标签不计入接口的 50 条上限。
- 侧边栏在组件生命周期内维护“已见标签摘要”映射；选择标签时记录其名称和数量，用于标签离开当前接口结果后继续渲染固定项。固定项数量允许显示最近已知值，下一次该标签出现在查询结果时更新。
- 清空已选标签后，固定区消失并恢复当前标签搜索结果。

### 4.3 “全部 / 星标”与搜索状态

定义：

```ts
type BookmarkBaseView = 'all' | 'starred';

const isSearchMode = query.length > 0 || selectedTags.length > 0;
const effectiveStarredOnly = !isSearchMode && baseView === 'starred';
```

状态矩阵：

| 主搜索词 | 已选标签 | 侧边栏选择 | 实际查询 | 说明 |
| --- | --- | --- | --- | --- |
| 空 | 空 | 全部 | `starred_only: false` | 最近书签分页 |
| 空 | 空 | 星标 | `starred_only: true` | 按加星时间分页 |
| 非空 | 任意 | 任意 | `starred_only: false` | 保持现有文本搜索行为 |
| 空 | 非空 | 任意 | `starred_only: false` | 保持现有标签筛选行为 |

进入搜索态时不重置 `baseView`，只临时忽略它；清空主搜索词和全部已选标签后，恢复用户此前选择的基础视图。这样不会在搜索过程中产生隐式状态跳转。

### 4.4 默认视图

首次进入书签页时默认 `baseView = 'all'`。该产品决策已确认，会改变当前版本“首次进入默认仅显示星标”的行为。本期不要求跨应用启动持久化，组件生命周期内保留即可。

### 4.5 空状态

- 全部视图无数据：“暂无书签”。
- 星标视图无数据：沿用现有星标引导文案。
- 文本搜索或标签筛选无数据：沿用“暂无匹配的书签”。
- 搜索态下 `ResultList.starredView` 必须为 `false`，以保留当前取消星标无需确认的行为。

## 5. 数据契约设计

### 5.1 新增标签查询请求

前后端增加对应类型：

```ts
interface TagQueryRequest {
  query: string;
  limit: number | null;
}
```

```rust
pub struct TagQueryRequest {
    #[serde(default)]
    pub query: String,
    pub limit: Option<u32>,
}
```

约束：

- 侧边栏固定传 `limit: 50`；新增/编辑书签的标签输入传 `limit: null` 以获取全部标签。
- 后端校验非空 `limit` 为 `1..=100`；`null` 明确表示不限制数量。
- 返回类型继续使用 `Vec<TagSummary>`，不引入分页游标；标签选择器最多显示 50 个远小于书签结果规模。

### 5.2 Repository 查询

建议将仓储方法改为显式查询：

```rust
fn get_tags(&self, request: &TagQueryRequest) -> AppResult<Vec<TagSummary>>;
```

语义等价 SQL：

```sql
SELECT t.name, count(bt.bookmark_id) AS bookmark_count
FROM tags t
JOIN bookmark_tags bt ON bt.tag_id = t.id
WHERE ?1 = '' OR t.name LIKE ?2 ESCAPE '\' COLLATE NOCASE
GROUP BY t.id, t.name
ORDER BY bookmark_count DESC, t.name ASC
LIMIT COALESCE(?3, -1);
```

- `?2` 为转义 `%`、`_`、`\` 后的 `%query%`。
- `?3` 为 `null` 时通过 SQLite 的 `LIMIT -1` 语义返回全部标签。
- `COLLATE NOCASE` 对 ASCII 大小写不敏感；中文按字面匹配。
- 当前索引足以支持预期的个人书签规模。前导 `%` 不能利用普通 B-tree 名称索引，但标签表通常远小于书签表，本期不值得引入 FTS 或 schema v3。

### 5.3 Tauri 调用

统一使用参数化的 `get_tags(request)` 命令，Repository、Service、Tauri 和前端 API 各只保留一条调用链：

```ts
getTagsApi(request: TagQueryRequest): Promise<Tag[]>
```

新增/编辑书签传 `{ query: '', limit: null }`，侧边栏传 `{ query, limit: 50 }`。查询参数而不是命令名称决定返回范围，避免两套近似调用链。

### 5.4 HTTP 兼容性

`GET /api/tags` 当前是 Chrome 扩展依赖。为避免扩展只能看到前 50 个标签：

- 现有无参数 `GET /api/tags` 由 HTTP 适配层构造 `{ query: '', limit: null }`，继续返回全部标签，顺序不变。
- 可选扩展为 `GET /api/tags?query=foo&limit=50`，但桌面端不依赖 HTTP 路径。
- 本期不扩展 HTTP 标签搜索参数，Chrome 扩展行为保持不变。

## 6. 前端状态与缓存设计

### 6.1 `BookmarkView`

新增 `baseView` 状态并替换当前推导式 `starredView`：

- `effectiveStarredOnly` 同时用于书签查询键、请求的 `starred_only`、`ResultList.starredView` 和空状态选择。
- 将 `baseView` 与 `onBaseViewChange` 传给 `TagPanel`（或后续重命名后的 `BookmarkSidebar`）。
- 搜索/标签状态切换会自然生成新的 React Query cache key，无需手动清缓存。

### 6.2 组件边界

当前 `TagPanel` 将承担标签选择和书签基础视图导航，名称会失真。推荐重命名为 `BookmarkSidebar`：

- `BookmarkSidebar`：布局、基础视图入口、标签搜索状态。
- 标签 chip 映射仍可保留在同文件；本期不为一次性逻辑提前拆分更多组件。
- `BookmarkView` 继续拥有影响书签查询的最终状态，避免侧边栏直接调用书签 API。

建议 props：

```ts
interface BookmarkSidebarProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  baseView: BookmarkBaseView;
  onBaseViewChange: (view: BookmarkBaseView) => void;
}
```

### 6.3 标签 React Query key

标签查询键必须包含标准化查询词和 limit：

```ts
[BkQueryApiKey.TAGS, normalizedTagQuery, 50]
```

`bookmarks-changed` 事件继续失效 `[TAGS]` 前缀，能同时刷新热门列表和已有搜索结果。可以设置较短 `staleTime` 降低重复输入相同查询时的调用量，但不是必要条件。

## 7. 预计修改范围

### 前端

| 文件 | 改动 |
| --- | --- |
| `apps/desktop/src/bookmarks/BookmarkView.tsx` | 增加基础视图状态，计算有效星标条件，传递侧边栏 props，调整空状态 |
| `apps/desktop/src/bookmarks/TagPanel.tsx` | 重构/重命名为侧边栏，增加标签搜索、热门 50、已选固定区和视图入口 |
| `apps/desktop/src/bookmarks/bookmarks.api.ts` | 将标签 API 参数化并增加稳定 query key |
| `apps/desktop/src/lib/invoke.ts` | 将 `invokeGetTags` 改为接收查询参数 |
| `apps/desktop/src/types.ts` | 增加 `TagQueryRequest` 与基础视图类型（若不局部定义） |
| `apps/desktop/src/bookmarks/BookmarkView.test.tsx` | 覆盖视图切换、搜索覆盖和恢复行为 |
| 新增侧边栏测试文件 | 覆盖标签搜索、50 条结果、已选固定、加载/错误/空状态 |
| `apps/desktop/src/bookmarks/bookmarks.api.test.ts` | 覆盖标签查询 key 和参数透传 |

### 后端

| 文件 | 改动 |
| --- | --- |
| `apps/desktop/src-tauri/src/bookmarks/model.rs` | 增加 `TagQueryRequest` |
| `apps/desktop/src-tauri/src/bookmarks/repository.rs` | 增加按 query/limit 查询标签的 SQL |
| `apps/desktop/src-tauri/src/bookmarks/service.rs` | 暴露标签查询用例，保留分层边界 |
| `apps/desktop/src-tauri/src/commands.rs` | 将 `get_tags` 改为接收 `TagQueryRequest` |
| `apps/desktop/src-tauri/tests/database_repository.rs` | 覆盖 top 50、稳定排序、包含搜索、特殊字符和 limit 校验 |

可选：若同时扩展 HTTP 标签搜索，再修改 `http_server.rs`、`tests/http_api.rs` 与 `docs/http-api.md`。推荐本期不扩展，以保持改动最小。

## 8. 测试与验收标准

### 8.1 后端

1. 空 query、limit 50 仅返回前 50 个标签。
2. 按书签数倒序；相同数量按名称升序。
3. query 能命中不在热门前 50 的标签。
4. `%`、`_`、`\` 被当作普通字符，不扩大匹配范围或触发 SQL 错误。
5. limit 为 0 或大于 100 时返回稳定的参数错误。
6. 无参数 HTTP `/api/tags` 仍返回完整列表，Chrome 扩展兼容。
7. 既有书签搜索、星标、标签筛选 Rust 测试全部通过。

### 8.2 前端

1. 首屏标签请求为 `{ query: '', limit: 50 }`。
2. 标签搜索防抖后请求标准化 query，并能展示第 51 名以后的匹配标签。
3. 已选标签在清空标签搜索后仍可见且可取消，不出现隐形筛选条件。
4. 无搜索条件下“全部”和“星标”分别发送 `starred_only: false/true`。
5. 文本搜索或标签筛选期间始终发送 `starred_only: false`，并保持当前搜索结果行为。
6. 退出搜索态后恢复之前选择的基础视图。
7. 两个视图的空状态和星标取消确认行为正确。
8. 键盘可聚焦标签、搜索框和视图入口；当前视图提供 `aria-current` 或等价可访问状态。
9. 前端单测、TypeScript、Vite 生产构建通过。

## 9. 实施顺序

1. 增加后端 `TagQueryRequest`、Repository/Service 查询和测试。
2. 将 Tauri `get_tags` 与前端 invoke/API/type 统一改为参数化查询。
3. 在 `BookmarkView` 引入 `baseView` 和状态矩阵，并先补齐行为测试。
4. 重构 `TagPanel` 为侧边栏 UI，增加标签搜索与组件测试。
5. 做完整回归：标签变更事件、分页、搜索、星标切换、Chrome 扩展 `/api/tags`。

## 10. 风险与决策摘要

- **默认视图变化**：默认值已确认为“全部”，会替代当前首次进入时的“星标”行为。
- **隐形标签筛选**：top 50 会隐藏低频已选标签，必须固定展示已选项。
- **接口兼容**：HTTP `/api/tags` 显式使用无限制参数，继续返回全部；桌面内部统一使用参数化 Tauri 查询。
- **搜索性能**：`%query%` 会扫描标签表，但在个人书签数据量下成本可控；暂不进行 schema 升级。
- **架构影响**：不新增全局 store，不改变书签搜索核心；状态仍由 `BookmarkView` 编排，后端继续遵守 Repository → Service → Adapter 分层。
