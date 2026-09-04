# RSS 文章收藏到书签实施计划

本计划以 [RSS 文章收藏到书签需求规格](./2026-09-04-rss-entry-bookmark-spec.md) 为唯一产品范围。任务按依赖顺序推进；除文档与人工视觉验收外，每个任务都必须先建立自动化测试围栏，再完成最小实现。

## 1. 实施原则

- 复用现有 `AddBookmarkDialog`、`EditBookmarkDialog`、`BookmarkForm`、书签 API 和 React Query 缓存能力。
- 不新增后端接口、数据库迁移或 RSS—书签关联模型。
- 保持书签页现有调用方式兼容；RSS 所需能力通过最小、明确的组件契约扩展提供。
- 状态编排集中在 RSS 功能边界，阅读工具栏只负责呈现状态和发出意图。
- 每个任务遵循“失败测试 → 最小实现 → 定向回归”的顺序。

## 2. 任务依赖图

```text
T1 可复用书签弹窗契约
 └─→ T3 RSS 收藏状态与弹窗编排

T2 RSS 摘要纯文本映射
 └─→ T3 RSS 收藏状态与弹窗编排

T3 RSS 收藏状态与弹窗编排
 ├─→ T4 并发冲突与跨入口同步
 └─→ T5 阅读工具栏状态接线

T4 + T5
 └─→ T6 集成回归与人工验收
```

## 3. T1：扩展可复用书签弹窗契约

### 目标

让 RSS 入口能够向现有添加弹窗传入初始值，并在添加或编辑成功后接收结果，同时保持书签页现有行为不变。

### 工作

- 为 `AddBookmarkDialog` 增加可选初始表单值，未传入时继续使用当前空表单。
- 确保弹窗针对不同 RSS 文章打开时，表单会使用新的初始值，不残留上一次输入或错误。
- 为添加与编辑弹窗增加最小成功回调，使 RSS 容器能够显示成功消息并重新确认状态。
- 保留现有 mutation、关闭逻辑、标签查询和缓存刷新职责。
- 不把 RSS 类型或 RSS 文案引入通用书签组件。

### 测试围栏

修改并补充：

- `apps/desktop/src/bookmarks/AddBookmarkDialog.test.tsx`
- `apps/desktop/src/bookmarks/EditBookmarkDialog.test.tsx`
- 必要时补充 `apps/desktop/src/bookmarks/BookmarkForm.test.tsx`

必须覆盖：

- 未传初始值时书签页仍显示空白添加表单。
- 传入值时 URL、标题、描述和标签准确预填。
- 关闭后为另一组初始值重新打开，不残留旧值或旧错误。
- 添加和编辑成功回调只在 mutation 成功后调用，且收到保存后的书签。
- 添加、编辑失败仍保留弹窗与输入，并沿用现有错误展示。
- 现有查询和标签缓存失效断言保持通过。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/bookmarks/AddBookmarkDialog.test.tsx src/bookmarks/EditBookmarkDialog.test.tsx
```

### 完成条件

弹窗具备 RSS 所需的通用输入/输出契约，书签页无需提供新参数，现有测试全部通过。

## 4. T2：实现 RSS 摘要到书签描述的纯文本映射

### 目标

将 RSS 条目稳定、无 HTML 地映射成添加书签表单初始值。

### 工作

- 新增聚焦的 RSS→书签表单值映射函数。
- URL 使用文章 `link`，标题使用文章 `title`，标签固定为空。
- 摘要转换为纯文本，解码常见 HTML entity、合并多余空白并清理首尾空白。
- 空摘要输出空描述，不回退到 `content_html`。
- 输入对象保持不可变。

### 测试围栏

新增聚焦单元测试文件，例如：

- `apps/desktop/src/rss/rss-bookmark.test.ts`

必须覆盖：

- 普通文本摘要。
- 带标签、嵌套标签、HTML entity 和连续空白的摘要。
- 空字符串和仅含标签/空白的摘要。
- 中文、emoji 和链接文本。
- 不读取完整正文、不自动添加标签、不修改原始 `RssEntry`。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/rss/rss-bookmark.test.ts
```

### 完成条件

映射函数对规格中的字段和清理规则有独立测试保护，可被 RSS 编排层直接调用。

## 5. T3：实现 RSS 收藏状态与弹窗编排

### 目标

基于当前文章 URL 管理查询中、未收藏、已收藏、无链接和查询失败状态，并选择添加或编辑流程。

### 工作

- 为当前选中文章建立按 URL 查询书签的 React Query 状态；无链接时不发请求。
- 查询键包含修剪后的完整 URL，判重语义与现有后端一致。
- 配置窗口重新聚焦时重新确认状态；文章切换时使用独立查询键，避免旧结果覆盖新文章。
- 未收藏点击时打开带 RSS 初始值的添加弹窗。
- 已收藏点击时把查询结果交给现有编辑弹窗。
- 查询失败不得打开添加弹窗；按钮点击触发重试。
- 添加成功提示 `收藏成功`，编辑成功提示 `书签更新成功`，并刷新当前 URL 状态。
- 取消弹窗不修改查询数据。

### 测试围栏

优先新增聚焦 hook/容器测试，并在页面集成测试补主路径：

- `apps/desktop/src/rss/use-rss-bookmark.test.tsx`（若状态抽成 hook）
- `apps/desktop/src/rss/RssPage.test.tsx`

必须覆盖：

- 无链接时不调用 `checkBookmarkApi`。
- 有链接时使用修剪后的完整 URL 查询。
- 查询返回 `null` 打开预填添加弹窗；返回书签打开对应编辑弹窗。
- 查询 pending 时禁止重复触发。
- 查询失败不降级为未收藏，最终只提示一次错误，点击可重试。
- 快速切换文章并乱序完成请求时，页面只呈现当前文章状态。
- 新增和编辑成功分别显示正确消息、刷新状态并保持 RSS 页面。
- 编辑 URL 离开原文 URL 后，当前文章变回未收藏。
- 取消添加或编辑不改变状态。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/rss/use-rss-bookmark.test.tsx src/rss/RssPage.test.tsx
```

若最终没有独立 hook 测试文件，则从命令中移除该路径，并确保同等行为全部落在 `RssPage.test.tsx`。

### 完成条件

所有收藏状态均由当前文章 URL 和查询结果派生，添加/编辑弹窗选择、成功反馈及重试行为符合规格。

## 6. T4：处理并发 URL 冲突与跨入口同步

### 目标

保证检查与创建之间发生竞争时不会覆盖数据，并让应用其他入口的书签变更反映到 RSS 状态。

### 工作

- 在添加失败路径中只对稳定的 URL 冲突进行恢复，不用错误消息字符串模糊匹配普通失败。
- 在前端调用边界增加最小 `AppError` 结构守卫，读取 Tauri 已返回的 `code`；不改变 Rust 错误契约。
- 冲突后按提交 URL 查询现有书签；找到后关闭添加模式、提示 `该文章已收藏，可编辑现有书签` 并打开编辑弹窗。
- 转入编辑时使用数据库中的当前书签内容，不用 RSS 初始值覆盖它。
- 冲突后查询仍失败或返回空时，保持添加弹窗和输入，沿用现有添加错误展示。
- 复用现有书签缓存失效机制；应用内新增、编辑、删除后使当前 URL 状态可重新获取。
- 不新增后端事件协议或持久关联。

### 测试围栏

补充：

- `apps/desktop/src/bookmarks/AddBookmarkDialog.test.tsx`
- `apps/desktop/src/rss/RssPage.test.tsx` 或对应 RSS 收藏编排测试
- 必要时补充 `apps/desktop/src/bookmarks/bookmarks.api.test.ts`

必须覆盖：

- URL 冲突后查询成功，进入编辑模式并保留现有书签字段。
- 只有结构化错误码 `bookmark_url_conflict` 触发恢复；相同错误文案但不同错误码不得误触发。
- 普通添加错误不触发冲突恢复。
- 冲突后二次查询为空或失败时不关闭添加弹窗、不丢失输入。
- 其他入口的添加、编辑、删除使相关收藏状态查询失效或重新获取。
- 不相关 URL 和随机书签缓存不被错误写入；现有缓存回归断言保持通过。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/bookmarks/AddBookmarkDialog.test.tsx src/bookmarks/bookmarks.api.test.ts src/rss/RssPage.test.tsx
```

### 完成条件

并发冲突不会自动覆盖书签，跨入口变更能按规格刷新 RSS 状态，普通错误路径保持原样。

## 7. T5：接线阅读工具栏状态与无障碍语义

### 目标

让右侧阅读工具栏准确呈现收藏状态，并保持现有无图和翻译按钮行为不变。

### 工作

- 为 `RssEntryReader` / `ReaderActionBar` 增加最小收藏状态与点击契约。
- 未收藏和已收藏分别使用规格文案。
- 已收藏按钮复用无图模式当前的 `secondary` 选中视觉和 `aria-pressed` 语义。
- 无链接和查询中禁用按钮，并提供对应 Tooltip/无障碍名称。
- 查询失败提供可重试操作和可识别的异常语义。
- 将现有不准确文案“收藏当前网站到书签”替换为状态化文案。

### 测试围栏

补充 `apps/desktop/src/rss/RssPage.test.tsx`；若工具栏拆出独立组件，则增加对应组件测试。

必须覆盖：

- 未收藏按钮的名称、普通样式和点击行为。
- 已收藏按钮的名称、`secondary` 视觉、`aria-pressed=true` 和点击行为。
- 无链接按钮禁用且原因可被无障碍查询获得。
- 查询中按钮禁用，连续点击不会重复触发。
- 查询失败按钮能够触发重试。
- 无图按钮的选中行为与翻译按钮仍然存在且无回归。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/rss/RssPage.test.tsx
```

### 完成条件

工具栏视觉、Tooltip、无障碍状态和点击行为与规格一致，既有阅读操作不受影响。

## 8. T6：集成回归与人工验收

### 目标

在合并前证明功能闭环成立，并确认共享书签组件没有回归。

### 自动化测试围栏

先运行全部定向测试：

```bash
pnpm --filter bkmrx exec vitest run src/bookmarks/AddBookmarkDialog.test.tsx src/bookmarks/EditBookmarkDialog.test.tsx src/bookmarks/bookmarks.api.test.ts src/rss/RssPage.test.tsx
```

若新增聚焦测试文件，将其加入上述命令。随后运行全量前端验证：

```bash
pnpm --filter bkmrx test
pnpm --filter bkmrx build
```

只有在变更意外触及 Rust 契约时才需要运行 Rust 测试；按本计划正常实施不应改动 Rust。若发生该特殊情况，任务必须暂停、更新规格与计划，经确认后再继续。

### 人工验收（特殊：无法完全由 jsdom 覆盖）

- 浅色和深色主题下确认普通、选中、禁用及异常状态清晰。
- 确认 Tooltip 位置、右侧工具栏布局和右下角消息与现有界面一致。
- 连续快速切换多篇文章，确认收藏状态不闪回旧结果。
- 分别从 RSS、书签页操作同一 URL，确认添加、编辑、删除后的状态同步。
- 删除 RSS 订阅，确认已经创建的普通书签仍存在。

人工验收不替代自动化测试，只覆盖真实弹层、Tooltip、主题和桌面窗口聚焦等 jsdom 难以可靠验证的表现。

### 最终审查

- 对照规格逐条核验验收标准。
- 检查 diff，确保无数据库、后端 API、星标、标签自动化或导航等范围外改动。
- 检查新增逻辑的错误处理、输入清理、不可变更新和无障碍属性。
- 记录实际运行的命令、结果及任何与计划的偏差。

### 完成条件

定向测试、全量前端测试和生产构建全部通过，人工验收无阻断问题，且每个规格条目都能映射到实现与测试证据。

## 9. 建议提交边界

为便于审查，建议按以下边界提交：

1. `test/bookmark-dialog-contracts`：T1 测试与实现；
2. `test/rss-bookmark-mapping`：T2 测试与实现；
3. `feat/rss-bookmark-flow`：T3 与 T5 的状态编排和工具栏接线；
4. `fix/rss-bookmark-conflict-sync`：T4 竞争恢复与缓存同步；
5. `test/rss-bookmark-regression`：T6 回归补强与验收记录。

提交边界是审查建议，不要求为了提交数量拆出无意义的中间状态；任何提交都必须保持其涉及的定向测试通过。
