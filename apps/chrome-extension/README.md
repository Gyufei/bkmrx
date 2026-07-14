# bkmr-chrome-ext

Chrome 扩展，与 [bkmr-desktop](https://github.com/gyf304/bkmr) 配合使用，一键将当前页面添加为书签。

## 工作原理

- 点击扩展图标 → 弹出表单，自动填入当前页面的 URL 和标题
- 可以修改标题、添加标签（支持从已存标签中点击选择）
- 点击"添加书签" → 调用本地 bkmr-desktop HTTP API 保存

## 前提条件

- 已安装并运行 [bkmr-desktop](https://github.com/gyf304/bkmr)（监听 `127.0.0.1:8733`）
- Chrome 浏览器 88+（支持 Manifest V3）

## 安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本项目所在的 `bkmr-chrome-ext` 目录
5. 扩展即安装完成，工具栏会出现书签图标

## 使用

1. 确保 bkmr-desktop 已启动
2. 在任意网页上点击扩展图标
3. 确认或修改 URL、标题
4. 在标签输入框中输入标签（空格分隔），或点击下方已存标签快速添加
5. 点击"添加书签"

## 目录结构

```
bkmr-chrome-ext/
├── manifest.json         # 扩展配置（Manifest V3）
├── background.js         # Service Worker
├── popup/
│   ├── popup.html        # 弹窗界面
│   ├── popup.css         # 样式
│   └── popup.js          # 核心逻辑
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
