# App 快捷键统一管理 TODO

## 目标

- 使用 `@tanstack/react-hotkeys` 统一管理 App 自定义快捷键。
- 保留 CodeMirror 内部默认键位，不将编辑器键位纳入本次改造。
- 增加全局工作区切换：`Mod+1` 书签、`Mod+2` 笔记、`Mod+3` Todo。
- 增加书签页单键操作：`/`、`j`、`k`、`p`、`x`、`o`。
- 文本输入或编辑期间不响应书签页单键，避免影响正常输入。

其中 `Mod` 在 macOS 为 `Command`，在 Windows/Linux 为 `Control`。

## 已确认的交互规则

| 快捷键  | 作用域   | 行为                         | 启用条件                                                    |
| ------- | -------- | ---------------------------- | ----------------------------------------------------------- |
| `Mod+1` | App 全局 | 打开书签工作区               | App 已挂载                                                  |
| `Mod+2` | App 全局 | 打开笔记工作区               | App 已挂载                                                  |
| `Mod+3` | App 全局 | 打开 Todo 工作区             | App 已挂载                                                  |
| `/`     | 书签页   | 聚焦并全选书签搜索框         | 不在文本输入/编辑状态，且无业务模态框打开                   |
| `j`     | 书签页   | 高亮下一条书签               | 不在文本输入/编辑状态，有书签结果，且无业务模态框或预览打开 |
| `k`     | 书签页   | 高亮上一条书签               | 不在文本输入/编辑状态，有书签结果，且无业务模态框或预览打开 |
| `p`     | 书签页   | 预览当前高亮书签             | 有当前书签，不在文本输入/编辑状态，且预览未打开             |
| `x`     | 书签页   | 关闭网页预览                 | 仅网页预览打开时                                            |
| `o`     | 书签页   | 在系统浏览器打开当前高亮书签 | 有当前书签，不在文本输入/编辑状态，且无业务模态框或预览打开 |

补充规则：

- `Mod+1/2/3` 不是单键输入，即使输入框获得焦点也继续生效。
- 单键输入保护覆盖 `input`、`textarea`、`select` 和 `contentEditable`。
- 新增、编辑、删除等业务模态框打开时，暂停书签页单键，避免快捷键穿透。
- 网页预览打开后暂停 `/`、`j`、`k`、`p`、`o`，仅保留 `x` 关闭预览；现有 `Escape` 关闭能力保持不变。
- `j/k` 允许长按连续移动；`p/x/o` 使用一次按压一次触发，避免长按重复执行。
- 快捷键匹配使用物理输入产生的普通字符，不区分大小写，但带 `Shift`、`Alt`、`Ctrl/Meta` 的单键组合不应误触发。

## 状态模型

### 当前书签

在 `BookmarkView` 中新增 `activeBookmarkId: number | null`，表示键盘操作的当前书签。它与 `selectedTags` 完全独立：

- 标签只负责筛选结果。
- 当前书签只负责 `j/k/p/o` 的操作目标和视觉高亮。
- 首批结果加载成功后，默认高亮第一条书签。
- 查询、标签或“全部/星标”视图变化后：当前书签仍存在则保留，否则高亮新结果第一条；没有结果则清空。
- 后续分页追加结果时保留当前书签，不重置到第一条。

### Hover 与当前书签样式

| 状态               | 样式                                         |
| ------------------ | -------------------------------------------- |
| 普通               | 透明背景                                     |
| Hover              | `hover:bg-accent/40 dark:hover:bg-accent/50` |
| 当前书签           | `bg-accent`，沿用现在的 Hover 强度           |
| 当前书签同时 Hover | 保持 `bg-accent`，不再叠加变化               |

- Hover 不修改 `activeBookmarkId`。
- 鼠标可以停在 A，同时键盘当前项为 B；A 显示浅色，B 显示完整 `accent`。
- 点击书签行时先将该书签设为当前项，再执行现有预览行为。
- 当前书签行增加可访问性状态，例如 `aria-current="true"`。

## 实施 TODO

### 1. 引入快捷键依赖

- [x] 在 `apps/desktop/package.json` 增加 `@tanstack/react-hotkeys`。
- [x] 更新根目录 pnpm lockfile。
- [x] 不单独安装 `@tanstack/hotkeys`，React 适配包已经导出核心能力。
- [x] 不引入全局快捷键 Store；快捷键状态继续由最接近的页面组件持有。

验证：依赖安装后 TypeScript 能解析 `useHotkey` / `useHotkeys`，现有构建不受影响。

### 2. 增加 App 全局工作区快捷键

修改 `apps/desktop/src/Layout.tsx`：

- [x] 使用 `useHotkeys` 注册 `Mod+1`、`Mod+2`、`Mod+3`。
- [x] 分别调用现有 `setCurrentPath(PATHS.BOOKMARKS/NOTES/TODOS)`。
- [x] 快捷键重复切换到当前工作区时保持幂等，不额外重置页面状态。
- [x] 为注册项添加名称和说明元数据，便于后续生成快捷键帮助界面。

修改/新增测试：

- [x] 新增 `apps/desktop/src/Layout.test.tsx`，验证三组快捷键切换到正确工作区。
- [x] 验证 macOS `Meta` 与非 macOS `Control` 的 `Mod` 映射。
- [x] 验证输入框获得焦点时 `Mod+1/2/3` 仍然可用。
- [x] 验证卸载后注册被清理，不残留重复监听器。

### 3. 迁移现有笔记快捷键

修改 `apps/desktop/src/notes/NoteEditor.tsx`：

- [x] 将手写 `document.addEventListener('keydown', ...)` 替换为 `useHotkey` 或 `useHotkeys`。
- [x] 使用 `Mod+E` 切换预览/编辑模式。
- [x] 使用 `Mod+S` 在编辑模式保存。
- [x] 保留现有的加载状态、编辑器就绪状态、保存中状态和重复切换保护。
- [x] 保持 `Shift` / `Alt` 修饰时不触发。
- [x] 保留当前按钮提示中的平台化快捷键文案。

修改测试：

- [x] 调整 `apps/desktop/src/notes/NoteEditor.test.tsx` 的快捷键测试以适配 TanStack 注册机制。
- [x] 继续覆盖模式切换、仅编辑模式保存、修饰键忽略、切换合并和卸载清理。

### 4. 暴露书签搜索框焦点能力

修改 `apps/desktop/src/bookmarks/SearchBar.tsx`：

- [x] 为通用 `Input` 补充原生 input ref 转发，避免通过 DOM 选择器定位搜索框。
- [x] 使用 `forwardRef` 或显式 `inputRef` 属性暴露内部输入框。
- [x] `/` 触发时调用 `focus()` 和 `select()`。
- [x] 移除搜索框现有的 `autoFocus`，避免进入书签页后单键导航默认被输入焦点屏蔽。
- [x] 不改变现有 Enter 搜索、空值 blur 清空搜索的行为。
- [x] 搜索框已聚焦时输入 `/` 应作为正常搜索字符，不被快捷键拦截。

修改测试：

- [x] 验证外部 ref 能聚焦并选中搜索内容。
- [x] 验证搜索框内输入 `/ j k p x o` 不触发页面快捷键。

### 5. 建立书签当前项和行引用

修改 `apps/desktop/src/bookmarks/BookmarkView.tsx`：

- [x] 新增 `activeBookmarkId` 状态。
- [x] 根据当前已加载 `bookmarks` 派生 `activeBookmark` 和索引。
- [x] 实现结果变化时的保留、回退第一条和空结果清理规则。
- [x] 保存书签搜索框 ref。
- [x] 保存当前书签行元素 ref，供滚动、预览触发和关闭预览后的焦点恢复使用。
- [x] 集中封装“在浏览器打开并记录访问次数”，供鼠标和 `o` 共用。
- [x] 继续复用现有 HTTP(S) 网页预览与非 HTTP 协议外部打开逻辑。

修改 `apps/desktop/src/bookmarks/ResultList.tsx`：

- [x] 增加 `activeBookmarkId`、`onActiveBookmarkChange` 等必要 props。
- [x] 为每个书签行登记 DOM ref；避免通过文本或通用 DOM 选择器定位。
- [x] 当前项变化后执行 `scrollIntoView({ block: 'nearest' })`。
- [x] 鼠标点击行时先更新当前项，再打开预览。
- [x] Hover 使用浅色背景，当前项使用完整 `bg-accent`。
- [x] 增加 `aria-current` 等当前项语义。
- [x] 将现有鼠标“打开链接并记录访问次数”逻辑提升复用，避免快捷键路径漏记或重复记访问。

### 6. 注册书签页单键快捷键

修改 `apps/desktop/src/bookmarks/BookmarkView.tsx`：

- [x] 注册 `/`、`j`、`k`、`p`、`x`、`o`。
- [x] 所有单键显式配置输入元素忽略规则。
- [x] 根据结果、当前书签、预览和业务模态框状态设置 `enabled`。
- [x] `j` 在末项时保持末项，`k` 在首项时保持首项，不循环跳转。
- [x] `p` 使用当前书签行作为 preview trigger，复用现有焦点恢复行为。
- [x] `x` 调用统一的预览关闭入口。
- [x] `o` 复用统一的外部打开及访问记录函数。
- [x] `p/x/o` 开启按键重置保护；`j/k` 保持可连续触发。
- [x] 给每项快捷键补充名称、说明和作用域元数据。

### 7. 处理模态框和焦点边界

- [x] 将新增书签、编辑书签、删除确认等打开状态汇总为书签单键的禁用条件；如状态仍在子组件，增加最小必要的打开状态回调，不引入全局 Store。
- [x] 网页预览打开时仅允许 `x`；预览内 iframe、按钮或其他焦点位置不应触发其余书签单键。
- [x] 关闭预览后恢复到当前书签行；若该书签已不在结果中，则不恢复失效元素焦点。
- [x] 从书签页切换到笔记或 Todo 后，书签页快捷键随组件卸载自动注销。
- [x] CodeMirror 获得焦点时，书签页本身已卸载；编辑器默认键位继续由 CodeMirror 处理。

### 8. 测试与验收

修改 `apps/desktop/src/bookmarks/BookmarkView.test.tsx`：

- [x] `/` 聚焦并选中搜索框。
- [x] `j/k` 正确移动当前书签，且在首尾不越界。
- [x] 初始、筛选变化、空结果和分页追加时当前项符合状态规则。
- [x] `p` 预览当前书签，`x` 关闭预览，`o` 外部打开当前书签。
- [x] `p/o` 只执行一次访问记录。
- [x] 输入框或可编辑区域聚焦时，六个单键均不响应。
- [x] 业务模态框打开时单键不穿透。
- [x] 预览打开时除 `x` 外的单键均不响应。

修改 `apps/desktop/src/bookmarks/ResultList.test.tsx`：

- [x] 当前书签使用完整 `bg-accent`，普通行使用浅色 Hover。
- [x] Hover 不改变当前书签。
- [x] 点击行同时更新当前项并预览。
- [x] 当前项变化时滚动到可视区域。
- [x] 当前项具备正确的可访问性属性。

最终验证：

- [x] 运行桌面端相关 Vitest 测试。
- [x] 运行桌面端 TypeScript/Vite build。
- [x] 运行格式检查和 `git diff --check`。
- [ ] 在 macOS Tauri 窗口手动验证 `Command+1/2/3`、输入焦点保护、长按 `j/k`、预览焦点恢复和明暗主题样式。

## 预计修改文件

- `apps/desktop/package.json`
- `pnpm-lock.yaml`
- `apps/desktop/src/Layout.tsx`
- `apps/desktop/src/Layout.test.tsx`（新增）
- `apps/desktop/src/components/ui/input.tsx`
- `apps/desktop/src/notes/NoteEditor.tsx`
- `apps/desktop/src/notes/NoteEditor.test.tsx`
- `apps/desktop/src/bookmarks/BookmarkView.tsx`
- `apps/desktop/src/bookmarks/BookmarkView.test.tsx`
- `apps/desktop/src/bookmarks/SearchBar.tsx`
- `apps/desktop/src/bookmarks/SearchBar.test.tsx`（如焦点 ref 测试不并入 BookmarkView）
- `apps/desktop/src/bookmarks/ResultList.tsx`
- `apps/desktop/src/bookmarks/ResultList.test.tsx`
- `docs/features/2026-08-12-app-hotkeys.md`

## 非本次范围

- 不修改 CodeMirror 的 `defaultKeymap`、`historyKeymap`、`searchKeymap` 和 `indentWithTab`。
- 不实现用户自定义快捷键设置页面。
- 不新增全局快捷键 Store、命令总线或快捷键帮助弹窗。
- 不注册 Tauri 系统级全局快捷键；所有快捷键仅在 App 窗口内生效。
