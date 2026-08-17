# Desktop 前端代码 Review 与改造计划

日期：2026-08-17

范围：`apps/desktop/src`

## 结论摘要

当前前端按 bookmarks、notes、settings、todos 组织，React Query 与 Tauri API 边界清晰，测试基线可靠。审阅时 25 个测试文件、185 个测试全部通过，未发现 Critical 级问题。

主要技术债集中在三类：

1. 页面容器同时承担查询、事件同步、mutation、弹窗状态与渲染，职责偏重。
2. 同类交互存在多套实现，尤其是删除确认、加载、空状态和错误反馈。
3. 项目已使用 shadcn/Base UI，但部分业务组件仍手写通用 UI 原语，导致可访问性与视觉规范漂移。

## Review Findings

### R1 高：统一破坏性操作

- 书签删除使用普通 `Dialog` 确认。
- Todo 标签删除使用 `AlertDialog`。
- 笔记与 Todo 本体从右键菜单直接删除。

改进：新增共享 `ConfirmDeleteDialog`，基于 `AlertDialog`；所有不可撤销删除统一确认、pending 锁定和错误保留策略。

涉及：

- `bookmarks/DeleteBkDialog.tsx`
- `notes/NotesPanel.tsx`
- `todos/TodoListItem.tsx`
- `todos/TodoPage.tsx`
- `todos/TodoTagDialogs.tsx`

验收：书签、笔记、Todo、Todo 标签均需二次确认；取消不触发 mutation；pending 时不可重复提交。

### R2 高：拆分 NotesPanel 与统一 Tauri 事件订阅

`NotesPanel` 同时负责设置读取、目录扫描、事件订阅、缓存同步、增删改、筛选、三栏布局和文件名弹窗。

改进：

- 抽取 `useNotesWorkspace` 管理查询、监听与 mutation。
- 抽取 `NotesSidebar`、`NotesList`、`NoteNameDialog`。
- 抽取或复用统一的 `useTauriEvent`，采用 cancelled/unlisten/catch 生命周期模板。

验收：`NotesPanel` 只保留页面级选择状态和布局编排；监听失败不会产生未处理 Promise rejection；原行为测试通过。

### R3 高：合并书签新增与编辑表单

`AddBookmarkDialog` 与 `EditBookmarkDialog` 的 URL、标题、标签、描述、校验、错误区和 footer 近重复。

改进：抽取 `BookmarkForm`，新增/编辑容器只负责初始值、mutation 和关闭策略。

验收：字段行为与现有测试一致；新增、编辑分别保留独立 mutation；公共表单没有 React Query 依赖。

### R4 中高：替换手写 TagInput 原语

现有 `TagInput` 手写多选 combobox 的键盘导航、点击外部关闭、active index 和浮层，缺少完整 combobox/listbox ARIA 关系。

改进：使用 shadcn/Base UI 可组合原语实现，优先 `Combobox` 或 `Command + Popover`；已选项使用 `Badge`，移除动作使用 icon `Button`。标签查询移出通用展示组件，由调用方注入 suggestions。

验收：支持 Enter、逗号、Backspace、Escape、上下方向键；具备正确 combobox/listbox/option 语义；书签和 Todo 均可复用。

### R5 中：拆分 SettingsPage

`SettingsPage` 同时承载系统信息、两个重复目录编辑器和书签导入导出状态机。

改进：抽取 `SystemInfoCard`、`EditableDirectoryField`、`BookmarkTransferCard`。区域布局使用 `Card`；导入确认使用 `AlertDialog`。

验收：两个目录编辑路径复用同一组件；Enter/Escape、pending、错误恢复与原行为一致；导入预检与应用状态保持清晰。

实施状态：已完成。三个领域组件已抽取，设置区域已迁移为完整 `Card` 组合，导入确认使用 `AlertDialog`；目录字段补齐了失败状态语义。

### R6 中：统一表单组合与校验语义

书签、Todo 和笔记弹窗普遍使用 `div + Label + Input`，错误只是普通红色文本；Todo 高优先级使用原生 checkbox。

改进：引入并统一使用 `FieldGroup`、`Field`、`FieldLabel`、`FieldError`、`Checkbox`，为无效字段补齐 `data-invalid` 与 `aria-invalid`。

验收：标签与控件正确关联；校验错误可被辅助技术识别；pending/disabled 状态一致。

实施状态：已完成。已提供最小 `FieldGroup`、`Field`、`FieldLabel`、`FieldError` 与 Base UI `Checkbox` 原语，并迁移 `BookmarkForm`、`NoteNameDialog`、`EditableDirectoryField`、`TodoDialog`。

### R7 中：统一反馈状态

当前存在自制 spinner、纯文本 loading、自制空状态和多种内联错误条。

改进：按需要引入 `Spinner`、`Empty`、`Alert`、`Separator`，建立页面级反馈模式；不为单一场景创建额外抽象。

验收：ResultList、NotesPanel、TodoPage、NoteEditor、SettingsPage 使用一致原语，保留原有文案与重试能力。

### R8 中低：收敛业务层 UI 原语

业务代码仍存在原生 `button`、自制标签 `span`、模板字符串条件 class 和组件内 icon 尺寸覆盖。

改进：动作使用 `Button`，标签使用 `Badge`，条件 class 使用 `cn`，Button 内 icon 使用 `data-icon` 并交由组件控制尺寸。

验收：不改变交互和布局；减少重复 focus/hover/disabled 样式。

## 不建议改动

`notes/use-note-document.ts` 虽然约 422 行，但职责聚焦于文档读取、并发保存、切换与重试语义，并已有细致测试覆盖。本轮不因文件长度机械拆分。

## 实施计划

### Phase 1：交互安全与一致性

#### Task 1.1 删除确认统一

- 实现共享 `ConfirmDeleteDialog`。
- 迁移书签删除。
- 为笔记和 Todo 本体补确认。
- 保留 Todo 标签既有语义，可直接复用共享组件或维持相同 AlertDialog 组合。
- 补充行为测试。

依赖：无。

#### Task 1.2 Tauri 事件订阅统一

- 实现 `useTauriEvent`。
- 迁移 notes、bookmarks、todos 的事件监听。
- 覆盖卸载前后 resolve、监听失败和 cleanup。

依赖：无，可与 Task 1.1 并行，但避免同时修改同一页面时需后合并。

### Phase 2：结构拆分

#### Task 2.1 BookmarkForm

- 抽取无数据层依赖的表单。
- 迁移新增、编辑弹窗。
- 统一字段校验与 pending UI。

依赖：基础 Field/Checkbox 组件可在本任务内按需引入。

#### Task 2.2 SettingsPage 拆分

- 抽取三个领域组件。
- 复用 `EditableDirectoryField`。
- 保持 mutation 与缓存失效边界在 feature 层。

依赖：Card、Field、AlertDialog 原语。

#### Task 2.3 NotesPanel 拆分

- 抽取 workspace hook 与三个展示组件。
- 保留查询 key、缓存同步与选中行为。
- 不修改 `use-note-document`。

依赖：Task 1.1、1.2，避免重复改动 NotesPanel。

### Phase 3：shadcn 原语收敛

#### Task 3.1 TagInput 重构

- 使用可访问的组合原语替换手写浮层与选项交互。
- 查询从 TagInput 移到书签调用方，Todo 继续注入 suggestions。
- 扩充键盘与 ARIA 测试。

依赖：Phase 2 的 BookmarkForm 完成后执行，降低冲突。

#### Task 3.2 Feedback primitives

- 引入并迁移 Spinner、Empty、Alert、Separator、Badge。
- 仅处理 review 点名位置，不做全仓库视觉重写。

依赖：Phase 1、2 完成后执行。

## 任务拆分与冲突策略

首轮并行：

- A：Task 1.1，删除确认统一。
- B：Task 2.1，BookmarkForm。
- C：Task 2.2，SettingsPage 拆分。

第二轮串并行：

- D：Task 1.2，Tauri 事件订阅统一。
- E：Task 2.3，基于 D 拆分 NotesPanel。
- F：Task 3.1，基于 B 重构 TagInput。

收尾：

- G：Task 3.2，反馈原语收敛。
- H：整体 code review、死代码检查、全量测试与构建。

若任务触碰同一文件，必须以上游任务完成后的工作区为基础继续，不并行编辑。

## Quality Gates

每个 Task 必须满足：

1. 变更与任务边界直接相关，不顺手清理无关代码。
2. 新增或更新行为测试。
3. 相关 Vitest 测试通过。
4. TypeScript/Vite build 通过，或明确记录非本任务导致的既有失败。
5. 按 correctness、readability、architecture、security、performance 五个维度 review。
6. 检查并报告 orphaned imports、helpers、components；不擅自删除不确定的既有死代码。

最终验收：

- `pnpm --filter bkmrx test`
- `pnpm --filter bkmrx build`
- 删除确认、表单键盘操作、TagInput 键盘与辅助技术语义做定向验证。

## 实施结果

状态：2026-08-17 全部计划任务已完成。

- Task 1.1：新增共享 `ConfirmDeleteDialog`，统一书签、笔记、Todo 与 Todo 标签删除确认、pending 与错误处理。
- Task 1.2：新增 `useTauriEvent`，迁移 bookmarks、notes、todos 的事件订阅并覆盖异步 cleanup 竞态。
- Task 2.1：抽取无数据层依赖的 `BookmarkForm`，新增/编辑弹窗只保留各自 mutation 编排。
- Task 2.2：拆分 SettingsPage，并落地 `Card` 与可复用目录编辑字段。
- Task 2.3：抽取 `useNotesWorkspace`、`NotesSidebar`、`NotesList`、`NoteNameDialog`；保留 `use-note-document` 原实现。
- Task 3.1：TagInput 改为纯 suggestions 边界，浮层使用 canonical Popover，补齐多选 combobox ARIA 与键盘行为。
- Task 3.2：新增并使用 `Alert`、`Badge`、`Empty`、`Separator`、`Spinner`；同时落地 `Field`、`Checkbox`、`Card` 表单与布局原语。
- Task H：独立 review 的 Required findings 已全部修正；未发现 Critical、安全或行为阻断项。

最终验证：

- 根目录 `pnpm test`：Chrome extension 9/9、Desktop 31 files / 215 tests 全部通过。
- `pnpm --filter bkmrx build`：通过。
- `git diff --check`：通过。
- 已知非阻断项：Vite 仍提示主 bundle 与 Markdown 编辑器 chunk 大于 500 kB；本轮未扩展到 bundle splitting。
