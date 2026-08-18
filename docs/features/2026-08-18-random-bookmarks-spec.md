# “随便看看”书签探索功能规格

## 1. 背景与目标

书签数量增长后，用户通常只会通过搜索、标签或星标回到已知内容，较早收藏但已被遗忘的书签缺少重新出现的机会。本功能在书签页侧栏增加“随便看看”，每次从全库抽取少量书签，提供轻量的内容探索入口。

目标：

1. 在“全部”“星标”下方增加“随便看看”基础视图。
2. 每次点击从全库均匀随机返回最多 7 个书签。
3. 复用当前书签列表查询调用链，不新增后端 endpoint。
4. 用轻量骰子动画提供明确的重复抽取反馈。
5. 保持搜索、标签筛选、书签查看和编辑等既有行为不变。

## 2. 非目标

- 不增加“换一批”按钮或新的键盘快捷键。
- 不保存随机结果，不维护浏览历史，也不做跨批次去重。
- 不提供抽取数量设置、随机权重或按标签随机。
- 不引入动画库，不增加数据库表或 schema 迁移。
- 不新增独立的随机书签 Tauri command 或 HTTP endpoint。

## 3. 交互规格

### 3.1 侧栏入口

- 在侧栏底部基础视图区按“全部”“星标”“随便看看”的顺序展示。
- “随便看看”使用 Lucide `Dice` 图标，并沿用现有 `ViewButton` 的选中与悬停样式。
- 点击入口即触发一次新抽取。入口已处于选中状态时再次点击，也必须重新抽取。
- 抽取进行中禁用重复点击；只有动画结束且结果已经展示后才重新允许点击。

### 3.2 视图优先级

“随便看看”与“全部 / 星标”同属低优先级基础视图：

```ts
type BookmarkBaseView = 'all' | 'starred' | 'random';

const isSearchMode = query.length > 0 || selectedTags.length > 0;
const effectiveView = isSearchMode ? 'search' : baseView;
```

- 主搜索词或已选标签存在时，忽略当前基础视图并执行既有搜索/标签查询。
- 进入搜索态时不清除 `baseView`。
- 清除全部搜索词和标签后，如果 `baseView` 为 `random`，立即重新抽取，不恢复筛选前的随机结果。
- 从随机视图切换到其他基础视图再返回时，重新抽取。

### 3.3 结果规则

- 候选范围为全部书签，包含星标书签。
- 每批最多 7 条，同一批中不重复。
- 少于 7 条时返回全部书签；没有书签时显示“暂无书签可供随机查看”。
- 不排除上一批结果；不同批次可以重复。
- 随机列表使用现有书签列表组件，支持预览、打开、编辑、星标和删除等既有操作。
- 随机结果没有下一页，不触发无限滚动加载。
- 当前批次在展示期间保持稳定，不因窗口重新聚焦或普通后台刷新自行变化。

### 3.4 骰子动画与延时

- 点击后仅旋转侧栏中的 `Dice` 图标，不遮挡主内容区。
- 使用 CSS keyframes，实现前段快速、后段减速的旋转，目标时长约 700ms。
- 不引入动画依赖或复杂状态机。
- 请求与动画并行执行；结果展示必须同时满足：请求完成、最短动画时间结束。
- 本地请求早于动画完成时，等待动画结束再一次性展示结果；请求较慢时等待请求完成。
- 首次进入且没有旧结果时，列表区复用现有加载状态；重复抽取时保留旧列表，直到新结果可以展示，避免闪烁。
- 使用 `prefers-reduced-motion: reduce` 关闭旋转，仅保留轻微透明度反馈。该支持可用一条 CSS 媒体查询完成，不增加运行时机制。

## 4. 当前列表请求契约审查

当前前后端 `BookmarkPageRequest` 为扁平结构：

```ts
interface BookmarkPageRequest {
  query: string;
  tags: string[];
  cursor: string | null;
  page_size: number;
  starred_only: boolean;
}
```

现有优点：

- 字段简单，Tauri 调用和 HTTP 适配容易。
- `page_size` 在后端校验为 `1..=100`。
- 游标绑定标准化查询、排序标签、分页大小和星标模式，能拒绝跨查询复用。
- SQL 使用参数绑定，文本和标签输入不会拼接为 SQL。

需要修正的问题：

1. `starred_only: true` 与非空 `query` / `tags` 可以同时出现，但后端会静默忽略文本和标签。契约允许表达没有明确语义的组合。
2. 继续增加 `random_only` 会产生 `starred_only && random_only` 等更多非法状态。
3. 随机查询不使用游标，且固定 7 条；继续复用扁平分页字段会让 `cursor`、`page_size` 在随机模式中的语义含糊。
4. 前端查询键通过多个位置参数构造，新增模式和抽取序号后容易漏字段，导致不同请求错误共享缓存。
5. Rust 请求结构没有 `deny_unknown_fields`，边界上的拼写错误可能被 Serde 静默忽略。

结论：当前契约对现有两种内部调用基本可用，但不适合直接再叠加布尔开关。本次应在同一 endpoint 内将其改为可辨识联合类型，使非法组合无法构造。

## 5. 优化后的数据契约

### 5.1 请求类型

前端使用判别联合，Rust 使用 Serde tagged enum；两端 JSON 形状保持一致：

```ts
type BookmarkPageRequest =
  | {
      mode: 'browse';
      starred: boolean;
      cursor: string | null;
      page_size: number;
    }
  | {
      mode: 'search';
      query: string;
      tags: string[];
      cursor: string | null;
      page_size: number;
    }
  | {
      mode: 'random';
      limit: number;
    };
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum BookmarkPageRequest {
    Browse {
        #[serde(default)]
        starred: bool,
        cursor: Option<String>,
        page_size: u32,
    },
    Search {
        #[serde(default)]
        query: String,
        #[serde(default)]
        tags: Vec<String>,
        cursor: Option<String>,
        page_size: u32,
    },
    Random {
        limit: u32,
    },
}
```

规则：

- `browse` 只表达全部或星标分页，不接受文本和标签。
- `search` 表达文本与标签的组合筛选，不接受星标开关。
- `random` 只接受 `limit`，不携带游标；后端仍校验 `limit` 为 `1..=100`，桌面端固定传 7。
- 所有模式继续返回相同的 `BookmarkPage`；随机模式的 `next_cursor` 恒为 `null`。
- 该调整复用原有 `query_bookmarks` command 和 `BookmarkService::query`，不是新增接口。

### 5.2 HTTP 适配兼容

现有 `GET /api/bookmarks` 继续接受 `query`、`tags`、`cursor`、`page_size`，由 HTTP handler 映射成内部 `browse` 或 `search` 请求：

- `query` 和 `tags` 都为空：映射为 `browse { starred: false, ... }`。
- 任一非空：映射为 `search { ... }`。
- 本期不向 HTTP API 暴露随机模式，也不改变 Chrome 扩展调用方式。

这样可以改善内部类型安全，同时不破坏已有本地 HTTP API。

### 5.3 查询键

React Query key 直接包含标准化后的请求描述，而不是平行的位置参数：

```ts
['bookmarks', normalizedRequest, drawId]
```

- 标签排序后进入 key，避免相同标签集合产生不同缓存。
- `drawId` 只用于随机模式，每次有效点击递增，确保重复点击发起新抽取。
- 普通分页请求不携带 `drawId`。
- 随机查询关闭窗口聚焦自动刷新，并避免普通失效操作无意中重抽；书签变更只更新当前结果中的实体或在下一次主动抽取时反映。
- 编辑或星标操作原位替换随机缓存中的对应书签，删除操作原位移除对应书签；这些操作不会重抽整批结果。新增书签只影响下一次主动抽取。

## 6. 后端查询设计

- 在现有 `BookmarkSearch::search` 分派中增加 `random` 分支，不新增 service 或 command。
- SQLite 使用 `ORDER BY RANDOM() LIMIT ?` 从全库抽取 ID；在约两千条本地书签规模下，全表随机排序成本可接受，且实现最直接、分布均匀。
- 继续通过 `BookmarkRepository::get_by_ids_ordered` 按随机 ID 顺序 hydrate 完整书签，避免 N+1 查询。
- 随机模式不编码或解析游标。
- `limit` 使用参数绑定并在执行 SQL 前校验。

## 7. 验收标准

1. 侧栏在“星标”下显示带骰子图标的“随便看看”。
2. 每次有效点击返回 0 到 7 条全库随机书签，同一批无重复且没有下一页。
3. 已选中时重复点击仍会抽取；请求或动画完成前的点击被忽略。
4. 搜索/标签覆盖随机模式；清空筛选后产生新批次。
5. 动画约 700ms，快速旋转后减速停止；不新增动画依赖。
6. 新结果不会早于动画结束展示，慢请求也不会展示未完成数据。
7. 现有全部、星标、文本搜索、标签筛选、游标校验和 HTTP 列表行为保持通过。
8. 非法请求组合由类型或后端反序列化/校验拒绝，不再被静默忽略。
9. 前后端单元测试、Rust 集成测试、类型检查和构建通过。

## 8. 预计修改范围

- `apps/desktop/src/types.ts`
- `apps/desktop/src/bookmarks/bookmarks.api.ts`
- `apps/desktop/src/bookmarks/BookmarkView.tsx`
- `apps/desktop/src/bookmarks/BookmarkSidebar.tsx`
- `apps/desktop/src/bookmarks/AddBookmarkDialog.tsx`
- `apps/desktop/src/bookmarks/EditBookmarkDialog.tsx`
- `apps/desktop/src/bookmarks/DeleteBkDialog.tsx`
- `apps/desktop/src/App.css`（仅追加骰子动画；保留当前未提交改动）
- `apps/desktop/src-tauri/src/bookmarks/model.rs`
- `apps/desktop/src-tauri/src/bookmarks/search.rs`
- `apps/desktop/src-tauri/src/http_server.rs`
- 对应前端测试与 `apps/desktop/src-tauri/tests/search_pagination.rs`、HTTP API 测试
