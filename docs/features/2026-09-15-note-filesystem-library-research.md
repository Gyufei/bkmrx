# 笔记目录扫描与系统打开能力调研

调研日期：2026-09-15。范围限定为：递归扫描目录（同时保留目录与多种文件）、同级节点按名称稳定排序、文件系统监听，以及用系统默认应用打开非 Markdown 文件。依据仅使用 Rust/Tauri 官方文档或 crate 自身文档；未修改应用代码。

## 结论

推荐组合是 **`walkdir`（初始扫描）+ 现有 `notify`（增量监听）+ Tauri 官方 `tauri-plugin-opener`（系统打开）**。

- `walkdir` 是最贴合当前需求的通用递归遍历库：跨平台、默认不跟随符号链接、可限制深度/打开的文件描述符、可跳过目录，并能在每个目录内按文件名排序。它会同时产出目录和文件，因此可以保留空目录，不必再从 Markdown 路径反推目录。[walkdir crate](https://docs.rs/walkdir/latest/walkdir/) [WalkDir API](https://docs.rs/walkdir/latest/walkdir/struct.WalkDir.html)
- 继续使用仓库已有的 `notify = 8.2.0`。`RecommendedWatcher` 会选择平台推荐实现，`RecursiveMode::Recursive` 会覆盖现有及随后创建的子目录；没有必要仅因扩展文件类型而替换 watcher。[notify crate](https://docs.rs/notify/latest/notify/) [Watcher API](https://docs.rs/notify/latest/notify/trait.Watcher.html) [RecursiveMode](https://docs.rs/notify/latest/notify/enum.RecursiveMode.html)
- 添加 Tauri 官方 `tauri-plugin-opener`，用 `openPath` / Rust `open_path` 调系统默认程序。它直接面向 Tauri 2，支持 Windows、Linux、macOS，并带 capability/路径 scope；比复用 shell 插件或自己启动 `open`、`start`、`xdg-open` 更容易收紧前端权限。[Tauri Opener](https://v2.tauri.app/plugin/opener/)
- 排序不应依赖全局遍历顺序。扫描后对**每个目录节点的直属 children**排序，明确规则为“文件夹在前、文件在后；组内按名称；名称相等时用原始文件名或相对路径作 tie-breaker”。Rust slice 的 `sort_by_key` 是稳定排序；不过显式 tie-breaker 能让大小写折叠后仍跨平台确定。[Rust slice sorting](https://doc.rust-lang.org/std/primitive.slice.html#method.sort_by_key)

## 库选型比较

| 方案 | 能力与适配度 | 建议 |
| --- | --- | --- |
| `std::fs::read_dir` | 零依赖，能读取直属目录项，但递归、错误上下文、符号链接策略、资源控制均需自行实现；官方明确返回顺序由平台/文件系统决定，要求可重复顺序时必须显式排序。[std::fs::read_dir](https://doc.rust-lang.org/std/fs/fn.read_dir.html) | 小实现可用；当前已有手写递归，若重构为正式文件树，`walkdir` 可减少自维护边界代码。 |
| `walkdir` | 单线程深度优先遍历；目录先于内容；同级可 `sort_by_file_name`；错误作为迭代项返回且遍历可继续；默认不跟随符号链接，开启时能报告链接环。[WalkDir API](https://docs.rs/walkdir/latest/walkdir/struct.WalkDir.html) | **首选**。成熟、能力刚好、额外复杂度低。 |
| `ignore` | 基于递归 walker 增加 `.ignore`、`.gitignore`、全局 gitignore、glob/type 过滤和并行扫描；这些标准忽略规则默认开启。[ignore WalkBuilder](https://docs.rs/ignore/latest/ignore/struct.WalkBuilder.html) | 不推荐作为默认。笔记库不是代码搜索：用户通常期待磁盘里存在的文件可见，默认套用 gitignore/隐藏文件语义容易再次产生“扫描不像文件管理器”的意外。只有明确产品化“忽略规则”时再选。 |
| `jwalk` | 用 Rayon 并行读取目录，可按目录文件名排序，也提供深度与符号链接选项；默认跳过隐藏项。[jwalk source/API](https://docs.rs/jwalk/latest/jwalk/struct.WalkDirGeneric.html) | 当前过度设计。大目录基准证明串行扫描不足后再考虑；并行结果汇聚、错误顺序和依赖成本更高。 |
| `notify` | 跨平台事件监听；推荐 watcher 使用平台最佳实现，也提供 polling 后端。[notify crate](https://docs.rs/notify/latest/notify/) | **保留**。将事件过滤从“仅 `.md`”调整为“目录事件 + 支持展示的文件事件”，并在复杂 rename/事件丢失时触发有界重扫。 |
| `open` | `open::that` 用系统配置的默认程序打开路径/URL，返回 `io::Result`；文档提示部分平台 launcher 仍可能阻塞。[open crate](https://docs.rs/open/latest/open/) [open::that](https://docs.rs/open/latest/open/fn.that.html) | 纯 Rust 程序的合理选择；本项目已有 Tauri 权限体系，因此不优先。 |
| `opener` | 简单的跨平台 `opener::open`，用系统默认程序打开文件或链接。[opener crate](https://docs.rs/opener/latest/opener/) | 能完成任务，但相较 Tauri 官方插件没有现成 capability scope 集成。 |
| Tauri opener 插件 | JS/Rust 均能打开路径，默认危险命令被阻止，需显式授权且 path scope 支持 glob。[Tauri Opener](https://v2.tauri.app/plugin/opener/) | **首选**。替换当前为 `shell:allow-open` 暴露的泛化打开能力时，应只授予主窗口且限制到笔记根目录。动态用户目录的 scope 配置需在实施阶段验证。 |

## 建议的数据与扫描语义

扫描器应返回真实文件树，而不是只返回笔记后由前端反推文件夹：

```text
DirectoryNode { name, relative_path, children }
FileNode      { name, relative_path, extension, kind }
```

关键规则：

1. 遍历结果同时接收目录与普通文件，因而空目录也存在。
2. `kind` 至少区分 `markdown` 与 `external`；Markdown 保持应用内打开，其余普通文件走系统打开。无需对 HTML 做特殊扫描逻辑。
3. 文件夹选中后只读取该 `DirectoryNode.children` 中的直属 `FileNode`，不要再使用相对路径前缀匹配。二级目录中的文件只在选中二级目录时显示。
4. 对每个节点的 children 独立排序。是否大小写不敏感、数字是否自然排序（`2` 在 `10` 前）是产品规则，不是扫描库自动替产品决定的；首版可用 Unicode 小写键 + 原名/相对路径 tie-breaker。
5. 不跟随目录符号链接。若产品要显示符号链接本身，应将其建模为特殊叶节点；这能避免扫描逃出用户选择的笔记根目录。`walkdir` 默认不跟随链接，启用 follow-links 时虽会检测软链接环，但仍可能遍历根目录外部内容。[WalkDir links](https://docs.rs/walkdir/latest/walkdir/struct.WalkDir.html#method.follow_links)

## watcher 的实现影响

现有 `notify` 无需更换，但事件处理语义会扩大：

- 文件创建/删除/重命名需更新对应父目录的直属 children；目录创建/删除/重命名需更新树结构。
- 应将“可展示文件”与“可在应用内编辑的 Markdown”拆成两个判断，避免 watcher 再次丢掉 HTML 等外部文件。
- rename 事件在不同平台可能表现不同，批量移动也会形成事件风暴；稳妥做法是事件用于快速增量更新，无法可靠归类时对受影响子树或根目录重扫并替换快照。
- `notify` 官方说明网络挂载（如 NFS）可能不产生事件，可切换 `PollWatcher`；因此 watcher 不能被当作唯一真相，窗口重新激活或明确刷新时允许重扫。[notify known problems](https://docs.rs/notify/latest/notify/#known-problems)

## 系统打开的安全边界

“打开文件”是启动外部程序的敏感能力，必须将前端传来的路径视为不可信输入：

1. 前端只提交扫描结果的相对路径或节点 ID；Rust 端以当前笔记根目录拼接并校验，不接受任意绝对路径或 URL。
2. 在打开前拒绝不存在路径、目录（若需求只允许文件）和 Markdown（避免绕过应用内文档会话）；只允许已扫描到的普通文件。
3. 处理 `..` 与符号链接逃逸：词法 `strip_prefix` 不足以防链接指向根外。应对根和目标做 canonicalize 后验证目标仍位于 canonical root 内；同时维持“不跟随目录符号链接”的扫描策略。需注意 canonicalize 与实际打开之间仍有 TOCTOU 窗口，因此不要把该能力暴露给远程 WebView/不可信内容。
4. 不拼 shell 命令，不把文件名交给 `sh -c` / PowerShell 字符串；使用 Tauri opener 的路径参数，让路径作为数据传递。
5. capability 仅授予 `main` 窗口，并尽可能用 opener path scope 限制。Tauri 官方说明危险 opener 命令默认阻止，且 scope 使用 glob 指定允许路径。[Tauri Opener permissions](https://v2.tauri.app/plugin/opener/#permissions) Tauri capability 用于约束特定窗口/WebView 可用权限，多份 capability 会合并权限边界。[Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
6. OS 默认关联本身可能指向第三方程序；UI 应明确这是“使用系统应用打开”，并把失败转换为用户可理解的错误，不回显敏感绝对路径到遥测。

## 对本项目的落地建议

当前 `apps/desktop/src-tauri/Cargo.toml` 已有 `notify = 8.2.0` 和 `tauri-plugin-shell = 2`，当前 capability 有 `shell:allow-open`。建议实施时：

1. 引入 `walkdir = "2"`，让 Rust 扫描层产出目录/文件节点；若团队更看重零依赖，也可保留 `std::fs`，但数据模型和同级排序规则仍必须重构。
2. 保留 `notify`，集中定义一个供“初扫 + watcher”共同使用的节点分类函数；不要分别维护两套扩展名规则。
3. 引入 `tauri-plugin-opener`，使用专门的 open-path capability；评估并移除笔记场景不再需要的宽泛 `shell:allow-open`，避免权限叠加。
4. 不选择 `ignore` 或 `jwalk`，除非后续明确需要 gitignore 语义或基准显示串行扫描成为瓶颈。
5. 测试至少覆盖：空目录、大小写/同名排序键、非 UTF-8 文件名（Rust `OsStr` 边界）、无扩展名文件、HTML、隐藏项、权限拒绝目录、损坏符号链接、指向根外的链接、目录 rename、外部文件打开失败，以及“选择一级目录不包含二级目录文件”。

## 当前实现与影响评估

当前 Notes Workspace 的公开列表契约是 `NotesWorkspaceListing { revision, notes: NoteFile[] }`。Rust 扫描器只收集 `.md`，全局按笔记标题排序；前端再从 `relative_path` 反推文件夹，并用路径前缀筛选选中文件夹。它不是目录快照，因此三项需求会同时穿过后端模型、Tauri 边界、缓存、watcher 与三栏 UI，不能只改一个过滤条件。

| 层次 | 当前行为 | 必须调整 | 风险 |
| --- | --- | --- | --- |
| Rust model | 只有 `NoteFile` 和 `notes` | 增加真实目录与普通文件节点，并区分 `markdown` / `external` | 中：序列化契约变化会联动 TS 类型与测试 fixture |
| repository | 手写递归，只接收 `.md`，按标题全局排序 | 遍历目录与普通文件，保留空目录；对每级 children 排序 | 中：权限错误、非 UTF-8 名称、符号链接策略必须明确 |
| service / command | `list()` 返回扁平笔记；只有 Markdown 文档操作 | 返回目录快照；增加受 Notes Workspace 授权约束的外部打开入口 | 高：打开路径必须继续校验 Settings Revision、相对路径和 canonical root |
| watcher | 过滤掉所有非 `.md` 和目录事件；按单文件 patch 缓存 | 监听全部可展示节点和目录结构变化；复杂事件触发重扫 | 高：rename 的跨平台事件形态与事件风暴容易令树和磁盘不一致 |
| React Query hook | 缓存 `notes`，处理 `note-changed` / `note-removed` | 缓存 workspace tree；结构变化时 invalidation + 重扫 | 中：继续做细粒度 patch 会显著增加不可验证分支 |
| FolderTree | 从笔记路径派生文件夹，未独立排序 | 直接渲染目录节点；展开状态按相对目录路径保存 | 低 |
| NotesList | `startsWith(selectedFolder + "/")`，递归包含后代 | 只读取所选目录的直属文件；根目录读取根直属文件 | 低，但必须覆盖根目录与同名前缀目录测试 |
| NotesPanel | 所有列表项都进入 NoteEditor，并提供笔记重命名/删除 | Markdown 维持 Document Session；external 走系统打开；外部文件不进入编辑器 | 中：需要定义外部文件的选中态、错误提示和上下文菜单 |
| capability / bootstrap | 已加载 shell 插件并授予 `shell:allow-open` | 注册 opener 或加入后端打开 command，并收紧路径能力 | 中：shell open 仍被 RSS、书签和 Markdown 链接使用，不能未经迁移直接删除 |

预计直接涉及的生产文件：

- `apps/desktop/src-tauri/src/notes/{model,repository,service,watcher}.rs`
- `apps/desktop/src-tauri/src/commands.rs`、`apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/Cargo.toml`、`apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/types.ts`、`apps/desktop/src/lib/invoke.ts`
- `apps/desktop/src/notes/{notes.api,use-notes-workspace,NotesPanel,NotesSidebar,FolderTree,NotesList}.tsx/ts`
- 现有 `buildFolderTree.ts` 应在新契约稳定后删除，或者降为纯展示适配器，不能继续作为目录事实来源。

现有测试的主要缺口是：没有 `buildFolderTree` / `FolderTree` / `NotesList` 的独立行为测试；Rust 集成测试还明确断言 `.txt` 被忽略；前端 fixture 全是 Markdown。实施会至少修改 `apps/desktop/src-tauri/tests/notes.rs`、`NotesPanel.test.tsx`、`use-notes-workspace.test.tsx`，并新增扫描树、直属过滤和外部打开测试。

## 推荐目标契约

推荐让 Rust 返回一棵真实且已排序的目录树，而不是把排序与目录推导继续留给前端：

```text
WorkspaceDirectory {
  name,
  relative_path,       // 根目录为 ""
  directories: WorkspaceDirectory[],
  files: WorkspaceFile[]
}

WorkspaceFile {
  name,                // 含扩展名，用于 identity、搜索和稳定排序
  relative_path,
  kind: markdown | external
}
```

目录和文件分数组能直接表达“文件夹优先”，也让 NotesList 只消费当前节点的 `files`，不会误包含后代。若希望前端自由混排，可改成带 `kind` 的单一 `children`，但当前三栏 UI 没有这个需要。

排序建议首版定义为：每一级目录按 `name.to_lowercase()`，相等时按原始 `name`，再按 `relative_path`；文件同样排序。不要依赖 `read_dir` / watcher 到达顺序。自然数字排序和按 macOS Finder 本地化排序不在本次范围，后续可单独定义。

## 推荐交互语义

1. 未选择文件夹时表示 Notes Workspace 根目录，只列根目录直属文件，不再表示“所有笔记”。UI 应增加明确的“根目录”行，避免 `null = 全部` 的隐式语义。
2. 选择一级目录，只展示该节点的直属 `files`；二级目录文件只在选中二级目录后出现。
3. Markdown 点击前先 flush 当前 Document Session，再切换到应用内编辑器；列表隐藏扩展名并用 Markdown 类型图标标识。
4. external 点击只调用系统默认应用，不 flush 当前 Document Session，不改变当前 Markdown 的选中或编辑状态，也不挂载 NoteEditor。
5. external 首版只提供“系统打开”和“复制相对路径”。现有重命名、删除流程依赖 Markdown receipt 和 UTF-8 内容读取，不能直接复用；若要操作任意文件，应另立带路径授权和冲突策略的需求。
6. 新建笔记仍只创建 `.md`，本次“显示其他文件”不等于新增任意文件创建器。

## 已确认的产品决策

2026-09-15 第一轮确认：

1. 默认隐藏点文件和点目录，例如 `.git`、`.obsidian`、`.DS_Store`；本次不增加“显示隐藏项”开关。
2. 大小写不敏感地将 `.md` 和 `.markdown` 识别为 Markdown Document；其他普通文件均为 External File。
3. External File 首版只支持系统打开和复制相对路径，不支持重命名、删除或应用内预览。
4. UI 增加明确的 Notes Workspace 根目录节点并默认选中；根目录与子目录都只展示直属文件。
5. 打开 External File 与 Document Session 解耦：不 flush、不切换选中、不改变当前 Markdown 编辑状态。系统打开失败只报告该次打开错误。
6. watcher 重扫失败时保留上一次成功快照，显示错误和手动重试入口；事件合并防抖初值为 250ms。

2026-09-15 第二轮确认：

7. 保留当前文件夹交互习惯：单击文件夹行同时选中该目录，并切换其展开/收起状态；不把箭头拆成独立点击目标。
8. 根节点显示 Notes Workspace 的真实文件夹名称和 root/workspace 图标，不展示绝对路径。
9. 文件列表不展示扩展名；Markdown Document 和 External File 均显示去掉扩展名的名称，使用类型图标区分文件类型。
10. 当前目录被外部删除或重命名后，选择最近仍存在的父目录；若都不存在则回到根目录。Document Session 独立处理。
11. 任一子目录不可读时，本次扫描整体失败；已有界面保留上一次成功快照，首次加载则显示扫描失败。
12. 单击 External File 立即调用系统默认应用打开，不建立外部文件选中态。
13. 左侧目录栏标题固定为“笔记”，不显示全局数量；中间文件栏显示当前目录的“共 N 个文件”。

2026-09-15 第三轮确认：

14. 文件类型图标只区分 Markdown、HTML、JSON、JavaScript 和 Unknown；图标按扩展名选择，不读取文件内容或探测 MIME。
15. 隐藏扩展名后允许多个文件显示为同名；hover tooltip 与无障碍名称使用完整文件名来消除歧义。
16. 搜索仅覆盖当前目录直属文件，按包含隐藏扩展名的完整文件名进行大小写不敏感匹配；不搜索后代目录或文件内容。
17. 显示非隐藏空目录；只含隐藏项的普通目录在当前视图中也表现为空目录。
18. 已知可执行或启动器文件可以显示，但拒绝直接调用系统打开；文档和未知数据文件可以打开。
19. 从新的 Workspace File 契约移除未展示的 `modified` 和 `size` 字段。

2026-09-15 第四轮确认：

20. 可执行/启动器拒绝规则只按扩展名判断，不读取 Unix executable bit。Notes Workspace 是用户主动选择且内容可控的本地目录；普通 `.js`、`.json`、`.html` 仍允许交给系统默认应用打开。
21. watcher 忽略不会改变目录树的纯内容修改；Markdown 外部修改冲突继续由 Document Session receipt/fingerprint 负责。
22. 结构事件使用 trailing debounce：最后一个事件后安静 250ms 执行一次重扫，并设置约 2 秒最大等待。
23. External File 打开失败使用 NotesPanel 顶部 Alert，只显示文件显示名和可理解原因；不暴露绝对路径，也不改变列表或当前 Markdown 状态。
24. 根节点始终展开，一级文件夹默认展开，其余层级默认收起；手动展开集合在页面生命周期和 watcher 重扫间保留，目录消失时清理，不跨应用重启持久化。
25. 遇到无法无损表示为 UTF-8 的文件名时扫描整体失败，返回“不受支持的文件名”错误，不跳过也不使用替换字符生成 identity。

2026-09-15 第五轮确认：

26. 图标扩展名映射大小写不敏感：Markdown 为 `.md` / `.markdown`，HTML 为 `.html` / `.htm`，JSON 为 `.json`，JavaScript 为 `.js` / `.mjs` / `.cjs`，其余为 Unknown；`.jsx` 首版归 Unknown。
27. 重命名 Markdown Document 时保留原扩展名；新建笔记仍默认创建 `.md`。
28. 删除文件夹前由 Rust 完整预检所有后代。存在 UI 未展示的隐藏项或符号链接时不拒绝删除，但确认弹窗必须明确警告；用户确认后才递归删除。根节点不可删除。
29. `.app`、`.command`、`.exe`、`.com`、`.bat`、`.cmd`、`.msi`、`.ps1` 均拒绝从应用内系统打开，匹配大小写不敏感；它们仍可显示。
30. watcher 忽略隐藏文件、隐藏目录及其后代产生的事件。
31. 删除确认统计全部后代普通文件和子文件夹；若存在隐藏项或符号链接，另行显示未展示项目数量及警告。确认文案表达整个目录会被递归删除。

## 最终设计树

```text
Notes Workspace 文件浏览
├─ 扫描快照
│  ├─ walkdir 递归扫描，不跟随符号链接
│  ├─ 包含非隐藏普通目录和普通文件，保留空目录
│  ├─ 点文件、点目录及其后代不进入可见快照
│  ├─ 非 UTF-8 名称或任一不可读子目录使扫描整体失败
│  └─ 每级目录和文件按大小写不敏感名称 + 稳定 tie-breaker 排序
├─ Workspace Entry 分类
│  ├─ Markdown Document：.md / .markdown，应用内 Document Session
│  └─ External File：其余普通文件，系统默认应用打开
├─ 三栏交互
│  ├─ 左栏标题固定为“笔记”
│  ├─ 根节点显示真实 workspace 文件夹名，根始终展开
│  ├─ 单击文件夹同时选中并切换展开状态
│  ├─ 中栏只显示当前目录直属文件及“共 N 个文件”
│  ├─ 文件隐藏扩展名，以 Markdown / HTML / JSON / JavaScript / Unknown 图标区分
│  └─ 搜索只匹配当前目录直属文件的完整文件名，不搜索内容或后代
├─ 文件打开
│  ├─ Markdown 切换前遵守现有 Document Session flush 规则
│  ├─ External File 单击即打开，不 flush、不选中、不改变当前编辑状态
│  ├─ Rust 以 Settings Revision + 相对路径授权并限制在 canonical workspace 内
│  ├─ 已知可执行/启动器扩展名拒绝打开
│  └─ 失败显示顶部 Alert，不暴露绝对路径
├─ watcher 一致性
│  ├─ 只响应非隐藏路径的创建、删除、重命名和目录结构变化
│  ├─ 忽略纯内容修改和隐藏路径事件
│  ├─ trailing debounce 250ms，最大等待约 2s，然后全量重扫
│  └─ 重扫失败保留旧快照并提供手动重试
└─ 删除与重命名
   ├─ External File 首版不支持重命名或删除
   ├─ Markdown 重命名保留原扩展名，新建默认 .md
   ├─ 文件夹删除预检全部可见与未显示后代
   └─ 确认弹窗展示递归数量、隐藏项/符号链接警告；确认后整体删除
```

## 明确不在本次范围

- Finder 式自然/本地化排序、文件内容搜索、MIME 内容探测。
- External File 的应用内预览、重命名、删除或编辑。
- “显示隐藏项”开关、符号链接浏览、可执行权限位判断。
- 跨应用重启持久化目录展开状态。
- 针对超大 workspace 的并行扫描或增量树 patch；先以基准决定是否需要。

## 推荐实现顺序

### 阶段 1：先固定契约与扫描语义

- 在 Rust 添加目录/文件节点和 `kind`，用 `walkdir` 生成完整快照。
- 集中实现文件分类、相对 identity、同级排序和错误策略。
- 保持 `follow_links(false)`，目标路径仍以 canonical root 授权。
- 测试：空目录、嵌套目录、HTML/无扩展名文件、目录与文件排序、链接和权限错误。

验收：给定固定磁盘 fixture，返回树结构及顺序完全确定；根、一级、二级直属文件边界可直接由模型表达。

### 阶段 2：迁移前端目录与列表

- 将 React Query 数据从 `notes` 迁移为 workspace tree。
- FolderTree 直接消费 `directories`，移除从文件路径反推目录的逻辑。
- NotesList 只消费当前目录节点的 `files`，并按 `kind` 分派点击行为和菜单。
- 把原来的隐式“全部笔记”改为明确根目录选择。

验收：一级目录看不到二级文件；目录按名称稳定排序；HTML 出现在所属目录，点击不打开 NoteEditor。

### 阶段 3：安全接入系统打开

- 增加以 `Settings Revision + relative_path` 为输入的打开操作；Rust 端复用 `authorize_existing`，校验普通文件、非 Markdown、仍位于 canonical root。
- 通过 `tauri-plugin-opener` 打开已授权路径；错误映射为稳定错误码并在 UI 展示。
- 保留现有 shell 权限直到 RSS、书签和 Markdown 外链全部评估完；本次不顺手迁移无关功能。

验收：HTML 使用系统默认程序打开；绝对路径、`..`、目录、Markdown、根外符号链接和过期 Settings Revision 均被拒绝；失败不会产生未处理 Promise。

### 阶段 4：重做 watcher 的一致性策略

- watcher 不再按 `.md` 过滤；非隐藏目录和普通文件的 create/remove/rename 以及目录结构变化视为 workspace 变化，纯内容 modify 和隐藏路径事件忽略。
- 首版推荐事件合并后直接 invalidation + 全量重扫，而不是在前端递归 patch 树。等基准证明全量扫描过慢，再优化成受影响子树更新。
- 保留显式刷新，并为网络盘/事件缺失预留重新校准入口。

验收：外部新建、删除、重命名目录/HTML/Markdown 后树最终与磁盘一致；批量变化不会无限刷新或保留幽灵节点。

### 阶段 5：清理旧契约并完成回归

- 删除 `buildFolderTree`、旧 `NoteChangedEvent` / `NoteRemovedEvent` 的细粒度缓存分支及不再使用的类型。
- 跑 Rust notes 集成测试、前端 notes 测试、TypeScript build；再做 macOS 实机 smoke test，确认 `.html` 默认应用打开。

验收：旧的前缀过滤和“只扫描 `.md`”断言不存在；现有 Markdown 编辑、保存冲突、重命名和删除行为不回归。

## 工作量与决策点

整体是**中等偏大重构**，不是高算法风险，但跨越 15 个左右生产文件且 watcher / 外部打开具有平台和安全风险。建议拆成 3 个可审查提交：扫描契约与 Rust 测试、前端迁移、系统打开与 watcher。

已确认展示所有非隐藏普通文件，不显示符号链接，并采用大小写不敏感、带稳定 tie-breaker 的名称排序；首版不实现 Finder 式自然/本地化排序。

除此之外，三项核心要求的实现方向没有架构性阻塞，也不需要数据库迁移或 HTTP API 变更；影响集中在 Desktop Application 的 Notes Workspace。
