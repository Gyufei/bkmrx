# Desktop 前端页面拆分与 Query 缓存优化计划

日期：2026-08-26

状态：已完成

范围：`apps/desktop/src`

## 1. 背景与目标

本计划承接代码库审计中的两项前端建议：

1. 拆分页面级超级组件，降低状态、数据请求、事件订阅、交互编排和 JSX 混合造成的维护成本。
2. 明确 TanStack Query 的缓存与失效策略，减少页面切换、窗口聚焦和 mutation 后不必要的 Tauri IPC/SQLite 查询。

本轮目标不是改变产品行为或视觉，而是建立更清晰的数据边界，并为后续性能测量提供稳定结构。

## 2. 当前基线与判断

### 2.1 页面结构热点

| 页面 | 当前信号 | 生产调用方 | 判断 |
| --- | --- | --- | --- |
| `bookmarks/BookmarkView.tsx` | 397 行；主函数 365 行；直接/间接依赖多；同时管理分页、随机模式、快捷键、预览与 mutation | `Layout.AppHome` | 本轮优先拆分 |
| `todos/TodoPage.tsx` | 301 行；主函数 257 行；同时管理 3 个 query、6 个 mutation、多组弹窗状态 | `Layout.AppHome` | 本轮优先拆分 |
| `rss/RssPage.tsx` | 581 行；页面与 5 个局部展示组件共处一文件；同时管理无限分页、刷新、删除、已读状态与阅读器 | `Layout.AppHome` | 本轮优先拆分 |
| `notes/NoteEditor.tsx` | 318 行；数据读写和并发保存已委托给 `useNoteDocument` | `NotesPanel` | 本轮不拆，避免按长度机械重构 |
| `notes/use-note-document.ts` | 429 行；职责聚焦于读取、保存队列、切换和重试，已有高密度行为测试 | `NoteEditor` | 明确不改 |

上述三个目标页面都只有一个生产入口。拆分时保持默认导出、props 和 `Layout` 路由契约不变，可将影响限制在 feature 目录内部。

### 2.2 Query 缓存现状

- 根 `QueryClient` 使用全部默认配置，未显式定义 `staleTime`、`gcTime`、重试和窗口聚焦策略。
- bookmarks 已有较成熟的局部缓存 helper：随机查询识别、访问次数更新、随机结果更新和非随机查询失效。
- RSS 的已读 mutation 已使用 `setQueriesData`，但新增、重命名、刷新和删除仍采用较宽泛的失效。
- Todo 任意 mutation 都同时失效所有 Todo 查询与标签查询；行为可靠，但可能产生重复 overview/list/tag IPC。
- notes watcher 已使用 `setQueryData` 局部同步，缓存策略相对清晰。
- 现有 Tauri 事件会在数据变化后主动失效相关查询，因此可以评估延长 stale 时间；但不能在未验证事件覆盖面的情况下直接关闭所有自动刷新。

### 2.3 测试基线

计划制定前的最近一次验证：

- Chrome extension：24 个测试通过。
- Desktop：258 个测试通过。
- 本计划只改 Desktop 前端，不修改 Chrome extension 与 Rust 契约。

实施开始时仍需重新运行目标分支基线，避免把后续新增改动误认为本计划回归。

## 3. 设计原则

1. 页面组件只负责页面级选择状态和布局编排；数据获取、mutation 与缓存同步进入领域 hook。
2. 不引入新的全局状态库，不把短生命周期弹窗/焦点状态塞入 Query 缓存。
3. Query key、queryFn、缓存更新和失效规则集中在各领域 API/query 模块，不散落到展示组件。
4. 先通过测试固定请求次数与缓存行为，再调整 `staleTime` 或失效范围。
5. 缓存更新保持不可变；不原地修改 `InfiniteData`、page 或 item。
6. 每个 task 保持可独立评审、可独立回滚；不做无关视觉和命名清理。

## 4. 目标结构

建议结构仅定义职责，不强制为了目录整齐创建空抽象：

```text
bookmarks/
  BookmarkView.tsx                 # 页面布局与 feature 组合
  use-bookmark-browser.ts          # 查询模式、无限分页、随机抽取、缓存同步
  use-bookmark-navigation.ts       # 当前项、DOM 注册、快捷键与预览焦点
  bookmarks.api.ts                 # query key、queryFn、缓存 helper

todos/
  TodoPage.tsx                     # 页面布局与弹窗挂载
  use-todo-controller.ts           # query、mutation、选中标签与失效编排
  todos.api.ts                     # query key、queryFn、缓存 helper

rss/
  RssPage.tsx                      # 三栏布局与 feature 组合
  use-rss-reader.ts                # scope、无限分页、选择与已读同步
  use-rss-mutations.ts             # 刷新、删除与缓存同步
  RssSidebar.tsx                   # Feed/范围侧栏
  RssEntryList.tsx                 # 文章列表
  RssEntryReader.tsx               # 正文与阅读动作
  rss.api.ts                       # query key、queryFn、缓存 helper

lib/
  query-provider.tsx               # 仅放经过验证的全局默认策略
```

若实现过程中发现两个 hook 之间需要频繁互传大量内部状态，应优先合并为一个高内聚 controller，而不是强行维持文件数量。

## 5. 影响评估

### 5.1 直接影响文件

- `lib/query-provider.tsx`
- `bookmarks/BookmarkView.tsx`
- `bookmarks/bookmarks.api.ts`
- `bookmarks/BookmarkView.test.tsx`
- `todos/TodoPage.tsx`
- `todos/todos.api.ts`
- `todos/TodoPage.test.tsx`
- `rss/RssPage.tsx`
- `rss/rss.api.ts`
- `rss/RssPage.test.tsx`
- 新增的领域 hooks、展示组件及其定向测试

### 5.2 间接回归面

- `Layout` 页面切换时的数据复用与重新请求行为。
- Tauri `bookmarks-changed`、`todos-changed`、`rss-changed` 事件触发后的数据新鲜度。
- bookmarks 搜索、随机抽取和无限分页 query key 的隔离。
- Todo 当前筛选、overview 统计、标签数量之间的一致性。
- RSS 全部/未读/单 Feed scope 的分页隔离、已读计数和当前选中项。
- 新增、编辑、删除、导入、刷新等其他组件对领域 query key 前缀的依赖。

### 5.3 风险等级

| 风险 | 等级 | 控制方式 |
| --- | --- | --- |
| 延长 stale 时间后外部变化不能及时显示 | 高 | 先审计事件覆盖；保留必要的 mount/focus 刷新；增加事件同步测试 |
| 缩小失效范围后 overview、计数或标签残留旧值 | 高 | 为每类 mutation 建立缓存影响矩阵；测试 active/inactive queries |
| 无限分页局部更新破坏 pages/pageParams 结构 | 高 | 复用不可变 helper；覆盖多页数据测试 |
| 拆 hook 后快捷键闭包或焦点恢复失效 | 中高 | 保留 BookmarkView 现有交互测试并增加 hook 边界测试 |
| 拆 RSS 子组件造成选择状态不同步 | 中高 | 页面保留唯一 selection source；子组件只接收 props |
| 文件增多但职责仍交叉 | 中 | 以数据所有权而非代码行数决定边界；task review 检查反向依赖 |
| 测试过度 mock 实现细节 | 中 | 页面测试覆盖用户行为，helper 测试只覆盖缓存变换与 query key |

## 6. 缓存策略决策框架

本计划不预先拍脑袋规定所有时间值。Task 1 先建立请求与事件基线，再按以下类别确定值：

| 数据类别 | 预期策略 | 原因 |
| --- | --- | --- |
| 系统信息、稳定设置 | 较长 `staleTime` | 变化低频，且修改路径可主动失效 |
| 标签、Feed 列表、Todo 标签 | 中等 `staleTime` + mutation/event 失效 | 页面频繁复用，变化点可追踪 |
| bookmarks/Todo/RSS 主列表 | 短到中等 `staleTime` + 精确事件失效 | 需要兼顾跨入口更新与页面切换性能 |
| 随机书签 | 保持 drawId 隔离，不因普通失效自动重抽 | 随机结果具有会话语义 |
| notes 文件列表 | watcher 驱动的局部更新优先 | 文件系统变化已有专用事件源 |

全局默认值必须保守。领域差异明显时，优先使用领域 `queryOptions`/hook 配置，而不是把所有查询强制成同一策略。

## 7. Task 拆分

### Task 0：基线与行为护栏

目标：在重构前固定数据新鲜度和请求行为。

工作：

- 重新运行 Desktop 全量测试与生产构建，记录现有 warning。
- 建立 mutation → 受影响 query 的缓存矩阵，覆盖 bookmarks、todos、RSS。
- 补充页面切换复用、窗口聚焦、Tauri 事件、inactive query 和无限分页多页更新测试。
- 测试通过 queryFn/invoke mock 统计调用次数，不引入运行时 telemetry 依赖。

验收：

- 能回答每种 mutation/event 应更新或失效哪些 key。
- 测试能够在“失效过宽”和“失效不足”时失败。
- 不改生产行为。

依赖：无。

### Task 1：Query 基础策略与领域缓存 helper

目标：先稳定数据层接口，再移动页面逻辑。

工作：

- 为 `QueryClient` 增加经 Task 0 验证的保守默认项；错误重试、窗口聚焦和 stale 策略必须显式记录理由。
- 为 bookmarks、todos、RSS 补齐领域 query key factory/query options。
- 将散落的 `invalidateQueries`、`setQueriesData` 规则收敛为具名 helper。
- 优先精确更新当前可确定的数据；无法安全推导的派生统计仍使用失效，不做猜测性 optimistic update。
- 保持随机书签查询不受普通 bookmarks 失效影响。

验收：

- query key 对等价输入稳定，对不同 scope/filter 隔离。
- 所有缓存更新不可变并保留 `InfiniteData.pageParams`。
- mutation/event 不影响无关领域缓存。
- Task 0 请求次数与数据新鲜度测试通过。

依赖：Task 0。

### Task 2：拆分 BookmarkView

目标：将书签数据状态、导航交互与页面布局分离。

工作：

- 抽取 `useBookmarkBrowser`：搜索/标签/base view、请求对象、无限分页、随机抽取和 star mutation。
- 抽取 `useBookmarkNavigation`：active bookmark、DOM ref map、上下移动、预览/打开快捷键和焦点恢复。
- `BookmarkView` 保留侧栏、header、结果区、预览和新增弹窗的组合。
- 不改变 `ResultList`、`BookmarkSidebar`、`BookmarkWebPreview` 的公开 props，除非测试证明一个极小调整能明显降低耦合。

验收：

- `BookmarkView` 不直接声明 Query mutation，也不直接拼装缓存失效规则。
- 搜索、标签筛选、随机动画、分页、星标、访问次数、J/K/P/O/X 快捷键行为不变。
- 页面默认导出与 `Layout` 调用不变。

依赖：Task 1。

### Task 3：拆分 TodoPage

目标：集中 Todo 查询、mutation 与标签选择规则，页面只编排 UI。

工作：

- 抽取 `useTodoController`，拥有 list/overview/tags query、六类 mutation、选中标签修正和 query 同步。
- 评估将 rename/delete/archive 三组弹窗状态保留在页面，或抽取为局部 dialog controller；以减少跨层参数为准。
- 复用 Task 1 的缓存 helper，避免每次 mutation 无条件刷新全部 query。
- 快速创建输入仍留在页面或小型 hook，不进入 Query 缓存。

验收：

- `TodoPage` 不直接构造 Query key 或缓存失效规则。
- list、overview、标签数量在创建、更新、状态切换、删除、重命名、合并和归档删除后保持一致。
- 当前标签被合并/删除时的筛选修正不变。
- 现有 Todo 页面和子组件测试全部通过。

依赖：Task 1；可与 Task 2 并行，但两者不能同时修改共享 Query 基础文件。

### Task 4：拆分 RssPage

目标：按数据控制、侧栏、文章列表和阅读器拆分当前 581 行文件。

工作：

- 抽取 `useRssReader`：scope、feed/entry queries、无限分页、当前文章选择与已读同步。
- 抽取 `useRssMutations`：全部刷新、单 Feed 刷新、删除及相关缓存更新。
- 将 `SidebarItem`/`FeedItem` 迁入 `RssSidebar`，将文章行迁入 `RssEntryList`，将 `EntryReader`/`ReaderActionBar` 迁入 `RssEntryReader`。
- 页面保留三栏布局、add/rename/delete dialog 挂载和唯一 selection source。

验收：

- 全部、未读、单 Feed scope 的 query key 与分页不串数据。
- 标记已读后文章、Feed 未读数和当前 scope 一致。
- 刷新、删除、重命名、新增后的失效范围符合缓存矩阵。
- 下载图片、外链、文章选择和加载更多行为不变。

依赖：Task 1；建议在 Task 2/3 至少完成一个并复盘边界后执行。

### Task 5：缓存参数收敛与性能验证

目标：在结构稳定后，根据测试数据确定最终缓存策略。

工作：

- 对比优化前后页面切换、窗口聚焦、连续 mutation 的 invoke 次数。
- 为每个领域确定并记录 `staleTime`、必要的 focus/mount refetch 与 GC 策略。
- 检查 inactive queries 是否在事件到达后正确标记 stale。
- 只对有证据的热点加入精确 `setQueryData`；不为减少一次请求复制复杂后端聚合规则。
- 更新本计划的最终决策与测量结果。

验收：

- 高频页面往返不再无条件重复拉取仍然新鲜的数据。
- 外部入口或 Tauri 事件造成的数据变化能在可接受时间内显示。
- 请求次数有基线对比，不能只以“代码看起来更快”验收。

依赖：Task 2、3、4。

### Task 6：集成验收与独立 Review

工作：

- 运行 Desktop 全量测试、生产构建和 `git diff --check`。
- 定向检查快捷键、无限分页、随机抽取、Todo 标签生命周期、RSS 已读/未读与页面切换。
- Review 两个维度：职责边界是否更清晰；缓存策略是否正确且确有收益。
- 检查 orphaned imports、旧 helper 和重复 query key；只删除本计划变更造成的孤立代码。

最终命令：

```bash
pnpm --filter bkmrx test
pnpm --filter bkmrx build
git diff --check
```

依赖：Task 5。

## 8. 依赖与执行顺序

```text
Task 0 基线与护栏
  └─→ Task 1 Query 基础与缓存 helper
       ├─→ Task 2 BookmarkView
       ├─→ Task 3 TodoPage
       └─→ Task 4 RssPage（建议吸收 Task 2/3 的复盘经验）
             └─→ Task 5 缓存参数与性能验证
                   └─→ Task 6 集成验收与 Review
```

并行策略：

- Task 2 与 Task 3 可在 Task 1 合并后并行。
- Task 4 涉及最大文件与无限分页，建议不与 Query 基础变更并行。
- 同一 task 内先迁移逻辑、保持 JSX，再拆展示组件，降低一次 diff 的认知负担。

## 9. 提交与回滚策略

建议每个 Task 一个独立提交；Task 2、3、4 如 diff 较大，可拆为“无行为逻辑迁移”和“展示组件拆分”两个提交。

- Query 默认策略与领域缓存 helper 分开提交，便于单独回滚参数。
- 不跨 task 重命名 query key 根前缀；若必须变更，应显式清理/迁移缓存并增加测试。
- 任一页面拆分出现难以定位的行为回归时，可回滚该页面 task，不影响其他领域。

## 10. 本轮明确不做

- 不修改 Rust、Tauri command 和 SQLite 实现。
- 不引入 Redux、Zustand、XState 或新的数据请求库。
- 不重做页面视觉、交互文案或导航。
- 不拆 `use-note-document.ts`，不重写笔记保存队列。
- 不把所有 mutation 改为 optimistic update。
- 不因静态文件长度批量拆分其他组件。
- 不顺手处理 Vite bundle warning；如测量显示 Query/组件拆分改变 chunk，再单独立项。

## 11. 评审待确认项

1. 是否认可本轮只拆 Bookmark、Todo、RSS 三个页面，保留 NoteEditor/use-note-document 原结构？
2. 是否认可先建立请求次数与事件测试，再决定具体 `staleTime`，而不是在计划阶段固定一个全局数值？
3. Task 2 与 Task 3 是否按可并行的独立实现任务推进，Task 4 在复盘后串行执行？

确认后从 Task 0 开始，任何缓存语义调整都以测试护栏和可量化请求次数为前置条件。

## 12. 实施结果

完成日期：2026-08-26

### 结构调整

- `BookmarkView.tsx` 从 397 行降至 114 行；新增 `useBookmarkBrowser` 与 `useBookmarkNavigation`，分别承载查询/随机模式和快捷键/预览焦点。
- `TodoPage.tsx` 从 301 行降至 192 行；新增 `useTodoController`，集中 list、overview、tags、mutation、事件失效和标签选择修正。
- `RssPage.tsx` 从 581 行降至 94 行；新增 `useRssReader`，并拆出 `RssSidebar`、`RssEntryList`、`RssEntryReader`。
- `NoteEditor` 与 `use-note-document` 按计划保持不变。

### Query 策略

- 根 QueryClient 设置 30 秒 `staleTime`、query retry 1 次、mutation 不重试。
- 保留默认窗口聚焦刷新行为；数据超过 fresh window 后仍可自动刷新。
- 显式 invalidation 不受 30 秒 fresh window 限制，可立即触发下次获取。
- 新增 `invalidateTodoQueries`、`invalidateRssQueries` 和 `updateRssEntryQueries`，收敛领域缓存规则。
- RSS 多页缓存更新保持不可变，并保留 `pageParams`。
- 随机书签继续使用 drawId 隔离，普通书签失效不触发随机重抽。

### 请求行为验证

- 相同 query 在 30 秒 fresh window 内连续获取两次，queryFn 只调用一次。
- 显式 invalidation 后再次获取，queryFn 立即产生第二次调用。
- Todo/RSS helper 测试确认只失效本领域 key，不影响无关缓存。
- RSS 已读测试确认不重新获取 entries 即可同步当前文章和已缓存分页。

### 最终验证

- `pnpm --filter bkmrx test`：38 个测试文件、264 个测试全部通过。
- `pnpm --filter bkmrx build`：通过。
- `git diff --check`：通过。
- 已知非阻断项保持不变：主 bundle 与 Markdown 编辑器 chunk 仍超过 500 kB，本计划未处理 bundle splitting。

### Review 跟进

- RSS 未读列表在文章被标记为已读后仍保留当前文章，避免阅读过程中条目突然消失；这是明确的产品行为。
- Todo 成功 mutation 不再直接失效缓存，统一由后端成功提交后发送的 `todos-changed` 事件触发，避免一次写入造成重复查询。
- RSS 标记已读、刷新全部与刷新单个订阅失败时统一使用错误 toast 提示。
- 全局 30 秒 fresh window、重试配置和现有测试覆盖范围按评审决定保持不变。
