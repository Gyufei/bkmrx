# bkmrx-chrome-ext

**bkmrx 配套的 Chrome 扩展** — 在浏览网页时一键将其添加为书签并打标签，无需打开 bkmrx 应用。

---

## 概述

bkmr 是一套命令行书签管理工具（[gyf304/bkmr](https://github.com/gyf304/bkmr)），
bkmrx 是它的 Tauri 桌面客户端，而这个扩展为它提供了浏览器端的快捷入口。
三个组件的关系：

```
浏览器（本扩展） → HTTP API → bkmrx（后台服务） → bkmr CLI → SQLite
```

扩展本身没有独立的存储，所有书签数据都托管在 bkmr 的 SQLite 数据库中。

## 前置条件

- **bkmrx** 必须正在运行（它会在后台监听 `127.0.0.1:8733`）
- Chrome 88+ / Edge 88+ / 其他 Chromium 内核浏览器（需支持 Manifest V3）

## 安装

1. 在浏览器地址栏打开 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目所在的 `bkmrx-chrome-ext` 目录
5. 工具栏出现书签图标，即可使用

> 如需固定到工具栏：点击浏览器工具栏的拼图图标 → 找到 bkmr 书签 → 点 pin 图标。

## 使用

1. 确保 bkmrx 已启动（状态栏应有 bkmr 图标）
2. 在你感兴趣的任意网页上点击扩展图标
3. 表单会自动填入当前页面的 URL 和标题
4. 按需修改标题、添加标签
5. 点击 **添加书签**

**标签输入**：支持空格分隔多个标签（如 `fe rust 前端`），也可以点击下方列出的已存标签快速添加。

添加成功后表单会重置，可以继续为下一个页面添加书签。

## 完整功能

| 功能 | 说明 |
|------|------|
| 自动获取 URL | 读取当前活动标签页的地址 |
| 自动获取标题 | 读取当前活动标签页的 `<title>` |
| 手动编辑 | URL、标题、标签均可自由修改 |
| 标签建议 | 从 bkmr 数据库拉取已有标签（按使用频率排序），点击即添加 |
| 表单验证 | URL 为空时阻止提交并提示 |
| 连接检测 | bkmrx 未运行时显示友好提示 |
| 成功反馈 | 添加成功后显示书签 ID 并清空表单 |

## API 接口

扩展通过 HTTP 与 bkmrx 通信，所有请求发往 `http://127.0.0.1:8733`：

### POST /api/bookmarks

添加书签。

```json
// Request
{
  "url": "https://example.com",
  "title": "Example Title",
  "tags": ["dev", "rust"]
}

// Response 201
{
  "id": 1234,
  "status": "created"
}
```

`title` 和 `tags` 均为可选字段；`title` 省略时自动使用 `url` 的值。

### GET /api/tags

获取所有已存标签及其书签数量。

```json
// Response 200
[
  {"name": "fe", "count": 852},
  {"name": "全栈", "count": 323}
]
```

扩展只展示使用频率最高的 30 个。

## 目录结构

```
bkmrx-chrome-ext/
├── manifest.json          # Manfiest V3 配置 — 权限、图标、弹窗入口
├── background.js          # Service Worker — 预留，无持久逻辑
├── .gitignore
├── README.md
│
├── popup/
│   ├── popup.html         # 弹窗 HTML 结构
│   ├── popup.css          # 样式 — 沿用 bkmrx 设计系统
│   └── popup.js           # 核心逻辑 — 自动填表、标签建议、API 调用
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 扩展框架 | Manifest V3 | Chrome 扩展最新标准 |
| 弹窗 UI | 纯 HTML + CSS + JS | 无框架依赖，零构建步骤 |
| 设计系统 | 同 bkmrx | 配色、字体、间距保持一致 |
| 通信 | Fetch API | 调用本地 HTTP 端点 |

零构建工具依赖——项目即源码，加载即用。

## 故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 点击图标无反应 | 扩展未正确加载 | 检查 `chrome://extensions/` 是否有错误提示 |
| 添加书签时提示"无法连接" | bkmrx 未运行 | 启动 bkmrx 再试 |
| 标签建议不显示 | 同上，或尚无书签 | 先通过 bkmrx 添加几个书签 |
| 添加成功后表单没反应 | 网络错误 | 查看弹窗是否有错误提示；检查 8733 端口是否被占用 |

## 开发

本项目不涉及构建步骤，修改后只需在 `chrome://extensions/` 点击扩展卡片上的刷新图标即可生效。

- 调试弹窗：在扩展上右键 → **审查弹出内容**
- 调试 Service Worker：在扩展卡片上点击 **Service Worker** 链接
