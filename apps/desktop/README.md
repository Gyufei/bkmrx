# bkmrx

[bkmr](https://github.com/sysid/bkmr) 书签管理命令行工具的桌面 GUI，基于 Tauri v2 构建。提供书签浏览、混合搜索（FTS5 + ONNX 语义嵌入）、标签筛选、Markdown 笔记编辑，以及可通过 Chrome 扩展调用的 HTTP API。

## 功能

- **书签混合搜索** — 通过 bkmr_lib (SQLite FTS5 + ONNX 语义嵌入) 实现混合搜索，支持全文检索与标签组合过滤
- **标签聚合面板** — 按标签聚合浏览书签，点击快速过滤，支持多标签组合筛选
- **书签管理** — 添加、编辑、删除书签；右键菜单支持打开链接、复制为 Markdown、记录访问次数
- **自动备份** — 配置备份目录后，可一键导出全部书签为 JSON
- **Markdown 笔记** — 集成 [Milkdown / Crepe](https://milkdown.dev) 编辑器，支持语法高亮（10+ 语言）、自动保存、Cmd+S 手动保存；按目录结构组织笔记
- **文件系统监听** — 笔记目录变更实时同步到界面，无需手动刷新
- **内置 HTTP API** — 启动后监听 `127.0.0.1:8733`，供 Chrome 扩展通过 REST API 增删改查书签，变更自动通知前端
- **系统信息面板** — 查看 bkmr 配置路径、SQLite 数据库路径、ONNX 嵌入状态、bkmr 版本
- **设置持久化** — 备份目录、笔记目录等配置保存至 `~/.bkmr/settings.json`
- **深色/浅色主题** — 跟随系统外观

## 快速开始

### 前置依赖

- [bkmr](https://github.com/sysid/bkmr) CLI — 后端依赖（需先配置好 bkmr 的 SQLite 数据库）
- Rust toolchain（推荐通过 [rustup](https://rustup.rs) 安装）
- Node.js >= 18

### 安装与运行

```bash
# 安装前端依赖
pnpm install

# 开发模式（热更新）
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript + shadcn/ui |
| 构建工具 | Vite 5 + pnpm |
| 样式 | TailwindCSS 4 (CSS `@import` + `@theme`) |
| 桌面框架 | Tauri 2 (Rust, 异步 tokio) |
| HTTP 服务 | Axum (内嵌, `127.0.0.1:8733`) |
| 搜索 | bkmr_lib (SQLite FTS5 + ONNX 语义嵌入) |
| 编辑器 | Milkdown / Crepe |
| 后端库 | bkmr（git rev pin） |
| 图标 | Lucide React |
| 文件监听 | notify (Rust crate) |
| 字体 | Inter Variable |

## 项目结构

```
bkmrx/
├── src/                            # React 前端
│   ├── bookmarks/                  # 书签模块
│   │   ├── BookmarkView.tsx        #   主视图（搜索栏+标签+结果列表）
│   │   ├── SearchBar.tsx           #   搜索输入（Enter/点击触发）
│   │   ├── TagPanel.tsx            #   标签筛选面板
│   │   ├── ResultList.tsx          #   书签列表（无限滚动 IntersectionObserver）
│   │   ├── AddBookmarkDialog.tsx   #   添加书签对话框
│   │   ├── EditBookmarkDialog.tsx  #   编辑书签对话框
│   │   └── useBkmr.ts             #   书签 CRUD / 搜索 Hook
│   ├── notes/                      # 笔记模块
│   │   ├── NotesPanel.tsx          #   主面板（文件夹树 + 文件列表 + 编辑器）
│   │   ├── NoteEditor.tsx          #   Milkdown/Crepe Markdown 编辑器
│   │   ├── FolderTree.tsx          #   文件夹树（嵌套折叠）
│   │   ├── buildFolderTree.ts      #   从 NoteFile[] 构建树结构
│   │   └── useNotes.ts             #   笔记 CRUD / 文件监听 Hook
│   ├── settings/                   # 设置模块
│   │   ├── SettingsPage.tsx        #   设置页面（系统信息、备份、笔记目录）
│   │   ├── useSettings.ts          #   设置读写 Hook
│   │   └── useSystemInfo.ts        #   系统信息 Hook
│   ├── components/                 # 共享组件
│   │   ├── TagInput.tsx            #   标签输入（自动完成、箭头导航）
│   │   └── ui/                    #   shadcn/ui 原始组件
│   ├── lib/                        # 工具函数
│   │   ├── invoke.ts               #   Tauri IPC 类型化封装
│   │   ├── tagColor.ts             #   标签色彩（hash → HSL）
│   │   └── utils.ts                #   cn() 工具
│   ├── types.ts                    # 共享 TypeScript 类型
│   ├── App.tsx                     # 根组件
│   ├── Layout.tsx                  # 布局（导航栏 + 页面路由）
│   ├── Navbar.tsx                  # 顶部导航栏（标签切换 + 服务器状态指示）
│   ├── main.tsx                    # 入口
│   └── App.css                     # 全局样式（shadcn 令牌 + Crepe 主题 + 滚动条）
├── src-tauri/                      # Rust 后端
│   └── src/
│       ├── main.rs                 # Tauri 入口（插件注册、容器初始化、HTTP 服务启动）
│       ├── lib.rs                  # 模块声明
│       ├── commands.rs             # Tauri IPC 命令处理（书签、搜索、笔记、设置、系统信息）
│       ├── container.rs            # bkmr ServiceContainer 全局单例（OnceLock）
│       ├── http_server.rs          # Axum HTTP API（供 Chrome 扩展调用，含文档 `/api/docs`）
│       ├── notes.rs                # 笔记文件扫描、读写、文件系统监听（notify crate）
│       └── settings.rs             # `~/.bkmr/settings.json` 读写
├── package.json
├── vite.config.ts
└── pnpm-lock.yaml
```

## HTTP API

应用启动后自动在 `127.0.0.1:8733` 提供 REST API，访问 `/api/docs` 查看完整文档。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 获取所有标签及计数 |
| POST | `/api/bookmarks` | 添加书签 |
| GET | `/api/bookmarks/:id` | 获取书签详情 |
| PUT | `/api/bookmarks/:id` | 更新书签 |
| DELETE | `/api/bookmarks/:id` | 删除书签 |
| GET | `/api/bookmarks/check?url=` | 检查 URL 是否已存在 |

## 许可证

MIT
