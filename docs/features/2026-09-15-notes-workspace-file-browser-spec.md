# Notes Workspace 文件浏览重构规格

## Problem Statement

当前 Notes Workspace 先递归收集 Markdown Document，再由前端从文件相对路径反推出目录。文件夹顺序间接受笔记顺序影响，空目录和非 Markdown 文件不可见；选择父目录时还会递归展示后代目录的笔记。这种行为不像用户熟悉的文件浏览器，也无法把 HTML、JSON、JavaScript 等共存文件交给系统默认应用打开。

## Solution

将 Notes Workspace 建模为一棵由真实目录和普通文件组成的、逐级稳定排序的 workspace tree。目录栏直接展示真实目录结构，中间栏只展示当前目录直属文件；Markdown Document 保持应用内编辑，External File 由操作系统默认应用打开且不影响当前 Document Session。结构变化通过防抖重扫保持最终一致，并在扫描或打开失败时保留用户已有状态。

## User Stories

1. As a Notes Workspace user, I want folders sorted consistently by name, so that I can find a folder without depending on filesystem enumeration order.
2. As a Notes Workspace user, I want files sorted consistently by name within each folder, so that the file list is predictable.
3. As a Notes Workspace user, I want empty folders to remain visible, so that the directory tree reflects my actual workspace structure.
4. As a Notes Workspace user, I want folders that contain only hidden entries to appear as empty folders, so that hidden metadata does not leak into the visible tree.
5. As a Notes Workspace user, I want dot files and dot directories hidden, so that tool metadata does not clutter ordinary browsing.
6. As a Notes Workspace user, I want directory symlinks excluded from browsing, so that traversal cannot escape the selected workspace or loop.
7. As a Notes Workspace user, I want the workspace root represented by its real folder name, so that I know which directory I am browsing without exposing its absolute path.
8. As a Notes Workspace user, I want the directory column title to be “笔记”, so that the navigation remains visually concise.
9. As a Notes Workspace user, I want clicking a folder to select it and toggle its expansion together, so that the interaction remains consistent with my existing habit.
10. As a Notes Workspace user, I want the root always expanded and first-level folders initially expanded, so that the common navigation level is immediately visible.
11. As a Notes Workspace user, I want my manual expansion choices retained while the page remains open and across watcher refreshes, so that background updates do not disrupt navigation.
12. As a Notes Workspace user, I want selecting a folder to show only files directly inside it, so that files from nested folders do not pollute the current list.
13. As a Notes Workspace user, I want a removed or renamed selected folder to fall back to the nearest existing parent, so that navigation never points to a nonexistent folder.
14. As a Notes Workspace user, I want the current directory file count shown as “共 N 个文件”, so that the count corresponds to the visible list.
15. As a Notes Workspace user, I want file extensions hidden in the main list, so that file names remain visually clean.
16. As a Notes Workspace user, I want Markdown, HTML, JSON, JavaScript, and unknown files to have distinct type icons, so that I can recognize their types without visible extensions.
17. As a Notes Workspace user, I want the full file name available in hover text and accessibility labels, so that same-stem files remain distinguishable.
18. As a Notes Workspace user, I want `.md` and `.markdown` files opened in the application, so that both common Markdown extensions use the existing editor.
19. As a Notes Workspace user, I want an existing Markdown extension preserved during rename, so that renaming does not silently change the file type.
20. As a Notes Workspace user, I want new notes to continue using `.md`, so that the default creation behavior remains familiar.
21. As a Notes Workspace user, I want HTML, JSON, JavaScript, and other ordinary files opened with their system default application, so that the desktop handles formats the application does not edit.
22. As a Notes Workspace user, I want opening an External File to leave the selected and edited Markdown Document untouched, so that consulting another file does not interrupt my work.
23. As a Notes Workspace user, I want one click to open an External File, so that it does not require a meaningless application-local selection state.
24. As a security-conscious user, I want known executable and launcher extensions visible but blocked from opening, so that an ordinary click cannot directly launch them.
25. As a Notes Workspace user, I want a clear error when a file cannot be opened, so that failures do not silently disappear or expose an absolute local path.
26. As a Notes Workspace user, I want search limited to the current directory’s direct files, so that search follows the same navigation boundary as browsing.
27. As a Notes Workspace user, I want hidden extensions included in filename matching, so that searching for `html` or `json` still finds the relevant files.
28. As a Notes Workspace user, I want structural filesystem changes reflected after a short quiet period, so that bulk changes produce one coherent refresh rather than event churn.
29. As a Notes Workspace user, I want content-only changes and hidden-path events ignored by the tree watcher, so that editing does not repeatedly rebuild an unchanged directory tree.
30. As a Notes Workspace user, I want the last successful tree retained when refresh fails, so that a temporary filesystem error does not make my workspace look empty.
31. As a Notes Workspace user, I want a manual retry after a failed refresh, so that I can recover without restarting the application.
32. As a Notes Workspace user, I want folder deletion confirmation to report all descendant files and folders, so that I understand the recursive impact.
33. As a Notes Workspace user, I want deletion confirmation to warn about hidden entries and symlinks, so that invisible content is never removed without disclosure.
34. As a Notes Workspace user, I want External Files excluded from application rename and delete actions in the first release, so that Markdown-specific conflict behavior is not incorrectly applied to arbitrary files.

## Implementation Decisions

- The Notes Workspace listing changes from a flat collection of Markdown-only entries to a real root directory containing recursively nested directory nodes and direct file nodes.
- A directory node contains its name, relative identity, child directories, and direct files. A file node contains its full name, relative identity, and `markdown` or `external` kind. Unused modified-time and size fields are removed.
- The scanner uses `walkdir`, does not follow symlinks, includes non-hidden ordinary directories and files, and preserves empty directories.
- Dot-prefixed entries and every descendant beneath a dot-prefixed directory are absent from the visible snapshot.
- An unreadable entry, unreadable subtree, or filename that cannot be represented losslessly as UTF-8 fails the complete scan. A partial snapshot is never presented as authoritative.
- Directories and files are sorted independently at every level using a case-insensitive name key, followed by original name and relative identity as deterministic tie-breakers. Finder-style localized or natural-number sorting is not required.
- Extension comparisons are case-insensitive. Markdown Document includes `.md` and `.markdown`; every other visible ordinary file is an External File.
- File icon categories are Markdown (`.md`, `.markdown`), HTML (`.html`, `.htm`), JSON (`.json`), JavaScript (`.js`, `.mjs`, `.cjs`), and Unknown. `.jsx` is Unknown. No MIME or content inspection is performed.
- The visible file label removes the final extension. Full file names remain available to search, tooltips, and accessible names.
- The left directory column has the fixed title “笔记”. The root node shows the selected workspace folder name without its absolute path.
- The root is always expanded. First-level directories initially expand; deeper directories initially collapse. Clicking a directory row both selects it and toggles expansion. Expansion state survives refreshes during the page lifetime but is not persisted across application restarts.
- The current directory is explicit; the root is the default. The file list reads only the selected node’s direct files. A missing selected directory falls back through existing ancestors and finally the root.
- The middle column displays “共 N 个文件” for its direct files. Search performs case-insensitive matching against complete filenames in that direct collection only.
- Markdown selection retains the existing Document Session transition and flush rules. Renaming preserves `.md` versus `.markdown`; note creation continues to produce `.md`.
- External File opening accepts only a Settings Revision and relative Workspace Entry identity from the frontend. The Rust boundary canonicalizes and authorizes the existing target beneath the current canonical Notes Workspace, verifies that it is a regular External File, and delegates it to the Tauri opener integration.
- Opening an External File does not flush, replace, close, select, or otherwise mutate the active Markdown Document Session.
- `.app`, `.command`, `.exe`, `.com`, `.bat`, `.cmd`, `.msi`, and `.ps1` are visible but rejected for system opening. Matching is case-insensitive and does not inspect Unix executable bits. `.sh` is not categorically rejected.
- External opening failures appear in the existing page-level error area using a display name and user-readable reason. Absolute paths are not exposed. A later successful open clears that error.
- External Files offer system open and relative-path copying only. Application-local preview, edit, rename, and delete are not exposed.
- The existing filesystem watcher remains. Only non-hidden create, remove, rename, and directory-structure events schedule a workspace refresh. Pure content modifications and hidden-path events do not.
- Watcher events use a 250 ms trailing debounce with an approximately two-second maximum wait. A completed batch invalidates and reloads the complete workspace snapshot instead of recursively patching a cached tree.
- A refresh error retains the previous successful snapshot and exposes an error plus manual retry. Initial scan failure shows an error without a tree.
- Folder deletion performs a complete Rust-side preflight across all descendants, including hidden entries and symlinks. The confirmation summarizes descendant ordinary files and subdirectories and separately warns about invisible entries. It does not reject deletion solely because invisible entries exist; confirmed deletion remains recursive. The workspace root cannot be deleted.
- The current generalized shell-opening capability remains unchanged for unrelated bookmark, RSS, and Markdown-link flows; this feature does not opportunistically migrate them.

## Testing Decisions

- Tests assert externally observable contracts and use the highest stable seam. They do not assert `walkdir` call order, tree-builder helper calls, React component decomposition, or other replaceable implementation details.
- The primary seam is the Rust Notes Workspace service with temporary on-disk workspaces. It verifies tree shape, direct containment, empty and hidden directories, stable sorting, classification, lossless identity errors, unreadable-subtree failure, rename extension preservation, opening authorization, dangerous-extension rejection, and deletion preflight summaries.
- System opening is represented behind a narrow injected adapter at the service boundary. Automated tests record authorized calls without launching a real operating-system application.
- The page seam is the rendered Notes workspace panel with its API mocked. It verifies root and directory interaction, expansion retention, direct file lists and count, type icons, hidden extensions, same-stem accessibility, filename search, Markdown selection, External File opening without Document Session changes, fallback selection, error presentation, and deletion confirmation wording.
- The watcher policy is tested at the Rust event-classification and batching boundary with controlled time. Tests verify accepted and ignored paths/events, 250 ms trailing behavior, maximum wait, and one refresh request per batch without depending on real platform watcher timing.
- The frontend workspace hook seam verifies that a structural change reloads the query once and that a failed reload retains previous data with an exposed error. Existing mutation behavior remains covered.
- Existing Document Session and Markdown editor tests remain the regression boundary for save serialization, conflict receipts, transition flushes, rename, delete, and editor state.
- One manual macOS smoke test confirms that an allowed External File opens with its configured default application and that a rejected launcher produces the application error without changing the active Markdown Document.

## Out of Scope

- Finder-style localized or natural-number sorting.
- File content search, recursive search, MIME sniffing, or content-based icon detection.
- Application preview, editing, rename, or delete for External Files.
- A hidden-entry visibility setting.
- Browsing or following symbolic links.
- Blocking files based on Unix executable permission bits.
- Persisting expansion state across application restarts.
- Parallel scanning, an incremental mutable tree, or performance optimization without a measured bottleneck.
- Migrating unrelated uses of the existing shell plugin.

## Further Notes

- Supporting library research recommends `walkdir` for scanning, retaining the existing `notify` watcher, and using Tauri’s official opener integration for operating-system opening.
- The feature changes no database schema and no HTTP API. Its contract is contained within the Desktop Application’s Notes Workspace.
- The work is expected to be split into dependency-ordered tracer bullets after this specification is accepted: Rust tree contract and scan, frontend browsing, secure system opening, watcher consistency, and cleanup/regression verification.
