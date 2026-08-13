#!/usr/bin/env python3
"""Fill unresolved tag translations using local, conservative terminology rules."""

from __future__ import annotations

import re
from pathlib import Path

from generate_tag_localization_review import PRESERVE_WORDS, PROFESSIONAL, WORDS


REVIEW = Path(__file__).resolve().parents[1] / "docs/reviews/bookmark-tags-localization-review-20260813.md"

EXTRA = {
    "accounting": "会计", "accelerated": "加速", "acceleration": "加速", "accelerator": "加速器",
    "addresses": "地址", "ads": "广告", "agents": "agent", "alternative": "替代方案",
    "animation": "动画", "anime": "动漫", "approvals": "审批", "australia": "澳大利亚",
    "autocomplete": "自动补全", "autofill": "自动填充", "automation": "自动化", "based": "式",
    "bean": "Bean", "benchmark": "基准测试", "bezier": "贝塞尔", "binding": "绑定",
    "blending": "混合", "blockchain": "区块链", "blocks": "区块", "blog": "博客",
    "boolean": "布尔", "border": "边框", "broadcast": "广播", "calculator": "计算器",
    "call": "调用", "calligraphy": "书法", "canvas": "Canvas", "casino": "赌场",
    "cell": "单元格", "chain": "链", "check": "检查", "cleanup": "清理", "codec": "编解码器",
    "collection": "合集", "column": "列", "columns": "列", "command": "命令",
    "communication": "通信", "compatible": "兼容", "competitor": "竞品", "consumption": "消耗",
    "conventions": "约定", "counting": "计数", "creation": "创作", "creator": "创建工具",
    "credit": "信用", "crypto": "加密", "cryptography": "密码学", "curriculum": "课程",
    "datacenter": "数据中心", "datepicker": "日期选择器", "decimal": "小数", "definitions": "定义",
    "deeplink": "深度链接", "dependencies": "依赖", "derivatives": "衍生品", "dev": "开发",
    "diagrams": "图表", "diaries": "日记", "diffusion": "扩散", "downloader": "下载器",
    "effects": "效果", "elements": "元素", "english": "英语", "enhancement": "增强",
    "entity": "实体", "environment": "环境", "events": "事件", "exception": "异常",
    "execution": "执行", "exploration": "探索", "explorer": "浏览器", "expression": "表达式",
    "face": "字形", "fantasy": "奇幻", "feedback": "反馈", "fee": "手续费", "fiction": "小说",
    "files": "文件", "finder": "查找器", "flags": "开关", "formats": "格式", "frameworks": "框架",
    "freebies": "免费资源", "functions": "函数", "gambling": "博彩", "gas": "Gas",
    "generated": "生成", "generation": "生成", "generics": "泛型", "geolocation": "地理定位",
    "governance": "治理", "graphics": "图形", "graphing": "绘图", "grouping": "分组",
    "handling": "处理", "headers": "请求头", "importance": "重要性", "imports": "导入",
    "indexing": "索引", "information": "信息", "inline": "内联", "install": "安装",
    "instance": "实例", "integer": "整数", "intelligence": "智能", "internals": "原理",
    "intersection": "交集", "japanese": "日语", "journalism": "新闻", "jumping": "跳转",
    "landscape": "全景", "languages": "语言", "lifecycle": "生命周期", "lines": "行",
    "listener": "监听器", "literacy": "素养", "literature": "文学", "loader": "加载器",
    "locking": "锁定", "manager": "管理器", "manipulation": "操作", "matching": "匹配",
    "message": "消息", "method": "方法", "mitigation": "缓解", "mocking": "mock",
    "models": "模型", "module": "模块", "notes": "笔记", "official": "官方",
    "operations": "运维", "origin": "源", "outline": "轮廓", "palette": "调色板",
    "parsing": "解析", "party": "方", "phone": "电话", "photos": "照片", "plan": "方案",
    "pool": "池", "preparation": "准备", "processing": "处理", "profiler": "分析器",
    "properties": "属性", "protection": "保护", "queries": "查询", "query": "查询",
    "queue": "队列", "questions": "问题", "reactive": "响应式", "reader": "阅读器",
    "recharge": "充值", "recognition": "识别", "reference": "参考", "reload": "重载",
    "removal": "移除", "replace": "替换", "request": "请求", "resources": "资源",
    "retrieval": "检索", "route": "路由", "rules": "规则", "runner": "运行器",
    "sale": "销售", "save": "保存", "scale": "缩放", "scheme": "方案", "screen": "屏幕",
    "services": "服务", "selection": "选择", "sending": "发送", "shadow": "阴影",
    "shortcuts": "快捷键", "shortener": "短链工具", "side": "侧", "size": "尺寸",
    "snippet": "代码片段", "sortable": "可排序", "splitting": "拆分", "stack": "技术栈",
    "standards": "标准", "statistics": "统计", "strategy": "策略", "streams": "流",
    "styles": "样式", "subscribe": "订阅", "switch": "切换", "switching": "切换",
    "systems": "系统", "table": "表格", "tags": "标签", "templates": "模板", "texts": "文本",
    "texturing": "纹理", "threads": "线程", "tier": "层级", "tools": "工具", "tour": "导览",
    "transformation": "转换", "transfer": "传输", "transition": "过渡", "translate": "翻译",
    "trees": "树", "types": "类型", "units": "单位", "usage": "用法", "users": "用户",
    "value": "值", "variance": "方差", "vectors": "矢量", "vesting": "解锁",
    "view": "视图", "viewport": "视口", "warning": "警告", "workers": "工作线程",
    "wrap": "换行", "writer": "写作工具", "yield": "收益",
}

CANONICAL = {
    "ai": "AI", "api": "API", "apis": "API", "css": "CSS", "devtools": "DevTools",
    "gif": "GIF", "gpu": "GPU", "html": "HTML", "ip": "IP", "js": "JS", "json": "JSON",
    "qr": "二维码", "sms": "短信", "ssh": "SSH", "tv": "电视", "ui": "UI", "url": "URL",
    "web": "Web",
}

REFINE = {
    "abroad": "海外", "accessor": "访问器", "actress": "女演员", "airdrops": "空投",
    "and": "与", "assembly": "汇编", "authority": "管理工具", "aware": "感知",
    "badges": "徽章", "bar": "条", "boosting": "提升", "border": "边境", "cap": "市值",
    "channel": "通道", "classes": "类", "commits": "提交", "complexity": "复杂度",
    "composables": "组合式函数", "conditions": "条件", "consulting": "咨询", "crack": "破解",
    "cracked": "破解", "cursor": "光标", "docs": "文档", "driven": "驱动", "dive": "解析",
    "ebooks": "电子书", "ecommerce": "电商", "ecosystem": "生态", "edge": "边缘",
    "ellipsis": "省略", "emitter": "触发器", "end": "端", "esoteric": "小众",
    "etymology": "词源学", "expense": "费用", "extensible": "可扩展", "fan": "粉丝",
    "farming": "挖矿", "faucet": "水龙头", "favicon": "网站图标", "fill": "填充",
    "fintech": "金融科技", "first": "优先", "fix": "修复", "flamegraph": "火焰图",
    "friendly": "友好", "front": "前端", "fullstack": "全栈", "funny": "趣味",
    "google": "Google", "hack": "破解", "hunting": "求职", "info": "信息",
    "internals": "原理", "internet": "Internet", "layer": "层", "liquidity": "流动性",
    "loop": "循环", "mask": "遮罩", "media": "媒体", "merged": "合并",
    "minifier": "压缩工具", "mode": "模式", "mouse": "鼠标", "neural": "神经",
    "obfuscation": "混淆", "onchain": "链上", "opener": "打开器", "orchestration": "编排",
    "paged": "分页", "phrase": "短语", "playground": "演练场", "preloading": "预加载",
    "prep": "准备", "primitive": "原语", "profile": "档案", "quantitative": "量化",
    "refresh": "刷新", "roots": "词根", "script": "脚本", "scrollbar": "滚动条",
    "site": "网站", "sites": "网站", "splash": "启动", "stable": "稳定",
    "stacking": "层叠", "staging": "暂存", "started": "入门", "stealth": "隐身",
    "stroke": "描边", "strong": "强类型", "synthesis": "合成", "tech": "技术",
    "temporal": "时序", "term": "期", "third": "第三", "to": "转", "toggle": "开关",
    "tracer": "追踪器", "traditional": "传统", "type": "类型", "typesafe": "类型安全",
    "typesafety": "类型安全", "use": "使用", "var": "变量", "virtualized": "虚拟化",
    "vision": "视觉", "vitals": "核心指标", "wide": "全局", "wired": "手绘风格",
    "shows": "节目", "way": "向", "writer": "写作工具",
}

PHRASE_OVERRIDES = {
    "broadcast-channel": "广播通道", "class-variance-authority": "样式变体管理",
    "commercial-use": "商业用途", "computer-vision": "计算机视觉", "content-aware": "内容感知",
    "control-value-accessor": "控件值访问器", "cross-border-ecommerce": "跨境电商",
    "cross-tab-communication": "跨标签页通信", "design-to-code": "设计稿转代码",
    "env-var-manager": "环境变量管理器", "event-driven": "事件驱动", "event-emitter": "事件触发器",
    "event-loop": "事件循环", "front-end-testing": "前端测试", "getting-started": "快速入门",
    "gradient-boosting": "梯度提升", "hand-drawn": "手绘", "has-pseudo-class": ":has 伪类",
    "here-document": "Here Document", "internet-explorer": "Internet Explorer",
    "japanese-actress": "日本女演员", "k-line-chart": "K 线图", "long-term-memory": "长期记忆",
    "multi-line-ellipsis": "多行省略", "national-geographic": "国家地理",
    "neural-network": "神经网络", "pull-to-refresh": "下拉刷新", "receive-sms-online": "在线接收短信",
    "rug-pull": "项目跑路", "scroll-to-error": "滚动至错误处", "search-and-replace": "搜索替换",
    "seed-phrase": "助记词", "show-more": "展开更多", "speech-synthesis": "语音合成",
    "stable-diffusion": "Stable Diffusion", "static-site-generator": "静态网站生成器",
    "strong-typing": "强类型", "study-abroad": "留学", "tail-call-optimization": "尾调用优化",
    "text-to-image": "文生图", "text-to-video": "文生视频", "third-party-scripts": "第三方脚本",
    "two-way-binding": "双向绑定", "utility-first": "实用工具优先", "web-based": "Web 应用",
    "web-to-desktop": "Web 转桌面端", "word-roots": "词根", "yield-farming": "流动性挖矿",
}

FINAL_OVERRIDES = {
    "automated-eda": "EDA 自动化", "bn-js": "bn.js", "chain-id": "链 ID",
    "blockchain-demo": "区块链演示", "blockchain-media": "区块链媒体", "book-collection": "书籍合集",
    "box-shadow": "CSS 阴影", "brave-search": "Brave Search", "broadcast-channel": "Broadcast Channel",
    "browser-based": "浏览器端", "canvas-fingerprint": "Canvas 指纹", "carbon-design-system": "Carbon Design System",
    "casino": "赌场", "chinese-classical-texts": "中国古籍", "chinese-colors": "中国传统色",
    "chinese-entertainment": "国内影视", "chinese-journalism": "中国新闻", "chinese-literature": "中国文学",
    "chunked-upload": "分片上传", "clipboard-manager": "剪贴板管理器", "cloud-drive": "网盘搜索",
    "code-exploration": "代码探索", "code-importance": "代码重要性", "codebase-indexing": "代码库索引",
    "command-menu": "命令菜单", "crash-dump": "崩溃转储",
    "cs-self-learning": "计算机自学", "cursor-position": "光标位置", "custom-scrollbar": "自定义滚动条",
    "definitely-typed": "DefinitelyTyped", "design-tip": "设计技巧", "developer-roadmap": "开发者路线图",
    "development-toolkit": "开发工具包", "di-container": "依赖注入容器", "download-stats": "下载统计",
    "e-reader": "电子阅读器", "es-modules": "ES 模块", "exposure-watch": "泄露监测",
    "find-locate": "文件查找", "gas-estimation": "Gas 估算", "headless-cms": "无头 CMS",
    "hot-list": "热门榜单", "image-upload": "图像上传", "immediate-mode": "即时模式",
    "immigration": "移民", "inpainting": "图像修复", "input-mask": "输入掩码",
    "input-method": "输入法", "input-value": "输入值", "intercepting": "拦截",
    "intermediate": "进阶", "layout-shift": "布局偏移", "learning-hub": "学习中心",
    "linear-gradient": "线性渐变", "liquid-staking": "流动性质押", "logo-maker": "Logo 制作",
    "lottery": "彩票", "loyalty-program": "会员忠诚度计划", "mime-type": "MIME 类型",
    "mnemonic": "助记词", "module-federation": "模块联邦", "mouse-events": "鼠标事件",
    "new-tokens": "新代币", "novel": "小说", "numerical-computing": "数值计算",
    "on-device-ai": "端侧 AI", "parallel-agents": "多 agent 并行", "persistent-vectors": "持久化向量",
    "podcast": "播客", "port-forwarding": "端口转发", "port-scanning": "端口扫描",
    "ppt-generation": "PPT 生成", "pre-commit": "提交前检查", "prop-types": "PropTypes",
    "qq-show": "QQ 秀", "quests": "任务", "readme": "README", "reproducible-builds": "可复现构建",
    "running-elements": "运行元素", "scroll-snap": "滚动吸附", "seam-carving": "接缝裁剪",
    "silent-login": "静默登录", "split-view": "分栏视图", "starter-kit": "启动套件",
    "structural-patterns": "结构型模式", "symmetry": "对称", "tainted-canvas": "污染 Canvas",
    "television": "电视", "token-launchpad": "代币发行平台", "transpiler": "转译器",
    "type-definitions": "类型定义", "type-library": "类型库", "type-system": "类型系统",
    "url-friendly": "URL 友好", "us-proxy": "美国代理", "virtualized-table": "虚拟化表格",
    "visual-mode": "可视模式", "window-opener": "窗口打开器", "wireframing": "线框设计",
    "yield-layer": "收益层",
}


def translate_tag(tag: str) -> str:
    lowered = tag.lower()
    if lowered in PROFESSIONAL:
        return tag
    tokens = [token for token in re.split(r"[-_/.@ ]+", lowered) if token]
    translated: list[str] = []
    for token in tokens:
        if token in CANONICAL:
            translated.append(CANONICAL[token])
        elif token in EXTRA:
            translated.append(EXTRA[token])
        elif token in PRESERVE_WORDS or token in PROFESSIONAL:
            translated.append(CANONICAL.get(token, token))
        elif token in WORDS:
            translated.append(WORDS[token])
        else:
            translated.append(token)

    result = ""
    for part in translated:
        if result and (result[-1].isascii() or part[0].isascii()):
            result += " "
        result += part
    return result or tag


def refine_tag(tag: str) -> str:
    lowered = tag.lower()
    if lowered in PHRASE_OVERRIDES:
        return PHRASE_OVERRIDES[lowered]
    tokens = [token for token in re.split(r"[-_/.@ ]+", lowered) if token]
    translated: list[str] = []
    for token in tokens:
        if token in REFINE:
            translated.append(REFINE[token])
        elif token in CANONICAL:
            translated.append(CANONICAL[token])
        elif token in EXTRA:
            translated.append(EXTRA[token])
        elif token in PRESERVE_WORDS or token in PROFESSIONAL:
            translated.append(CANONICAL.get(token, token))
        elif token in WORDS:
            translated.append(WORDS[token])
        else:
            translated.append(token)
    result = ""
    for part in translated:
        if result and (result[-1].isascii() or part[0].isascii()):
            result += " "
        result += part
    return result or tag


def main() -> None:
    lines = REVIEW.read_text(encoding="utf-8").splitlines()
    filled = 0
    output: list[str] = []
    pattern = re.compile(r"^(- `([^`]+)` .+ \| 最终标签：)(.*)$")
    for line in lines:
        match = pattern.match(line)
        if not match:
            output.append(line)
            continue
        tag = match.group(2)
        final = match.group(3).strip()
        if tag.lower() in FINAL_OVERRIDES:
            output.append(f"{match.group(1)}{FINAL_OVERRIDES[tag.lower()]}")
        elif not final:
            output.append(f"{match.group(1)}{refine_tag(tag)}")
            filled += 1
        elif final == translate_tag(tag):
            output.append(f"{match.group(1)}{refine_tag(tag)}")
        else:
            output.append(line)
    REVIEW.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(f"filled={filled}")


if __name__ == "__main__":
    main()
