# bkmr-desktop 设计文档

> 基于 bkmr v7.6.5 的桌面客户端，用于快速搜索、筛选和管理书签。

## 1. 概述

bkmr-desktop 是一个 macOS 本地桌面应用，基于 Tauri（Rust + React）构建，通过 CLI 调用 bkmr 的能力。提供三个核心功能：

1. **搜索/浏览 UI** — 全文+语义混合搜索，标签筛选，即时浏览书签
2. **本地 HTTP 服务** — 监听 `127.0.0.1:8733`，供 Chrome 插件调用添加书签
3. **自动备份** — 启动时自动导出 JSON 到指定目录，支持手动触发

## 2. 布局与组件结构

### 窗口

- 主窗口约 960×640，允许缩放
- 无菜单栏图标，无系统托盘（常规窗口应用）

### 主布局：左右分栏 + 顶栏搜索

```
┌──────────────────────────────────────────────┐
│  [bkmr-desktop]                          ─ ☐ ☒ │
├──────────┬───────────────────────────────────┤
│ 标签筛选   │  🔍 搜索书签...                   │
│           │                                   │
│  □ 全栈    │  ┌─ 结果列表 ──────────────────┐ │
│  □ fe     │  │ 标题A                        │ │
│  □ 视觉    │  │ example.com/path            │ │
│  □ 区块链   │  │ [fe] [全栈] [前端]          │ │
│  □ 其他    │  ├──────────────────────────────┤ │
│  □ ...     │  │ 标题B                        │ │
│           │  │ docs.rs/library              │ │
│  ☐ 全选    │  │ [rust] [文档]               │ │
│  ☐ 清除    │  ├──────────────────────────────┤ │
│           │  │ ... 每页 10 条                │ │
│  [⚙ 设置]  │  │                [1] [2] [3] → │ │
└──────────┴───────────────────────────────────┘
```

### 组件清单

| 组件       | 位置             | 功能                               |
|------------|------------------|------------------------------------|
| 搜索栏     | 右上，fixed       | 输入框 + 回车触发 hsearch           |
| 标签面板   | 左侧，可滚动      | 标签名称+数量，多选/全选/清除       |
| 结果列表   | 中央，分页        | 10条/页，点标题→默认浏览器打开       |
| 设置面板   | 模态弹出          | 配置备份目录，手动备份按钮           |
| 分页控件   | 结果列表底部      | 上/下页 + 页码                      |

## 3. 配色方案

### Light Mode

```
背景主区域      #FAFAF9
侧栏背景        #F5F5F4
列表行          #FFFFFF
分割线          #E7E5E4
主文字          #1C1917 (Stone-900)
次文字          #78716C (Stone-500, URL/辅助文字)
点缀色          #2563EB (Blue-600, 链接/选中)
选中行背景      #EFF6FF (Blue-50)
危险            #DC2626 (Red-600)
```

### Dark Mode

```
背景主区域      #1C1917 (Stone-900)
侧栏背景        #292524 (Stone-800)
列表行          #292524
分割线          #44403C (Stone-700)
主文字          #FAFAF9 (Stone-50)
次文字          #A8A29E (Stone-400)
点缀色          #60A5FA (Blue-400)
选中行背景      #1E3A5F (Blue-900)
危险            #F87171 (Red-400)
```

跟随系统自动切换。

## 4. 排版

字体：系统字体栈（macOS 为 SF Pro）

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
             "Segoe UI", Roboto, sans-serif;
```

字号层级：
- 搜索框标题 15px semibold
- 结果标题 14px medium
- URL 13px normal（次文字色）
- 标签 12px normal（带 6px 圆角 chip）
- 标签列表名称 14px normal
- 标签数量 12px normal（次文字色）

## 5. 圆角与间距

- 卡片/列表行圆角 8px
- 标签 chips 圆角 6px
- 按钮圆角 6px
- 输入框圆角 8px
- 模态面板圆角 12px
- 栅格间距：8px 基础单位

不用阴影，用背景色和分割线区分层级。

## 6. HTTP API 设计

基础 URL: `http://127.0.0.1:8733`

### POST /api/bookmarks

添加书签

Request:
```json
{
  "url": "https://example.com",
  "title": "Example Title",
  "tags": ["dev", "rust"]
}
```

Response: `201 Created`
```json
{ "id": 1234, "status": "created" }
```

### GET /api/tags

获取所有标签列表（用于 Chrome 插件的分类选择）

Response: `200 OK`
```json
[
  {"name": "fe", "count": 852},
  {"name": "全栈", "count": 323},
  {"name": "视觉和样式", "count": 275}
]
```

鉴权：无（仅监听 127.0.0.1）

## 7. 自动备份

- 启动时检查是否有配置备份目录，有则自动执行一次导出
- 导出命令：`bkmr search --json --limit 10000 > {目录}/bookmarks-{日期}.json`
- 文件名格式：`bookmarks-YYYY-MM-DD.json`
- 保留策略：不自动清理历史（用户自行管理）
- UI 设置面板可配置备份目录（系统文件选择器选文件夹）
- UI 提供「立即备份」按钮，手动触发一次导出

## 8. 技术架构

```
bkmr-desktop (Tauri)
├── Rust 后端 (src-tauri)
│   ├── Tauri commands (前端调用的 bridge)
│   │   ├── search(query, tags, page) → bkmr hsearch --json
│   │   ├── get_tags() → bkmr tags --json
│   │   └── backup(dir) → bkmr search --json --limit 10000 > file
│   ├── HTTP 服务 (Axum, 127.0.0.1:8733)
│   │   ├── POST /api/bookmarks → bkmr add
│   │   └── GET /api/tags → bkmr tags --json
│   └── Tauri app lifecycle
│       └── on_window_event: 关闭时停掉 HTTP 服务
│
├── React 前端
│   ├── App.tsx - 主布局
│   ├── SearchBar.tsx
│   ├── TagPanel.tsx
│   ├── ResultList.tsx
│   ├── Pagination.tsx
│   ├── SettingsModal.tsx
│   └── hooks/
│       └── useBkmr.ts - 调用 Tauri commands
```

## 9. 技术选型

| 层         | 选择                         | 理由                        |
|------------|------------------------------|-----------------------------|
| 桌面框架   | Tauri                        | 体积小，Rust 后端适合调 CLI  |
| 前端框架   | React + TypeScript           | 生态成熟                    |
| 样式方案   | Tailwind CSS                 | 快速出系统，变量管理方便      |
| HTTP 服务  | Axum (Rust)                  | Tauri 自带 tokio，Axum 轻量 |
| CLI 调用   | tokio::process::Command      | 异步调用 bkmr CLI           |
| 设置持久化 | Tauri store plugin           | JSON 文件存设置              |

## 10. 未纳入范围

- 浏览器插件开发（用户自行实现）
- 书签编辑/删除功能（仅搜索和添加）
- 开机自启
- 系统托盘 / 菜单栏图标
- 多用户 / 鉴权

## 11. 搜索逻辑（自审补充）

由于 `bkmr hsearch` 必须提供查询词，搜索行为分四种情况：

| 条件 | 执行的命令 |
|------|-----------|
| 无关键词 + 无选中标签 | 显示空状态（提示「输入关键词搜索书签」） |
| 无关键词 + 有选中标签 | `bkmr search --json --tags <tags> -l 10` |
| 有关键词 + 无选中标签 | `bkmr hsearch --json -l 10 <query>` |
| 有关键词 + 有选中标签 | `bkmr hsearch --json -l 10 --tags <tags> <query>` |

分页通过 `--limit 10` + 跳过前面 N 条实现。默认应用启动时为无关键词+无标签的空状态。

## 12. bkmr CLI 输出格式确认

### `bkmr hsearch --json -l 10 <query>` 返回格式

```json
[
  {
    "id": 123,
    "url": "https://example.com",
    "title": "Example Title",
    "tags": ["fe", "前端"],
    "description": "",
    "modified": "2026-07-11T14:30:00"
  }
]
```

### `bkmr tags --json` 返回格式

```json
[
  {"name": "fe", "count": 852},
  {"name": "全栈", "count": 323}
]
```
