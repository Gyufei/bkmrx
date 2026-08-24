# Todo Markdown 导出功能设计

## 1. 背景与目标

Todo 页面目前只支持本机管理，缺少对外归档能力。本需求新增"导出当前分类待办为 Markdown 文档"功能，便于用户把某分类下的待办以轻量文本形式归档到本地。

导出功能放在分类标签的右键菜单中，一次导出该分类下**全部状态**的待办，每行一条，保持 Markdown 任务列表语法。文件通过系统保存对话框选择位置，数据写入本地。

## 2. 目标

1. 在分类标签右键菜单中提供"导出"动作。
2. 一键导出该分类下全部状态的待办为 `.md` 文档。
3. 文档每行一条待办，按状态使用对应 Markdown 语法渲染。
4. 文件名固定为 `当前日期-待办-标签名称.md`，日期取本地时区。
5. 复用现有 Tauri command / Rust service-repository / SQLite 分层与书签导出的原子写模式。

## 3. 非目标

- 不做"所有任务"（全部分类）的导出入口，本期仅支持分类标签右键导出；文件名逻辑保留 `全部` 兜底以便未来扩展。
- 不导出描述、高优先级、标签、创建时间等附加信息。
- 不做导出内容自定义、模板选择或预览。
- 不做批量导出、多标签合并导出。
- 不改变现有数据，导出为只读操作。

## 4. 交互与入口

### 4.1 入口位置

- 右侧点击分类标签弹出右键菜单（`apps/desktop/src/todos/TodoSidebar.tsx`）。
- 菜单新增"导出"项，置于"重命名"上方，图标使用 Lucide `FileDown`。
- 点击后打开系统保存对话框，确认后触发导出。

### 4.2 保存对话框

复用 `@tauri-apps/plugin-dialog` 的 `save()`（该插件已注册，`dialog:allow-save` 已授权，与书签导出、RSS 图片保存一致）：

- `defaultPath`：`{YYYY-MM-DD}-待办-{tag.name}.md`，例如 `2026-08-24-待办-工作.md`。
- `filters`：`[{ name: 'Markdown', extensions: ['md'] }]`。
- 用户取消时静默返回，不执行任何操作。

### 4.3 结果反馈

- 成功：`toast.add({ type: 'success', title: '导出成功', description: <保存路径> })`。
- 失败：复用 `reportError` 的 toast 错误提示。

## 5. 导出文件规格

### 5.1 文件名

```
{YYYY-MM-DD}-待办-{标签名}.md
```

- 日期为导出当天，本地时区，格式 `YYYY-MM-DD`。
- 标签名为当前导出分类的名称；若未来支持全部分类导出，标签名使用 `全部`。

### 5.2 内容格式

文档不含标题行，内容即待办列表，每行一条，以换行符结尾：

| 状态 | 渲染格式 | 示例 |
| --- | --- | --- |
| `in_progress` 进行中 | `- [ ] {title}` | `- [ ] 准备周报` |
| `completed` 已完成 | `- [x] {title} ✅ {YYYY-MM-DD}` | `- [x] 提交 PR ✅ 2026-07-29` |
| `suspended` 已挂起 | `已挂起: {title}` | `已挂起: 申请报销` |
| `canceled` 已取消 | `已取消: ~~{title}~~` | `已取消: ~~临时需求~~` |

说明：

- 已完成行的日期取 `completed_at`（进入完成状态的时间），按本地时区格式化为 `YYYY-MM-DD`。
- 标题中的换行替换为空格，保证一行一条。
- 组与组之间不加空行（与示例一致）。

### 5.3 排序

导出顺序直接复用仓库查询顺序，与界面列表一致：

```
进行中(in_progress) → 已挂起(suspended) → 已完成(completed) → 已取消(canceled)
```

排序规则由 `repository.query` 的 SQL 保证：

1. 按状态分组（进行中 → 已挂起 → 已完成 → 已取消）；
2. 组内高优先级优先（`is_high_priority DESC`）；
3. 再按时间倒序（进行中按 `created_at`、已完成按 `completed_at`、其余按 `updated_at`）；
4. 最后按 `id DESC` 保证稳定。

导出层不再重新排序，避免与界面顺序不一致。

## 6. 技术方案

### 6.1 整体流程

```
前端右键菜单"导出"
  → save() 保存对话框得到目标路径
  → invoke('export_todos', { path, tag_id })
  → Rust service 查询该标签全部状态待办
  → 生成 Markdown 文本
  → 原子写入目标路径（临时文件 + rename）
  → 返回实际写入路径
  → 前端 toast 成功并展示路径
```

### 6.2 后端

- **新增共享模块** `apps/desktop/src-tauri/src/fsutil.rs`：`write_atomically(destination, bytes)` 统一原子写（`create_dir_all` + `.tmp` 临时文件 + `sync_all` + `fs::rename` + 失败清理），供 `bookmarks/transfer.rs` 与 `todos/transfer.rs` 复用。
- **新增模块** `apps/desktop/src-tauri/src/todos/transfer.rs`：接收 `Vec<Todo>` 做 Markdown 渲染（不排序，顺序由查询保证），通过 `fsutil::write_atomically` 写入目标路径，导出为空标签时仍正常生成空列表文件。
- **`TodoService::export_todos(destination, tag_id)`**：后端强制全量导出，在 service 内构造 `TodoQuery { status: None, tag_id }` 调用 `repository.query`，前端无需传 `status`。
- **新增 command** `commands.rs`：
  ```rust
  #[tauri::command]
  pub fn export_todos(
      service: State<'_, SharedTodoService>,
      path: String,
      tag_id: Option<i64>,
  ) -> AppResult<String> {
      service.export_todos(path, tag_id)
  }
  ```
  返回实际写入路径（`PathBuf` 转字符串），并在 `main.rs` 的 `generate_handler!` 中注册。
- **参数**：command 只接收 `tag_id`，导出范围固定为全部状态。

### 6.3 前端

- `apps/desktop/src/lib/invoke.ts`：新增
  ```ts
  export function invokeExportTodos(path: string, tagId: number): Promise<string> {
    return invoke<string>('export_todos', { path, tagId });
  }
  ```
- `apps/desktop/src/todos/todos.api.ts`：新增 `exportTodosApi(path, tagId)`。
- `apps/desktop/src/todos/TodoSidebar.tsx`：
  - `TodoSidebarProps` 新增 `onExportTag: (tag: TodoTag) => void`；
  - 标签右键菜单新增"导出"项（`FileDown` 图标），置于"重命名"上方。
- `apps/desktop/src/todos/TodoPage.tsx`：
  - 新增 `exportMutation`（`useMutation`，`onError: reportError`）；
  - `handleExportTag(tag)`：构造 `defaultPath` → `save()` → `mutateAsync({ path, tagId: tag.id })` → 成功 toast 展示路径；
  - 将 `onExportTag` 传入 `TodoSidebar`。

### 6.4 本地日期工具

前端无日期库。新增文件局部 helper（不新增依赖）：

```ts
function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

后端 Markdown 中已完成日期同样用 Rust `chrono::Local` 按 `%Y-%m-%d` 格式化 `completed_at`（毫秒时间戳转本地时区）。

## 7. 涉及文件清单

| 变更类型 | 文件 | 说明 |
| --- | --- | --- |
| 新增 | `apps/desktop/src-tauri/src/fsutil.rs` | 共享原子写 `write_atomically` |
| 新增 | `apps/desktop/src-tauri/src/todos/transfer.rs` | Markdown 生成与写入 |
| 修改 | `apps/desktop/src-tauri/src/lib.rs` | 注册 `fsutil` 模块 |
| 修改 | `apps/desktop/src-tauri/src/bookmarks/transfer.rs` | 改用共享 `fsutil::write_atomically` |
| 修改 | `apps/desktop/src-tauri/src/todos/mod.rs` | 导出 `transfer` 模块 |
| 修改 | `apps/desktop/src-tauri/src/todos/service.rs` | 新增 `export_todos`（强制全量导出） |
| 修改 | `apps/desktop/src-tauri/src/commands.rs` | 新增 `export_todos` command |
| 修改 | `apps/desktop/src-tauri/src/main.rs` | 注册 command |
| 修改 | `apps/desktop/src/lib/invoke.ts` | 新增 `invokeExportTodos` |
| 修改 | `apps/desktop/src/todos/todos.api.ts` | 新增 `exportTodosApi` |
| 修改 | `apps/desktop/src/todos/TodoSidebar.tsx` | 右键菜单新增"导出" |
| 修改 | `apps/desktop/src/todos/TodoPage.tsx` | 导出 mutation 与处理逻辑 |
| 测试 | `apps/desktop/src-tauri/tests/todos.rs` | 后端导出测试 |
| 测试 | `apps/desktop/src/todos/TodoPage.test.tsx` | 前端入口测试 |

## 8. 测试计划

### 8.1 后端

- 导出一个含四种状态待办的标签，断言文件内容与 5.2 表格逐行一致（含 `✅` 日期）。
- 导出空标签：文件生成成功，内容为空列表。
- 已完成待办 `completed_at` 为空（异常数据）时日期兜底：不输出 `✅` 后缀。
- 标题含换行：折行替换为空格，每行一条。
- 组内排序：同状态下高优先级排在前面。
- 原子写：目标路径为已存在目录时写入失败，且不残留 `.tmp` 文件。

### 8.2 前端

- 右键菜单出现"导出"项。
- 点击"导出"调用 `save()`（mock `@tauri-apps/plugin-dialog`），取消时不触发导出。
- 确认路径后调用 `invokeExportTodos` 并展示成功 toast；失败时展示错误 toast。

## 9. 边界与异常

- 用户取消保存对话框：静默返回，不弹任何提示。
- 目标路径无父目录或不可写：后端返回错误，前端 toast 展示错误信息。
- 导出期间重复点击：`exportMutation.isPending` 期间忽略再次触发，避免并发写入。
- 标题包含换行：折行替换为空格，保证每行一条。
- 导出不触发 `todos-changed` 事件（只读操作，不调用 `changed()`）。
