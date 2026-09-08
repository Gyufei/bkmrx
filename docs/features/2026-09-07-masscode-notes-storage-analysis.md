# massCode 笔记存储实现核验

核验日期：2026-09-07。官方仓库 main 检出的固定提交：`ce3db7e43e81a5f931a3c169a9e4bb8abddf686c`。通过官方 GitHub 搜索确认项目，下载官方公开仓库后直接检查源码；网页工具未能获取该固定提交页面。以下是源码静态分析，没有运行 massCode 或并发故障实验。用户附件是待核验说明，不作为证据。

## 有价值的组织方式

- **身份和路径分离**：笔记索引保存 `id` 与相对 `filePath`；外部移动时，新路径文件的 frontmatter ID 如果属于一个旧路径已消失的条目，就重定向旧条目。若旧文件还存在，则按复制/ID冲突处理并分配新 ID。这比仅靠路径识别更适合外部重命名，但依赖元数据保留及冲突策略。[外部删除与移动识别](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/sync.ts#L440-L546)
- **普通文件夹与应用元数据分开**：普通笔记按文件夹/标题命名，未分类笔记在 `.masscode/inbox`，回收站在 `.masscode/trash`，资源在 `.masscode/assets`，索引在 `.masscode/state.json`。这里的回收站是应用管理目录，不是操作系统废纸篓。[空间与元数据路径](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/constants.ts#L17-L85) [笔记目标路径](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/notes.ts#L698-L779)
- **软删再永久删除**：UI 首次删除更新 `isDeleted=1` 并清空 folderId，随后路径解析进入 trash；永久删除需要确认，并最终移除文件。删除文件夹时先检查未下载和未知文件，再将子笔记置入回收站。[UI 软删与确认](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/renderer/composables/spaces/notes/useNotes.ts#L712-L782) [删除文件夹预检与迁移](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/storages/folders.ts#L337-L403)
- **降低 watcher 回声与事件风暴**：应用写入后记录路径、mtimeMs、size，2.5 秒内同签名事件被识别为回声。超过 25 个待同步路径转全量；实际 debounce 是 250ms、最长等待 2 秒，watcher 稳定等待为 200ms。附件把 debounce 也写成 200ms，不准确。[自身变更签名](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/runtime/shared/appChanges.ts#L1-L70) [watcher 合并调度](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/watcher.ts#L69-L78) [实际防抖](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/watcher.ts#L354-L363) [稳定等待](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/watcher.ts#L580-L612)

## 附件需要修正的结论

1. **可写检查不是并发冲突检查。** `assertEntityFileWritable` 检查云占位符及 stat 错误；文件不存在（ENOENT）明确放行，允许下次写入重建。它没有比较编辑时读取的内容版本。因此“外部删除一定不会被未保存内容重新创建”不能由此推出。[云可写保护](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/runtime/shared/cloudGuards.ts#L69-L99)
2. **保存不是原子替换，也不是 CAS。** `writeNoteToFile` 读取磁盘内容只是判断与目标内容相同则免写；不同就 `fs.writeFileSync` 直接写入。未见该保存路径的版本冲突拒绝、三方合并、跨进程锁或临时文件原子替换。因此不能称“确保 Git/同步工具并发修改仍保持一致”。外部程序仍可能在检查之后写入，签名过滤也不能关闭 TOCTOU 窗口。[保存实现](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/notes.ts#L573-L640)
3. **不是所有重命名冲突都自动改名。** 同文件夹显式改名会先校验同名条目，冲突可被拒绝；移动等进入 `persistNote` 的允许改名分支时才寻找大小写不敏感的 `Name 1.md` 等候选，移动用 `overwrite:false`。[更新与同名检查](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/storages/notes.ts#L381-L459) [路径冲突与移动](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/notes.ts#L731-L852)
4. **外部 move 保留 ID，不等于自动修好所有链接。** 内部 updateNote 在名称/文件夹变化时调用 backlink 重写；外部 sync 路径中只看到了身份重定向及“应用此前已排队的延迟重写”，不能将内部重命名的保证扩展到任意外部 move。[更新与同名检查](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/storages/notes.ts#L381-L459) [外部删除与移动识别](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/sync.ts#L440-L546)
5. **Backlink 重写有代价和边界。** 内部重命名会加载各笔记内容、解析引用目标并逐文件写回，云端不可读内容会延期。这不是跨文件事务；中途错误不能据此宣称全部文件一起提交或回滚。[引用更新范围与延期](https://github.com/massCodeIO/massCode/blob/ce3db7e43e81a5f931a3c169a9e4bb8abddf686c/src/main/storage/providers/markdown/notes/runtime/backlinks.ts#L249-L400)
6. **回声过滤是性能与刷新体验措施。** mtime+size 是启发式签名，不能证明内容恒等（相同大小且保留时间戳的外部更改可能被漏过）；它也不保护编辑器未保存草稿。

## 借鉴方向（待结合本项目实现排序）

- 优先设计外部更新、删除、移动时的编辑器行为：干净文档重载；脏文档保留草稿并明确冲突；已删除文档提供另存，避免静默复活。
- 应用级回收站与恢复比直接永久删除更可恢复，恢复需要重名策略。
- 若确有稳定身份需求，再引入 ID 与路径映射；必须同时处理 frontmatter 无损往返、普通无 ID Markdown、复制导致 ID 重复、重建索引。不要只添加一个 ID 字段。
- watcher 批处理和回声抑制可以独立借鉴，但不能替代已有内容版本校验或原子写入。
- Backlink 批量重写只在产品已有内部链接需求时引入，应对每个写入文件使用本项目自己的冲突保护。

## 与 bkmrx 1.19.1 的对比及建议顺序

本地基线：`8356322`。以下也属于静态源码分析，没有新增并发实验或修改应用实现。

| 方面 | 当前实现 | 建议 |
| --- | --- | --- |
| 保存保护 | receipt 包含工作区修订、相对路径、SHA-256 内容指纹；写入时两次比对旧内容，再原子替换 | 保留，不改成 massCode 的直接覆盖 |
| 文档身份 | 列表、选中状态和编辑器以相对路径识别笔记 | 外部移动需要跟随时再引入稳定 ID |
| 外部变化 | watcher 更新列表元数据；Document Session 没有随事件重载内容 | 优先补充干净文档重载、脏文档冲突提示、删除后另存草稿 |
| 删除 | 文件 remove_file，目录 remove_dir_all | 优先提供系统废纸篓或应用回收站；目录应整体保留，覆盖附件等非 md 内容 |
| frontmatter | 读取时剥离，保存时直接提交正文 | 优先修复无损往返，否则已有元数据及将来 ID 会被编辑保存移除 |
| watcher | 逐路径处理，仅接受 md 路径 | 合并事件；目录事件、rename、异常或事件遗漏触发有界重扫；回声过滤可后置 |

本地依据：

- [receipt 与保存/重命名/删除](../../apps/desktop/src-tauri/src/notes/service.rs)，`open_document`、`save_document`、`rename_document`、`delete_document`。
- [文件系统操作](../../apps/desktop/src-tauri/src/notes/repository.rs)，`write_if_unchanged`、`rename`、`delete_folder`。
- [watcher](../../apps/desktop/src-tauri/src/notes/watcher.rs) 与 [列表事件处理](../../apps/desktop/src/notes/use-notes-workspace.ts)。
- [文档读取与保存](../../apps/desktop/src/notes/use-note-document.ts)，`stripFrontmatter`、`productionDefaults.save`、`readCurrent`。
- [编辑器与选中路径](../../apps/desktop/src/notes/NotesPanel.tsx) 和 [NoteEditor](../../apps/desktop/src/notes/NoteEditor.tsx)。

### 需要准确描述的当前保证

`write_if_unchanged` 第二次读取与 `commit` 之间仍有竞争窗口；原子替换保证单次文件替换完整，不等于“比较并交换”原子化。`rename` 用 hard_link 后 remove 避免覆盖已有目标，但不是整体原子重命名；删除也存在内容检查到实际删除之间的窗口。建议如实保留这些边界，不因参考 massCode 而宣称绝对并发安全。进程内串行化只能协调本应用写入，不能阻止不合作的外部编辑器。

### 推荐落地顺序

1. 无损保留 frontmatter，并明确外部变化时的 Document Session 行为。
2. 可恢复删除，特别是包含非 Markdown 附件的目录；删除前协调正在编辑的文档。
3. watcher 事件合并与目录/重命名全量校准，先保证列表与磁盘最终一致，再优化回声。
4. 若需要外部移动跟随和链接身份，添加可选稳定 ID、路径索引与重复 ID 规则；索引应可由文件重建。
5. 云占位符、backlink 重写按实际使用需求加入，避免一次引入所有存储层复杂度。

不要直接复制 `.masscode` 目录方案到当前扫描器：当前递归扫描不会排除隐藏元数据目录，若新增 `.bkmrx/trash`，必须同时使扫描器和 watcher 忽略它，否则删除笔记仍可能出现在正常列表。
