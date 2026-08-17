#!/usr/bin/env python3
"""Generate a conservative localization review for the current bookmark tags."""

from __future__ import annotations

import re
import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path


DATABASE = Path.home() / "Library/Application Support/com.bkmrx/bookmarks.db"
OUTPUT = Path(__file__).resolve().parents[1] / "docs/reviews/2026-08-13-bookmark-tags-localization-review.md"


WORDS = {
    "abstraction": "抽象", "access": "访问", "accessible": "无障碍", "accessibility": "无障碍访问",
    "account": "账户", "accounting": "会计", "activation": "激活", "ad": "广告",
    "address": "地址", "admin": "管理后台", "advanced": "进阶", "aesthetics": "美学",
    "agent": "智能体", "ai": "AI", "aggregate": "聚合", "aggregation": "聚合", "aggregator": "聚合器",
    "algorithm": "算法", "alias": "别名", "alternatives": "替代方案", "analysis": "分析",
    "analytics": "分析", "annotation": "注解", "anonymous": "匿名", "answer": "问答",
    "appearance": "外观", "app": "应用", "arbitrary": "任意", "architecture": "架构",
    "architectural": "架构", "archive": "归档", "archiving": "归档", "arithmetic": "算术",
    "array": "数组", "art": "艺术", "asset": "素材", "assets": "素材", "assistant": "助手",
    "asynchronous": "异步", "audio": "音频", "authorization": "授权", "auto": "自动",
    "automated": "自动化", "autonomous": "自主", "avatar": "头像", "background": "背景",
    "backgrounds": "背景", "backup": "备份", "badge": "徽章", "basics": "基础",
    "beginner": "入门", "best": "最佳", "big": "大", "binary": "二进制",
    "black": "黑盒", "block": "区块", "blocking": "阻塞", "boilerplate": "样板代码",
    "book": "书籍", "books": "书籍", "bookmark": "书签", "borrowing": "借贷",
    "bot": "机器人", "bounded": "限界", "box": "盒", "brainstorming": "头脑风暴",
    "branching": "分支", "brand": "品牌", "branding": "品牌设计", "bridge": "跨链桥",
    "browser": "浏览器", "bug": "缺陷", "build": "构建", "builder": "构建器",
    "building": "构建", "bundle": "包体", "bundler": "打包器", "bundling": "打包",
    "business": "业务", "button": "按钮", "buying": "购买", "caching": "缓存",
    "calculation": "计算", "calendar": "日历", "callback": "回调", "canary": "金丝雀",
    "card": "卡片", "career": "职业", "case": "案例", "certificate": "证书",
    "challenge": "挑战", "change": "变更", "changelog": "更新日志", "character": "字符",
    "chart": "图表", "charting": "图表", "chat": "聊天", "chatbot": "聊天机器人",
    "checker": "检查器", "checklist": "检查清单", "china": "中国", "chinese": "中文",
    "chunked": "分片", "class": "类", "clean": "整洁", "cleaning": "清理",
    "client": "客户端", "clipboard": "剪贴板", "cloud": "云", "code": "代码",
    "coding": "编程", "collaboration": "协作", "collapsible": "可折叠", "collision": "碰撞",
    "color": "颜色", "commercial": "商业", "commit": "提交", "community": "社区",
    "comparison": "对比", "compatibility": "兼容性", "compiler": "编译器",
    "component": "组件", "components": "组件", "compression": "压缩", "computer": "计算机",
    "concept": "概念", "concurrency": "并发", "concurrent": "并发", "conference": "会议",
    "configuration": "配置", "conflict": "冲突", "connectivity": "连接", "console": "控制台",
    "container": "容器", "containerization": "容器化", "content": "内容", "context": "上下文",
    "continuous": "持续", "contract": "合约", "control": "控制", "controls": "控件",
    "convention": "约定", "conventional": "约定式", "conversion": "转换", "converter": "转换器",
    "copy": "复制", "coroutine": "协程", "cost": "成本", "coverage": "覆盖率",
    "crawler": "爬虫", "creative": "创意", "critique": "评审", "cross": "跨",
    "curated": "精选", "curation": "整理", "currency": "货币", "custom": "自定义",
    "customization": "定制", "daily": "每日", "dark": "深色", "dashboard": "仪表盘",
    "data": "数据", "database": "数据库", "dataset": "数据集", "date": "日期",
    "debug": "调试", "debugging": "调试", "decentralized": "去中心化", "decoder": "解码器",
    "decoding": "解码", "decorator": "装饰器", "decoupling": "解耦", "decryption": "解密",
    "deep": "深度", "defensive": "防御", "demo": "演示", "dependency": "依赖",
    "deployment": "部署", "deprecated": "已弃用", "design": "设计", "designer": "设计师",
    "desktop": "桌面端", "detection": "检测", "developer": "开发者", "development": "开发",
    "diagnostics": "诊断", "diagram": "图表", "diagramming": "绘图", "dialog": "对话框",
    "diary": "日记", "diff": "差异", "digital": "数字", "directive": "指令",
    "directory": "目录", "disable": "禁用", "discount": "折扣", "discovery": "发现",
    "discussion": "讨论", "disk": "磁盘", "distributed": "分布式", "document": "文档",
    "documentary": "纪录片", "documentation": "文档", "domain": "领域", "download": "下载",
    "drag": "拖拽", "drawing": "绘图", "duplicate": "重复", "dynamic": "动态",
    "editor": "编辑器", "editing": "编辑", "education": "教育", "educational": "教育",
    "effect": "效果", "efficient": "高效", "element": "元素", "email": "邮件",
    "embed": "嵌入", "emoji": "表情", "emulator": "模拟器", "encoder": "编码器",
    "encoding": "编码", "encryption": "加密", "engine": "引擎", "engineering": "工程",
    "enterprise": "企业", "environment": "环境", "error": "错误", "essay": "文章",
    "event": "事件", "examples": "示例", "exchange": "交易所", "exercises": "练习",
    "explainer": "解读", "explanation": "讲解", "export": "导出", "extension": "扩展",
    "fake": "虚拟", "fallback": "降级", "faq": "常见问题", "feature": "功能",
    "features": "功能", "fetching": "获取", "file": "文件", "filter": "筛选器",
    "filtering": "筛选", "finance": "金融", "financial": "金融", "fingerprint": "指纹",
    "fingerprinting": "指纹识别", "fixed": "固定", "flow": "流程", "flowchart": "流程图",
    "font": "字体", "footer": "页脚", "form": "表单", "format": "格式", "framework": "框架",
    "formatter": "格式化工具", "formatting": "格式化", "formula": "公式", "forum": "论坛",
    "free": "免费", "frontend": "前端", "fullscreen": "全屏", "functional": "函数式",
    "funding": "资助", "fundraising": "融资", "fuzzy": "模糊", "gallery": "画廊", "gateway": "网关",
    "game": "游戏", "generator": "生成器", "generative": "生成式", "geographic": "地理",
    "geography": "地理", "gesture": "手势", "getting": "快速", "gradient": "渐变",
    "graph": "图", "graphic": "平面", "grayscale": "灰度", "grid": "网格",
    "guide": "指南", "guidelines": "规范", "hand": "手绘", "handbook": "手册",
    "hardware": "硬件", "hashing": "哈希", "header": "页头", "headless": "无头",
    "helpers": "辅助工具", "hierarchical": "分层", "highlight": "高亮", "highlighting": "高亮",
    "history": "历史", "home": "家庭", "hosting": "托管", "hover": "悬停",
    "icon": "图标", "icons": "图标", "identity": "身份", "illustrated": "图解",
    "illustration": "插画", "image": "图像", "images": "图像", "immutable": "不可变",
    "immutability": "不可变性", "implementation": "实现", "indentation": "缩进",
    "infinite": "无限", "infrastructure": "基础设施", "input": "输入", "inspiration": "灵感",
    "installation": "安装", "integration": "集成", "interaction": "交互", "interactive": "交互式",
    "interactivity": "交互", "interface": "接口", "international": "国际", "interoperability": "互操作性",
    "interpreter": "解释器", "interview": "面试", "investigation": "调研", "issue": "问题",
    "job": "求职", "journal": "期刊", "key": "密钥", "keyboard": "键盘",
    "knowledge": "知识", "landing": "落地", "language": "语言", "large": "大型",
    "launcher": "启动器", "layout": "布局", "lazy": "懒", "learning": "学习",
    "legacy": "遗留", "lending": "借贷", "library": "代码库", "lightweight": "轻量",
    "line": "行", "link": "链接", "linting": "代码检查", "list": "列表",
    "live": "实时", "loading": "加载", "local": "本地", "logging": "日志",
    "logical": "逻辑", "login": "登录", "logo": "Logo", "logos": "Logo",
    "long": "长期", "lookup": "查询", "machine": "机器", "magazine": "杂志",
    "mainnet": "主网", "maintenance": "维护", "management": "管理", "map": "地图",
    "market": "市场", "marketplace": "市场", "math": "数学", "media": "媒体",
    "memory": "记忆", "merchant": "商户", "merge": "合并", "metadata": "元数据",
    "metrics": "指标", "microservices": "微服务", "migration": "迁移", "mindmap": "思维导图",
    "mirror": "镜像", "mobile": "移动端", "mock": "模拟", "model": "模型",
    "modeling": "建模", "modern": "现代", "modular": "模块化", "modules": "模块",
    "monitor": "监控器", "monitoring": "监控", "motion": "动效", "movie": "电影",
    "movies": "电影", "multi": "多", "multimedia": "多媒体", "multiple": "多种",
    "naming": "命名", "native": "原生", "natural": "自然", "navigation": "导航", "nested": "嵌套",
    "network": "网络", "networking": "网络", "news": "资讯", "newsletter": "周刊",
    "no": "无", "node": "节点", "note": "笔记", "notification": "通知",
    "number": "数字", "numerical": "数值", "object": "对象", "observability": "可观测性",
    "observable": "可观察对象", "observer": "观察者", "offline": "离线", "online": "在线",
    "onboarding": "上手引导", "open": "开放", "operating": "操作", "operators": "运算符",
    "opinion": "观点", "optimization": "优化", "options": "选项", "organization": "组织",
    "orientation": "方向", "overflow": "溢出", "overlay": "覆盖层", "overview": "概览",
    "package": "包", "packaging": "包装", "page": "页面", "paid": "付费",
    "painting": "绘画", "panel": "面板", "panorama": "全景", "parallel": "并行",
    "pair": "结对", "parallelism": "并行", "parser": "解析器", "partial": "部分", "particles": "粒子",
    "password": "密码", "patch": "补丁", "patching": "补丁", "path": "路径",
    "pattern": "模式", "payment": "支付", "performance": "性能", "permission": "权限",
    "permissions": "权限", "persistence": "持久化", "personal": "个人", "philosophy": "哲学",
    "phishing": "钓鱼", "photo": "照片", "photography": "摄影", "picker": "选择器",
    "placeholder": "占位符", "platform": "平台", "player": "播放器", "plugin": "插件",
    "popup": "弹窗", "portfolio": "作品集", "position": "定位", "poster": "海报",
    "practice": "实践", "precision": "精度", "prediction": "预测", "prefetch": "预取",
    "preflight": "预检", "premium": "高级", "presentation": "演示文稿", "preset": "预设",
    "preview": "预览", "price": "价格", "pricing": "定价", "principles": "原则",
    "print": "打印", "printing": "打印", "privacy": "隐私", "private": "私有",
    "process": "进程", "product": "产品", "production": "生产环境", "productivity": "效率",
    "profiling": "性能分析", "programmer": "程序员", "programming": "编程", "progress": "进度",
    "progressive": "渐进式", "project": "项目", "prompt": "提示词", "prompts": "提示词", "proposals": "提案",
    "protocol": "协议", "prototype": "原型", "prototyping": "原型设计", "provider": "服务商",
    "proxy": "代理", "public": "公共", "publish": "发布", "pull": "下拉", "push": "推送",
    "question": "问题", "quick": "快速", "random": "随机", "ranking": "排名",
    "reading": "阅读", "realtime": "实时", "recommendation": "推荐", "recursion": "递归",
    "refactoring": "重构", "refund": "退款", "release": "发布", "remote": "远程",
    "rendering": "渲染", "replication": "复制", "repository": "仓库", "research": "研究",
    "residential": "住宅", "resize": "尺寸调整", "resolution": "分辨率", "resource": "资源",
    "responsive": "响应式", "resume": "简历", "reuse": "复用", "reverse": "逆向",
    "review": "评审", "rewards": "奖励", "risk": "风险", "roleplay": "角色扮演",
    "router": "路由器", "routing": "路由", "runtime": "运行时", "sandbox": "沙箱",
    "sample": "示例", "scaffolding": "脚手架", "scam": "诈骗", "scanner": "扫描器",
    "scheduler": "调度器", "schema": "模式", "science": "科学", "screenshot": "截图",
    "scripting": "脚本", "scripts": "脚本", "scroll": "滚动", "scrolling": "滚动",
    "search": "搜索", "security": "安全", "seed": "助记", "select": "选择器",
    "selectors": "选择器", "self": "自托管", "semantic": "语义", "series": "系列",
    "server": "服务器", "service": "服务", "session": "会话", "setup": "配置",
    "shape": "形状", "sharing": "分享", "shopping": "购物", "show": "展示",
    "showcase": "案例展示", "simulation": "模拟", "skeleton": "骨架屏", "skill": "技能",
    "skills": "技能", "slider": "滑块", "slides": "幻灯片", "smooth": "平滑",
    "social": "社交", "software": "软件", "sorting": "排序", "source": "源码",
    "space": "太空", "specification": "规范", "speech": "语音", "spreadsheet": "电子表格",
    "standard": "标准", "starter": "启动模板", "startup": "启动", "startups": "创业公司",
    "state": "状态", "static": "静态", "sticky": "吸附", "stock": "图库",
    "storage": "存储", "streaming": "流媒体", "study": "留学", "style": "样式",
    "styling": "样式", "submit": "提交", "subscription": "订阅", "summarization": "摘要",
    "summary": "摘要", "summarizer": "摘要工具", "super": "超", "supply": "供应链", "survey": "调研",
    "sync": "同步", "synchronization": "同步", "syntax": "语法", "system": "系统",
    "tag": "标签", "task": "任务", "team": "团队", "technical": "技术",
    "technology": "技术", "template": "模板", "templating": "模板", "temporary": "临时",
    "terminal": "终端", "test": "测试", "testing": "测试", "text": "文本",
    "theme": "主题", "theory": "理论", "thread": "线程", "throttle": "节流",
    "time": "时间", "timeline": "时间线", "timezone": "时区", "tips": "技巧",
    "toast": "消息提示", "token": "代币", "tool": "工具", "tooling": "工具链",
    "touch": "触摸", "tracker": "追踪器", "tracking": "追踪", "trading": "交易", "traditional": "传统",
    "transaction": "交易", "transactional": "事务型", "transformer": "转换器",
    "transitions": "过渡", "translation": "翻译", "transparency": "透明度", "trend": "趋势",
    "trends": "趋势", "triangle": "三角形", "truncation": "截断", "tutorial": "教程",
    "typing": "打字", "typography": "排版", "ui": "UI", "undo": "撤销",
    "unit": "单位", "unused": "未使用", "update": "更新", "upgrade": "升级",
    "upscaling": "放大", "url": "URL", "user": "用户", "utility": "实用工具",
    "utils": "实用工具", "validate": "校验", "validation": "校验", "validator": "校验器",
    "variables": "变量", "vector": "矢量", "verification": "验证", "version": "版本",
    "versioning": "版本管理", "video": "视频", "viewer": "查看器", "virtual": "虚拟",
    "visibility": "可见性", "visual": "可视化", "visualization": "可视化", "vocabulary": "词汇",
    "voice": "语音", "voting": "投票", "wallet": "钱包", "wallpaper": "壁纸",
    "watermark": "水印", "waveform": "波形", "weak": "弱", "web": "Web",
    "website": "网站", "weekly": "周刊", "white": "白盒", "whiteboard": "白板",
    "wiki": "百科", "window": "窗口", "word": "单词", "words": "单词",
    "work": "工作", "workaround": "变通方案", "worker": "工作线程", "workflow": "工作流",
    "workspace": "工作区", "wrapper": "封装", "writing": "写作", "yellow": "黄皮书",
    "zero": "零", "zone": "区域",
}


PHRASES = {
    "3d": "3D", "3d-design": "3D 设计", "3d-editor": "3D 编辑器",
    "3d-icons": "3D 图标", "3d-illustrations": "3D 插画", "3d-mockup": "3D 样机",
    "3d-model": "3D 模型", "access-control": "访问控制", "activation-codes": "激活码",
    "ad-blocker": "广告拦截", "admin-panel": "管理后台", "admin-template": "后台模板",
    "ai": "AI", "ai-agent": "AI-agent", "ai-assistant": "AI 助手", "airdrop": "空投",
    "ai-chat": "AI 聊天", "ai-coding": "AI 编程", "ai-news": "AI 资讯",
    "ai-search": "AI 搜索", "ai-tools": "AI 工具", "awesome-list": "精选列表",
    "best-practices": "最佳实践", "black-box-testing": "黑盒测试", "block-explorer": "区块浏览器",
    "browser-automation": "浏览器自动化", "browser-compatibility": "浏览器兼容性",
    "build-tool": "构建工具", "case-study": "案例研究", "code-quality": "代码质量",
    "code-review": "代码审查", "computer-science": "计算机科学", "content-addressing": "内容寻址",
    "continuous-deployment": "持续部署", "continuous-integration": "持续集成",
    "cross-browser-testing": "跨浏览器测试", "data-grid": "数据表格",
    "data-processing": "数据处理", "data-visualization": "数据可视化",
    "database-design": "数据库设计", "dependency-injection": "依赖注入",
    "design-patterns": "设计模式", "design-system": "设计系统", "developer-tools": "开发者工具",
    "domain-driven-design": "领域驱动设计", "drag-and-drop": "拖拽",
    "e2e-testing": "端到端测试", "error-handling": "错误处理", "file-management": "文件管理",
    "file-search": "文件搜索", "file-sharing": "文件分享", "file-upload": "文件上传",
    "form-validation": "表单校验", "full-text-search": "全文搜索",
    "functional-programming": "函数式编程", "image-compression": "图像压缩",
    "image-hosting": "图床", "image-optimization": "图像优化", "image-upscaling": "图像放大",
    "infinite-scroll": "无限滚动", "knowledge-base": "知识库", "knowledge-graph": "知识图谱",
    "icon-collection": "icon 合集", "icon-library": "icon 库", "icon-search": "icon 搜索",
    "lazy-loading": "懒加载", "machine-learning": "机器学习", "micro-frontend": "微前端",
    "natural-language": "自然语言", "note-taking": "笔记", "number-formatting": "数字格式化",
    "project-management": "项目管理", "prompt-engineering": "提示词工程",
    "reactive-programming": "响应式编程", "rich-text-editor": "富文本编辑器",
    "search-engine": "搜索引擎", "self-hosted": "自托管", "software-engineering": "软件工程",
    "skill-registry": "skill registry", "skills-management": "skill 管理",
    "source-code": "源代码", "static-analysis": "静态分析", "static-site": "静态网站",
    "state-machine": "状态机", "syntax-highlighting": "语法高亮", "system-design": "系统设计",
    "text-processing": "文本处理", "text-recognition": "文字识别", "user-experience": "用户体验",
    "version-control": "版本控制", "virtual-machine": "虚拟机", "web-development": "Web 开发",
    "web-performance": "Web 性能", "web-security": "Web 安全", "white-box-testing": "白盒测试",
}


PROFESSIONAL = {
    "abi", "ade", "adobe", "adspower", "after-effects", "ag-grid", "ahooks", "ajax", "alibaba", "amd", "api",
    "amm", "android", "angular", "ansible", "ant-design", "apollo", "apple", "arbitrum",
    "ast", "astronvim", "async", "atom", "autocad", "aws", "axure", "azw3", "baas",
    "babel", "bash", "beetl", "binance", "bitcoin", "bitbucket", "bnb", "bootstrap", "bpmn",
    "bun", "c", "cargo", "cdn", "chakra", "chatgpt", "chrome", "ci", "cinema4d", "clash",
    "claude", "cli", "cloudflare", "coc", "codex", "commonjs", "copilot", "cors", "cpp",
    "crdt", "csp", "csrf", "css", "cva", "cyclejs", "cypress", "d3", "dao", "dapp", "dart",
    "defi", "deno", "devops", "dex", "dexie.js", "dmn", "dns", "docker", "dom", "ecmascript",
    "eip", "electron", "element-ui", "emacs", "epub", "erc", "erlang", "es2015", "es6",
    "eslint", "ethereum", "ethers.js", "evm", "excel", "figma", "filecoin", "firebase", "flutter",
    "framer", "freemarker", "gfm", "git", "github", "gitlab", "glsl", "go", "gpt", "graphql",
    "grep", "gui", "hardhat", "haskell", "highcharts", "hmr", "html", "htmx", "http", "https",
    "huggingface", "husky", "i18n", "iaas", "ide", "iframe", "indexeddb", "ios", "ipfs", "ipns",
    "iptv", "iso", "java", "javascript", "jest", "jpeg", "jpg", "jquery", "json", "jsx", "jwt",
    "kindle", "layer2", "less", "linux", "lit", "llm", "lottie", "lsp", "lua", "mac", "macos",
    "markdown", "material-design", "matlab", "mcp", "md5", "mdn", "mdx", "metamask", "meteor",
    "mev", "mfa", "ml", "mobi", "mobx", "mockjs", "monorepo", "mui", "mvc", "mvvm", "mysql",
    "nas", "nestjs", "neovim", "nextjs", "nft", "ng-zorro", "nlp", "node.js", "npm", "oauth",
    "obsidian", "ocr", "openai", "openapi", "openclaw", "orm", "p2p", "paas", "pdf", "php",
    "pinia", "png", "pnpm", "polygon", "postgres", "postgresql", "powershell", "prettier", "prisma",
    "prosemirror", "pubsub", "puppeteer", "python", "pytorch", "qa", "qwik", "radix", "rag",
    "rails", "rbac", "react", "redis", "redux", "regex", "rollup", "rpc", "rsync", "ruby", "rust",
    "rxjs", "saas", "safari", "sass", "sdk", "seo", "serverless", "shadcn", "shell", "smtp", "solana",
    "solid", "solidity", "spa", "sql", "sqlite", "ssg", "ssl", "ssr", "storybook", "svelte",
    "sveltekit", "svg", "swagger", "swr", "tailwindcss", "tanstack", "tauri", "telegram", "threejs",
    "trpc", "tslint", "typescript", "ubuntu", "ui", "uml", "unicode", "unix", "unocss", "v2ray",
    "vdom", "vercel", "vite", "vitest", "vim", "vimscript", "vpn", "vps", "vr", "vscode", "vue",
    "vueuse", "wagmi", "walletconnect", "wasm", "web3", "web3.js", "webauthn", "webgl", "webp",
    "webpack", "websocket", "windows", "wordpress", "wsl", "wysiwyg", "xmlhttprequest", "xss", "xstate",
    "yarn", "yjs", "z-index", "zk-snarks", "zod",
}


# Short, familiar English terms that are clearer in the user's technical context.
# These stay in English both alone and inside otherwise translatable compound tags.
PRESERVE_WORDS = {
    "agent", "avatar", "backup", "bug", "build", "cache", "debug", "demo", "diff",
    "grid", "hook", "hooks", "icon", "icons", "input", "layout", "mock", "modal",
    "panel", "popup", "preview", "registry", "resize", "scroll", "skill", "skills", "slider", "theme", "toast",
    "token", "undo",
}


def has_chinese(value: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", value))


def normalize_ai(value: str) -> str:
    return re.sub(r"(?i)(?<![a-z0-9])ai(?![a-z0-9])", "AI", value)


def recommendation(tag: str) -> tuple[str, str]:
    lowered = tag.lower()
    tokens = [token for token in re.split(r"[-_/.@ ]+", lowered) if token]
    if lowered in PRESERVE_WORDS:
        return "保留原文", "短且常用的英文表达，比中文更简洁清晰"
    if (
        re.fullmatch(r"\d+(?:\.\d+)*", lowered)
        or lowered in PROFESSIONAL
        or any(token in PROFESSIONAL or re.search(r"\d", token) for token in tokens)
    ):
        return "保留原文", "专业名词、品牌、协议、标准缩写或版本标识"

    if lowered in PHRASES:
        suggestion = PHRASES[lowered]
        if suggestion.lower().replace("-", " ") == lowered.replace("-", " "):
            return "保留原文", "专业名词或业界常用英文表达"
        return "建议汉化", suggestion

    if tokens and all(token in WORDS or token in PRESERVE_WORDS for token in tokens):
        parts = [token if token in PRESERVE_WORDS else WORDS[token] for token in tokens]
        translated = ""
        for part in parts:
            if translated and (translated[-1].isascii() or part[0].isascii()):
                translated += " "
            translated += part
        if translated.lower().replace("-", " ") == lowered.replace("-", " "):
            return "保留原文", "专业名词或业界常用英文表达"
        return "建议汉化", translated

    return "待确认", "含义、产品属性或常用中文译法不够明确"


def main() -> None:
    connection = sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)
    rows = connection.execute(
        """
        SELECT t.name, count(bt.bookmark_id) AS bookmark_count
        FROM tags t
        JOIN bookmark_tags bt ON bt.tag_id = t.id
        GROUP BY t.id, t.name
        ORDER BY t.name COLLATE NOCASE
        """
    ).fetchall()
    connection.close()

    untranslated = [(name, count) for name, count in rows if not has_chinese(name)]
    classified = [(name, count, *recommendation(name)) for name, count in untranslated]
    totals = Counter(status for _, _, status, _ in classified)

    lines = [
        "# 当前书签标签汉化审阅清单",
        "",
        f"> 生成日期：{date.today().isoformat()}  ",
        "> 数据源：当前 bkmrx SQLite 数据库（只读）  ",
        f"> 当前标签：{len(rows):,}；已含中文：{len(rows) - len(untranslated):,}；英文标签：{len(untranslated):,}；本次审阅：{len(untranslated) - totals['保留原文']:,}",
        "",
        "## 使用说明",
        "",
        "- `建议汉化`：通用概念已有较稳定中文表达。",
        "- 专业名词、品牌、框架、语言、协议、标准缩写或版本标识已排除。",
        "- `待确认`：无法可靠判断含义或没有稳定中文译法，不做强行翻译。",
        "- 请直接在每行末尾的 `最终标签：` 后填写你确认的译名；接受建议时可原样填入推荐值，不处理则留空。",
        "- 后续执行只读取你填写的 `最终标签`，空白项不会修改。",
        "",
        "## 统计",
        "",
        f"- 建议汉化：{totals['建议汉化']:,}",
        f"- 已排除专业名词：{totals['保留原文']:,}",
        f"- 待确认：{totals['待确认']:,}",
        "",
    ]

    for status in ("建议汉化", "待确认"):
        if not totals[status]:
            continue
        lines.extend([f"## {status}", ""])
        for name, count, item_status, suggestion in classified:
            if item_status != status:
                continue
            if status == "建议汉化":
                recommendation_text = suggestion
            else:
                recommendation_text = f"{normalize_ai(name)}（{suggestion}）"
            lines.append(
                f"- `{name}` | 关联：{count} | 推荐：{recommendation_text} | 最终标签："
            )
        lines.append("")

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"generated={OUTPUT}")
    print(f"reviewed={len(untranslated)}")
    for status in ("建议汉化", "待确认"):
        print(f"{status}={totals[status]}")


if __name__ == "__main__":
    main()
