# Todo 标签归档删除功能设计

## 1. 背景与目标

分类标签右键菜单目前只有一个删除动作，且明确不删除待办任务。本需求新增「归档删除」：一次性删除标签及其下所有待办，用于清理已归档完成的分类。

与现有「标签删除」的区别：

- **标签删除**：只删除标签及关联关系，待办全部保留。
- **归档删除**：删除标签，并删除关联该标签的所有待办。
- 归档删除前必须校验：该标签下存在 `in_progress`（进行中）待办时禁止删除，并提示「当前标签存在未完成待办，无法归档删除。」只有全部为已完成、已取消或已挂起时才允许。

## 2. 目标

1. 分类标签右键菜单新增「归档删除」项。
2. 现有「删除」文案改为「标签删除」，功能保持不变。
3. 归档删除在校验通过后，删除标签及其下所有待办（多标签待办只要关联该标签即被删除）。
4. 校验放两层：前端预检即时反馈 + 后端事务内强制校验（权威）。
5. 沿用现有 Tauri command / service-repository / SQLite 分层与确认弹窗模式。

## 3. 非目标

- 不做回收站、撤销或恢复。
- 不改变「标签删除」的现有行为与确认弹窗文案。
- 不做批量归档或按状态筛选后归档。
- 不处理级联场景（待办被删除后其关联的其他标签正常保留）。

## 4. 交互

### 4.1 菜单

分类标签右键菜单（`apps/desktop/src/todos/TodoSidebar.tsx`）最终项如下：

1. 导出
2. 重命名
3. （分隔线）
4. 标签删除（原「删除」，功能不变）
5. 归档删除（destructive）

### 4.2 归档删除流程

```
右键标签 → 归档删除
  → 前端本地预检（用 overview 数据）：
      有 in_progress 待办 → toast「当前标签存在未完成待办，无法归档删除。」，结束
      否则 → 打开确认弹窗
  → 确认弹窗：标题「归档删除标签“{name}”？」，描述「将删除该标签及其下所有待办任务，此操作不可撤销。」
  → 确认 → invoke('archive_delete_todo_tag', { id })
  → 成功：关闭弹窗 + invalidate + toast（复用 deleteTagMutation 成功后的静默刷新，不额外弹成功 toast）
  → 失败：弹窗内展示后端错误（如并发下仍有未完成待办）
```

### 4.3 文案

| 位置 | 文案 |
| --- | --- |
| 菜单项（原删除） | 标签删除 |
| 菜单项（新） | 归档删除 |
| 预检阻断 toast | 当前标签存在未完成待办，无法归档删除。 |
| 归档确认弹窗标题 | 归档删除标签“{name}”？ |
| 归档确认弹窗描述 | 将删除该标签及其下所有待办任务，此操作不可撤销。 |
| 归档确认按钮 | 归档删除 |

「标签删除」弹窗标题/描述/确认按钮维持现状（「删除标签“{name}”？ / 只会删除标签及其任务关联，不会删除任何任务。 / 删除标签」）。

## 5. 技术方案

### 5.1 后端

**`error.rs`** 新增：

```rust
pub fn todo_tag_has_active_todos() -> Self {
    Self::new(
        "todo_tag_has_active_todos",
        "当前标签存在未完成待办，无法归档删除。",
        None,
    )
}
```

**`repository.rs`** 新增 `archive_delete_tag(&self, id: i64) -> AppResult<()>`，单事务：

1. 校验标签存在，不存在返回 `todo_tag_not_found`；
2. 检查是否有关联的 `in_progress` 待办：
   ```sql
   SELECT EXISTS(
     SELECT 1 FROM todo_tag_relations rel
     JOIN todos t ON t.id = rel.todo_id
     WHERE rel.tag_id = ?1 AND t.status = 'in_progress'
   )
   ```
   存在则返回 `todo_tag_has_active_todos()`；
3. 删除该标签的所有待办：
   ```sql
   DELETE FROM todos
   WHERE id IN (SELECT todo_id FROM todo_tag_relations WHERE tag_id = ?1)
   ```
   （`todos` 删除级联清空 `todo_tag_relations`，被删待办关联的其他标签不受影响）；
4. 删除标签本身 `DELETE FROM todo_tags WHERE id = ?1`；
5. `commit`。

事务内部出错自动回滚，保证不出现"删了标签但留下待办"或半删状态。

**`service.rs`** 新增 `archive_delete_tag`，通过 `changed()` 触发 `todos-changed`（删除属于写操作）。

**`commands.rs` / `main.rs`** 新增并注册：

```rust
#[tauri::command]
pub fn archive_delete_todo_tag(service: State<'_, SharedTodoService>, id: i64) -> AppResult<()> {
    service.archive_delete_tag(id)
}
```

### 5.2 前端

- `apps/desktop/src/lib/invoke.ts`：`invokeArchiveDeleteTodoTag(id)`。
- `apps/desktop/src/todos/todos.api.ts`：`archiveDeleteTodoTagApi(id)`。
- `apps/desktop/src/todos/TodoSidebar.tsx`：
  - `TodoSidebarProps` 新增 `onArchiveDeleteTag: (tag: TodoTag) => void`；
  - 「删除」→「标签删除」；
  - 新增「归档删除」菜单项（`Archive` 图标，destructive，与「标签删除」的 `Trash2` 区分，降低误点）。
- `apps/desktop/src/todos/TodoPage.tsx`：
  - 新增 `archiveDeleteMutation`（`onError: reportError`）；
  - `handleArchiveDeleteTag(tag)`：
    - 预检：`overview.data?.items.some(item => item.status === 'in_progress' && item.tags 含 tag.name)`；
      - 阻断：`toast.add({ title: '当前标签存在未完成待办，无法归档删除。', type: 'error' })`，直接返回；
      - 放行：打开归档删除确认弹窗；
    - 确认后 `archiveDeleteTodoTagApi(id)`，成功 invalidate，失败在弹窗内展示；
  - 预检依赖的 `overview` 查询为全量待办，已存在（用于侧栏计数），无额外请求；数据未加载时跳过预检，直接放行交给后端兜底。
- `apps/desktop/src/todos/TodoTagDialogs.tsx`：新增第二个 `ConfirmDeleteDialog`（`archiveDeleting` 状态），标题/描述/按钮见 4.3，`error` 用 `archiveDeleteError`。

## 6. 涉及文件清单

| 变更类型 | 文件 | 说明 |
| --- | --- | --- |
| 修改 | `apps/desktop/src-tauri/src/error.rs` | 新增 `todo_tag_has_active_todos` |
| 修改 | `apps/desktop/src-tauri/src/todos/repository.rs` | 新增 `archive_delete_tag` |
| 修改 | `apps/desktop/src-tauri/src/todos/service.rs` | 新增 `archive_delete_tag` |
| 修改 | `apps/desktop/src-tauri/src/commands.rs` | 新增 `archive_delete_todo_tag` command |
| 修改 | `apps/desktop/src-tauri/src/main.rs` | 注册 command |
| 修改 | `apps/desktop/src/lib/invoke.ts` | 新增 `invokeArchiveDeleteTodoTag` |
| 修改 | `apps/desktop/src/todos/todos.api.ts` | 新增 `archiveDeleteTodoTagApi` |
| 修改 | `apps/desktop/src/todos/TodoSidebar.tsx` | 改名 + 新增菜单项 |
| 修改 | `apps/desktop/src/todos/TodoPage.tsx` | 归档删除逻辑与预检 |
| 修改 | `apps/desktop/src/todos/TodoTagDialogs.tsx` | 新增归档删除确认弹窗 |
| 测试 | `apps/desktop/src-tauri/tests/todos.rs` | 后端归档删除测试 |
| 测试 | `apps/desktop/src/todos/TodoPage.test.tsx` | 前端测试 |

## 7. 测试计划

### 7.1 后端（`tests/todos.rs`）

- 归档删除成功：标签下含已完成/已取消/已挂起待办 → 标签被删、待办全被删、关联表清空、其他标签及其待办保留。
- 存在 `in_progress` 待办：返回 `todo_tag_has_active_todos`，且标签、待办、关联均未被删除。
- 标签不存在：返回 `todo_tag_not_found`。

### 7.2 前端（`TodoPage.test.tsx`）

- 右键菜单出现「标签删除」「归档删除」两项。
- 预检阻断：标签存在 `in_progress` 待办 → 点击归档删除 toast 提示且不打开弹窗、不调用 API。
- 放行：无未完成待办 → 点击后打开确认弹窗，确认后调用 `archiveDeleteTodoTagApi`。
- 失败：API 报错 → 弹窗内展示错误信息。

## 8. 边界与异常

- 预检数据未加载时放行，由后端事务内校验兜底，避免误拦。
- 并发/陈旧数据下后端校验失败 → 弹窗内展示「归档删除失败：当前标签存在未完成待办，无法归档删除。」。
- 多标签待办：只要关联被归档标签即被删除，其关联的其他标签正常保留。
- 删除为写操作，成功后触发 `todos-changed` 刷新所有待办查询。
