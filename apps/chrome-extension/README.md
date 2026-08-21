# bkmrx-ext

bkmrx-ext 是 bkmrx 的浏览器快捷入口，可以读取当前页面的 URL 和标题、添加标签，并通过本机 HTTP API 保存到桌面应用。

[返回项目首页](../../README.md) · [桌面端](../desktop/README.md) · [HTTP API](../../docs/features/2026-07-24-http-api.md)

```text
当前网页 ── Chrome 扩展 ── HTTP API ── bkmrx Desktop ── SQLite
```

扩展不维护独立书签数据。界面使用 Svelte 和 TypeScript 开发，并通过 Vite 构建。

## 前置条件

- [bkmrx Desktop](../desktop/README.md) 正在运行，并监听 `127.0.0.1:8733`。
- Chrome 88+、Edge 88+ 或其他支持 Manifest V3 的 Chromium 浏览器。

## 安装

1. 在浏览器地址栏打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 先按下文说明生成构建产物。
5. 选择仓库中的 `apps/chrome-extension/dist` 目录。
6. 将 bkmrx 图标固定到浏览器工具栏。

## 使用

1. 启动 bkmrx Desktop。
2. 打开需要保存的网页并点击扩展图标。
3. 确认自动填入的 URL 和标题。
4. 按需编辑标题，并输入或选择标签。
5. 点击“添加书签”。

输入标签后可按回车添加，也可用逗号分隔，例如 `fe,rust,前端`。扩展会从桌面端获取按使用频率排序的已有标签，并在下拉框中最多展示 20 个匹配项供快速选择。

## 功能

| 功能 | 说明 |
|---|---|
| 自动获取页面信息 | 读取当前活动标签页的 URL 和标题 |
| 编辑与校验 | 提交前可修改 URL、标题和标签，并校验必填项 |
| 标签建议 | 按使用频率获取已有标签供快速选择 |
| 重复检测 | 按完整 URL 查询已有书签 |
| 编辑书签 | 更新已存在书签的标题、描述和标签 |
| 连接提示 | 桌面端未运行时显示明确的连接错误 |
| 描述翻译 | 自动翻译不含中文的纯外文网页描述；请求中可直接保存原文，失败时显示悬浮提示 |

## API 依赖

所有请求发送到 `http://127.0.0.1:8733`：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/bookmarks` | 添加书签 |
| GET | `/api/bookmarks/by-url?url=` | 查询当前 URL |
| PATCH | `/api/bookmarks/:id` | 更新书签 |
| GET | `/api/tags` | 获取标签建议 |
| POST | `/api/translations` | 翻译英文描述 |

扩展使用服务端统一的 REST 响应和错误结构，向用户展示 `error.message`。完整契约见 [HTTP API 文档](../../docs/features/2026-07-24-http-api.md)。

## 目录结构

```text
apps/chrome-extension/
├── package.json
├── vite.config.ts
├── .env.example
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── lib/
    │   ├── api.ts
    │   ├── bookmark.ts
    │   ├── chrome.ts
    │   └── types.ts
    └── popup/
        ├── index.html
        ├── main.ts
        ├── App.svelte
        └── TagInput.svelte
```

安装依赖并生成生产构建：

```bash
pnpm install
pnpm --filter bkmrx-ext build
```

开发时运行监听构建，修改源码后在 `chrome://extensions/` 中点击扩展卡片的刷新按钮：

```bash
pnpm --filter bkmrx-ext dev
```

API 地址由 `VITE_BKMRX_API_URL` 控制。复制 `.env.example` 为 `.env.local` 可进行本机覆盖。所有 `VITE_` 变量都会进入浏览器构建产物，因此不能用于保存密钥。构建过程会根据该地址同步生成 Manifest 的 `host_permissions`。

## 调试

- 弹窗：右键扩展图标，选择“审查弹出内容”。
- Service Worker：在扩展卡片中点击 “Service Worker”。
- 请求：在弹窗开发者工具的 Network 面板检查 `127.0.0.1:8733` 请求。

## 故障排查

| 现象 | 可能原因 | 处理方式 |
|---|---|---|
| 点击图标没有内容 | 扩展加载失败 | 在 `chrome://extensions/` 查看错误并重新加载 |
| 提示无法连接 | 桌面端未运行 | 启动 bkmrx Desktop 后重试 |
| 标签建议为空 | 尚无标签或 API 不可用 | 先创建带标签的书签并检查桌面端 |
| 请求失败 | 端口占用或 API 错误 | 检查弹窗 Network 面板和桌面端日志 |

## 许可证

MIT
