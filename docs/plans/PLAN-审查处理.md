# 代码审查意见处理计划

> 基于 Rust 代码审查报告，逐条核实后整理的执行计划。

---

## 总览

| 状态 | 条数 | 说明 |
|------|------|------|
| ✅ 不改 | 8 条 | 审查有误、无需改动、或收益低于成本 |
| ⚠️ 要改 | 6 条 | 按优先级分 P0-P1 |

---

## ✅ 不改（共 8 条）

### #1 `updated_at` 缺失 panic 风险
**审查原文：** `b.updated_at.to_rfc3339()` 在 None 上调用会 panic

**核实结论：** 审查看错了类型。`bkmr_lib` 的 `Bookmark::updated_at` 是 `DateTime<Utc>`（非 `Option`），
`commands.rs:232` 赋值 `updated.updated_at = chrono::Utc::now()` 也印证了这一点。
`created_at` 才是 `Option`（用了 `.map()` 处理），编译能过说明类型系统已经保证了安全性。

→ **不改**

### #3 设置与配置两套体系冲突
**审查原文：** `settings.json` 里的 `notes_dir` 无人读取使用（死配置）

**核实结论：** 审查看错了。`notes_dir` 的流程是：
`SettingsPage` 设置 → `settings.save()` 写入 `~/.bkmr/settings.json` → `App.tsx:68`
读取 `settings.settings.notes_dir` → 传给 `NotesPanel` → 传给 `scan_notes` Tauri 命令。
前端是完整通路，Rust 端不需要自力读取该字段。

→ **不改**

### #4 OnceLock 线程安全假象
**审查原文：** 全局单例跨线程并发可能 UB

**核实结论：** `OnceLock` 是 Rust 原生线程安全容器，返回 `&'static T`。如果
`ServiceContainer` 内部的连接池不是 `Send + Sync`，编译期就会报错。
`bkmr_lib` 作为主流库有充分测试保障。

→ **不改**

### #7 HTTP 端口无控制
**审查原文：** 端口 8733 硬编码，无冲突检测

**核实结论：** `start_server` 已有 `TcpListener::bind` 的错误处理（输出错误信息并 return），
不会 panic。桌面应用单实例运行，端口冲突几乎不会发生。将端口配置化需要从 UI 到 Rust 全链路
改动，当前收益极低。

→ **不改**

### #10 错误类型用 String 贯穿全程
**审查原文：** 应定义 `thiserror::Error` 枚举错误类型

**核实结论：** 这是重构建议，不是 bug。当前 app 规模（~400 行 Rust 代码）定义为 `Result<T, String>`
足够，定义完整错误枚举类型会增加大量代码。等到项目规模扩大或错误处理成为痛点时再重构。
当前 `http_server.rs:116` 的 `e.contains("already exists")` 字符串嗅探虽然脆弱但有效。

→ **不改**

### #11 add_bookmark 魔法参数
**审查原文：** `add_bookmark(..., false, true, None)` 三个裸 bool/None 看不出语义

**核实结论：** `bkmr_lib` 的 API 签名如此，不是本项目的代码。在调用处加注释说明即可，
不需要做结构性改动。

→ **不改**（可在改动 #8 清理时加一行注释）

### #13 中英错误信息混合
**审查原文：** "Bookmark not found" + "目录不存在" 混用

**核实结论：** 仅 2 条错误消息不一致且不影响功能。全盘统一需要排查所有返回路径，
收益极低。

→ **不改**

### #14 Local vs Utc 混用
**审查原文：** `Local::now()` 和 `Utc::now()` 混用

**核实结论：** 这是合理的设计选择。备份文件名用本地时区对用户友好，时间戳字段用 UTC
保持跨时区一致性。

→ **不改**

### #16 跨设备 rename 可能失败
**审查原文：** `fs::rename` 跨文件系统会失败

**核实结论：** 笔记文件都在同一个用户目录内，不是跨设备操作。理论问题，实际不出现。

→ **不改**

---

## ⚠️ 要改（共 6 条）

### P0 — Bug，立即修复

#### #6 切换 notes 目录时 watcher 不更新（`notes.rs`）
**审查原文：** 切换目录旧 watcher 不会被替换

**核对确认：** 真实 bug。`start_watcher` 在 `guard.is_some() == true` 时直接 return，
不会重新创建 watcher。若用户在设置页面切换 notes 目录：
1. 新目录的变更事件不会被捕捉
2. 旧目录继续被监听，反向污染 UI

**改动方案：** `start_watcher` 支持重新设置——如果新目录与当前监视目录不同，替换 watcher。

**涉及文件：** `src-tauri/src/notes.rs`

---

### P1 — 清理，值得做

#### #2 死代码 + 硬编码 limit（`commands.rs`）
**审查原文：** 两个搜索命令并存、hybrid 写死 500 上限

**核对确认：**
- 前端只调用 `hybrid_search_bookmarks`
- `search_bookmarks` 虽然能用但不被前端调用，是死代码
- `hybrid_search_bookmarks` 硬编码 `limit: Some(500)`，超过 500 条书签时搜索结果被静默截断

**改动方案：**
- 移除 `search_bookmarks` 命令（API 注册 + 函数定义）
- `hybrid_search_bookmarks` 去掉 hard limit，改为 `limit: None`

**涉及文件：** `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`

#### #5 Mutex PoisonError 防御（`notes.rs`, `main.rs`）
**审查原文：** `mtx.lock().unwrap()` 在持锁线程 panic 时触发 PoisonError

**核对确认：** 两处 `unwrap()` 调用在特定场景（如后台线程异常崩溃）会引发 panic：
- `notes.rs:82`：`*mtx.lock().unwrap() = None`
- `main.rs:26`：`shutdown_tx.lock().unwrap().take()`

**改动方案：** 替换为 `unwrap_or_else(|e| e.into_inner())`

**涉及文件：** `src-tauri/src/notes.rs`, `src-tauri/src/main.rs`

#### #8 + #9 合并：重复的 bookmark 转换逻辑 + 标签解析（`commands.rs`, `http_server.rs`）
**审查原文：** `to_bkmr_bookmark` 已定义但 `load_all_bookmarks` 又内联了一遍；
http_server 多处重复构造 JSON；`to_tag_set` 和 http_server 里同时复制了同一段 tag 解析

**核对确认：**
- `load_all_bookmarks` 完整重复了 `to_bkmr_bookmark` 的字段映射
- `http_server.rs` 多处 handler 内联构造 bookmark JSON（`get_bookmark_handler`,
  `check_bookmark_handler`, `update_bookmark_handler`）
- `http_server.rs` 复制了 `commands.rs` 的 `to_tag_set` 逻辑

**改动方案：**
1. `load_all_bookmarks` 改为调用 `to_bkmr_bookmark`
2. `http_server.rs` 定义一个 `to_json_bookmark(&Bookmark) -> serde_json::Value` 函数复用
3. `http_server.rs` 调用 `commands::to_tag_set` 复用标签解析

**涉及文件：** `src-tauri/src/commands.rs`, `src-tauri/src/http_server.rs`

#### #12 settings::load 失败静默（`settings.rs`）
**审查原文：** `load()` 失败 `.unwrap_or_default()` 连 `eprintln` 都没有

**核对确认：** 当 `~/.bkmr/settings.json` 存在但内容损坏时，静默返回默认值，
用户设置的 `notes_dir` 无声消失。

**改动方案：** JSON 解析失败时 `eprintln` 输出错误信息

**涉及文件：** `src-tauri/src/settings.rs`

---

## 改动顺序

```
1. #6  ◀ 先修这个，目录切换 watcher bug 影响功能
2. #5  ◀ 防御性修复，顺手改
3. #12 ◀ 一行改动
4. #2  ◀ 死代码清理
5. #8+#9 ◀ 代码复用清理（改动较多）
```

---

*文档生成时间：2026-07-20*
