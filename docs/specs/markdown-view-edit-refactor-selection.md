# Markdown 查看/编辑重构：技术选型与交接

> 状态：选型结论已形成，尚未进入实现
> 日期：2026-07-24
> 目标读者：后续负责设计、计划或实现的 agent / 开发者

## 1. 背景与目标

当前桌面端使用 Milkdown Crepe 作为常驻 WYSIWYG Markdown 编辑器。每次打开笔记都会初始化完整编辑器、绑定内容更新监听并维护自动保存状态。现有架构及笔记模块位置见 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)。

用户是熟练 Markdown 使用者，能够直接阅读源码，且使用模式明显偏向“阅读多、编辑少”。因此本次重构的目标不是继续优化 WYSIWYG，而是改成：

- 打开或切换笔记时固定进入查看态；
- 查看态使用纯 Markdown 解析展示组件，不创建编辑器实例；
- 通过 `Cmd/Ctrl + E` 临时进入或退出源码编辑态；
- 编辑态保留专业的纯文本 Markdown 编辑体验；
- 阅读样式优先保证美观、可读性、深色模式与应用主题一致；
- 只支持日常 Markdown：CommonMark 基础语法、围栏代码、表格和任务列表；
- 首版不支持数学公式、Mermaid、原始 HTML 或复杂扩展；
- 首版不引入语法高亮器。

## 2. 既有约束

- 前端是 React + TypeScript + Vite。
- 桌面端已使用 Tailwind CSS 4。
- 项目已直接声明 CodeMirror 6 及 `@codemirror/lang-markdown`。
- 当前自动保存由共享保存队列与 400ms 防抖实现，重构时应复用已有语义。
- 现有 Notes 后端命令、绝对路径契约及 frontmatter 行为不在本次范围内；相关约束见 [`docs/superpowers/specs/2026-07-24-notes-settings-refactor-design.md`](./superpowers/specs/2026-07-24-notes-settings-refactor-design.md)。
- 当前 `remark-gfm`、`micromark` 仅由 Milkdown 间接引入。若新查看态采用它们，必须声明为直接依赖，不能依赖临时的传递依赖。

## 3. 解析与展示路线对比

### 3.1 `react-markdown + remark-gfm`

`react-markdown` 将 Markdown 转为 React 元素，不需要通过 `dangerouslySetInnerHTML` 注入 HTML。配合 `remark-gfm` 后可覆盖表格、任务列表、删除线和自动链接；围栏代码属于基础 Markdown。

优点：

- 与当前 React 技术栈天然匹配；
- 默认不执行 Markdown 中的原始 HTML，安全边界清晰；
- 可通过 `components` 定制链接、表格、代码块、checkbox 等元素；
- 不需要额外 HTML 清洗链；
- 测试时可以直接断言 React DOM；
- 后续扩展仍可沿 remark/rehype 生态进行。

缺点：

- 依赖数量和纯解析器相比更多；
- 不是追求最小 bundle 的极限方案；
- 引入任意 rehype 插件时仍需重新评估安全性。

判断：综合安全性、React 集成、可维护性和样式自由度，最适合本项目。

参考：

- [react-markdown](https://github.com/remarkjs/react-markdown)
- [remark-gfm](https://www.npmjs.com/package/remark-gfm)

### 3.2 `marked + DOMPurify`

`marked` 是零依赖的低层 Markdown-to-HTML 编译器，API 小并以快速解析为主要卖点。GFM 常用能力可直接覆盖。

优点：

- 解析器本身轻量、零依赖；
- API 简单；
- 性能好；
- 适合只需要 HTML 字符串的场景。

缺点：

- 官方明确说明输出 HTML 不做消毒；
- 在 React 中通常需要 `DOMPurify` 和 `dangerouslySetInnerHTML`；
- 自定义单个 Markdown 元素不如 React 组件映射自然；
- 加入消毒库后，“零依赖、极致轻量”的优势会缩小；
- 本地笔记未来可能来自同步、导入或下载，不能默认全部可信。

判断：如果未来经过真实 bundle 与性能测量，确认 `react-markdown` 是瓶颈，可作为备选；不应仅凭“零依赖”优先采用。

参考：

- [Marked 官方文档](https://marked.js.org/)
- [Marked npm 包](https://www.npmjs.com/package/marked)

### 3.3 `markdown-it + task-list 插件`

`markdown-it` 是成熟、快速、可扩展的 Markdown-to-HTML 解析器。表格和删除线内置，任务列表通常需要插件。

优点：

- CommonMark 支持成熟；
- 可细粒度启用或禁用规则；
- 默认关闭原始 HTML并限制危险链接协议；
- 插件生态成熟；
- 官方基准显示其 CommonMark 模式与 `marked` 属于同一性能档位。

缺点：

- 最终仍输出 HTML 字符串；
- React 集成与安全边界不如 `react-markdown` 直接；
- checkbox 需要额外插件；
- 对当前简单需求没有足以抵消集成成本的优势。

判断：可用但不优先。

参考：

- [markdown-it 官方文档与基准](https://markdown-it.github.io/markdown-it/)

### 3.4 直接使用 `micromark`

`micromark` 是底层 tokenizer，更适合作为统一处理链的基础设施，而非开箱即用的展示组件。

优点：

- 底层、精确、可组合；
- 是 remark 生态的解析基础之一。

缺点：

- 不直接解决 React 展示；
- 仍需自行组合 AST、GFM 扩展和 React/HTML 转换；
- 对本项目属于重复搭建 `react-markdown` 已提供的处理链。

判断：不采用。

### 3.5 Rust 后端解析

可在 Tauri Rust 后端解析 Markdown，再通过 IPC 返回 HTML 或结构化结果。

优点：

- 解析工作不占 WebView 主线程；
- 可使用 Rust Markdown 生态。

缺点：

- 增加 IPC 和前后端协议；
- HTML 安全问题仍然存在；
- 查看组件定制更加间接；
- 普通笔记解析耗时不足以证明这层复杂度合理。

判断：过度设计，不采用。

### 3.6 开箱即用的 Markdown Preview 全家桶

候选包括 `@uiw/react-markdown-preview` 等集成组件。

优点：

- 开箱即用；
- 通常已包含主题和部分代码高亮。

缺点：

- 带入未必需要的样式、依赖与行为；
- 更难精确匹配现有应用主题；
- 阅读、解析和高亮常被再次耦合；
- 本项目需求简单，自行组合基础组件更清晰。

判断：不采用。

## 4. 编辑器路线对比

### 4.1 CodeMirror 6

优点：

- 项目已直接依赖相关模块；
- 支持 Markdown 语法、搜索、撤销、选区、缩进和长文本编辑；
- 模块化，明显轻于 Monaco；
- 可通过动态 `import()` 只在首次进入编辑态时加载；
- 比自己持续增强 `textarea` 更可靠。

缺点：

- 比原生 `textarea` 更重；
- 初始化和主题适配需要少量封装；
- 动态加载时需提供短暂 loading/focus 处理。

判断：采用。

### 4.2 原生 `textarea`

优点：

- 浏览器原生能力，初始代码和运行时依赖最少；
- 适合短评论、标题或极少量文本修改。

缺点：

- Tab 缩进、选区缩进、搜索、撤销体验、长文档滚动等很快需要自行补齐；
- 自动增高适合表单，不适合占满主内容区的长笔记；
- 逐步增加补丁后会演化成一个质量较差的自制编辑器。

判断：不适合完整 Markdown 笔记。

### 4.3 Monaco

优点：

- IDE 级能力完整；
- 大型代码编辑场景成熟。

缺点：

- 体积、Worker 与初始化成本对当前需求过高；
- Markdown 笔记不需要其大部分能力。

判断：不采用。

## 5. 阅读排版路线

### 5.1 `@tailwindcss/typography`

Tailwind Typography 专用于给 Markdown/CMS 等无法逐元素添加 utility class 的内容提供排版默认值。它与 Markdown 解析器相互独立。

项目当前已使用 Tailwind CSS 4，但尚未安装 Typography 插件。Tailwind 4 可在主 CSS 中通过 `@plugin "@tailwindcss/typography";` 注册。

优点：

- `prose` 提供经过设计的标题、正文、列表、引用、表格和代码排版；
- 支持 `dark:prose-invert`；
- 可使用 `prose-a:*`、`prose-headings:*` 等元素修饰符；
- 可通过 CSS 变量对齐应用主题；
- 主要生成 CSS，不增加运行时 Markdown 解析链；
- 视觉收益高，架构成本低。

缺点：

- 默认值仍需针对产品主题调整；
- 表格横向滚动、任务 checkbox 和代码块通常需要少量覆盖；
- 默认正文宽度需结合右侧内容区验证。

判断：采用，作为查看态视觉基线。

参考：

- [Tailwind Typography 官方文档](https://github.com/tailwindlabs/tailwindcss-typography)

### 5.2 完全手写 Markdown CSS

优点：

- 对每个元素拥有完全控制；
- 无插件依赖。

缺点：

- 需要自行维护完整排版比例、深色模式和元素边界；
- 容易遗漏表格、嵌套列表、引用、行内代码等组合；
- 当前已有 Tailwind，重复造轮子价值低。

判断：仅用少量手写覆盖补充 Typography，不从零重写。

## 6. 代码高亮路线

### 6.1 首版不做语法高亮

围栏代码先渲染为样式良好的 `<pre><code>`，保留语言 class，但不加载高亮器。

优点：

- 最小实现与最小运行时成本；
- 普通 Markdown 代码仍然清晰可读；
- 可先测量用户是否真的需要高亮。

判断：采用。

### 6.2 Shiki

Shiki 可提供接近 VS Code 的 TextMate 语法高亮，但不能将其笼统描述为“极致轻量”。官方资料显示完整和 Web bundle 较大；性能敏感场景需要细粒度 bundle、按语言加载并复用 highlighter 实例。

适用条件：

- 用户明确需要高质量语法高亮；
- 只加载有限语言与主题；
- highlighter 单例缓存；
- 必要时使用 Worker，避免阻塞主线程。

判断：未来可选，不进入首版。

参考：

- [Shiki bundle 指南](https://shiki.style/guide/bundles)
- [Shiki 性能指南](https://shiki.style/guide/best-performance)

### 6.3 轻量客户端高亮器

Prism、highlight.js 等可作为未来替代方案，但仍会增加语言包、主题和 DOM 转换成本。在没有明确高亮需求前不选型。

## 7. 最终决策

采用以下组合：

```text
查看态：
  react-markdown
  + remark-gfm
  + @tailwindcss/typography
  + 少量产品主题覆盖

编辑态：
  CodeMirror 6
  + @codemirror/lang-markdown
  + 动态加载

首版不包含：
  原始 HTML
  数学公式
  Mermaid
  Shiki 或其他语法高亮器
  解析缓存
```

选择原因：

1. 与现有 React、Tailwind 和 CodeMirror 技术栈一致。
2. 查看态不初始化 Milkdown，可直接消除主要不必要开销。
3. `react-markdown` 默认安全并便于组件级定制。
4. `remark-gfm` 精确覆盖表格和任务列表需求。
5. Typography 以很低的架构成本提供明显更好的阅读样式。
6. CodeMirror 已存在，不需要为追求理论上的极小体积退回 `textarea`。
7. 将高亮、缓存和高级 Markdown 扩展延后，保持第一版最小。

## 8. 建议交互

- 打开或切换任意笔记：固定进入查看态。
- `Cmd/Ctrl + E`：
  - 查看态 → 动态加载并进入编辑态；
  - 编辑态 → flush 最新内容，成功后进入查看态并重新渲染。
- `Cmd/Ctrl + S`：编辑态立即保存，但不退出。
- `Escape`：只有在保存语义明确后才可作为退出快捷键；不得仅切换布尔状态。
- 进入编辑态后自动聚焦。
- 不应默认把光标移动到文末；至少恢复上次选区，理想情况下根据阅读滚动位置定位到相近段落。
- 查看态和编辑态各自保存滚动位置，避免切换后丢失上下文。
- 保存失败时保持编辑态，并展示可恢复的错误状态。

## 9. 建议阅读样式

- 使用 `prose prose-zinc dark:prose-invert` 作为基线。
- 正文居中并限制在约 `65–75ch`，不默认全宽铺满。
- 标题、链接、边框与应用现有 CSS 变量对齐。
- 表格外层支持横向滚动。
- 任务 checkbox 只读，不让查看态产生修改语义。
- 代码块先提供良好的背景、边框、内边距与横向滚动，不做语法高亮。
- 使用 Typography 的元素修饰符或少量 CSS 覆盖，不建立第二套完整 Markdown 主题系统。

## 10. 实现边界与风险

### 必须处理

- 切换文件时未到期的防抖保存必须 flush 到旧路径；
- 编辑态退出前不得丢失最新内容；
- 动态加载完成后正确聚焦；
- 原始 HTML保持禁用；
- 外部链接和本地相对链接/图片遵循桌面应用现有打开策略；
- 移除 Milkdown 前确认没有其他导入；
- 删除 Milkdown 后同步清理其样式、主题变量及只为它存在的依赖；
- 更新 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) 中过时的编辑器说明。

### 暂不处理

- 高级 Markdown 扩展；
- 编辑/查看同步滚动的像素级映射；
- 解析结果缓存；
- Worker 解析；
- 可交互任务 checkbox；
- 可配置解析器或编辑器。

## 11. 成功标准

- 打开笔记时只创建查看组件，不初始化 Milkdown/CodeMirror；
- 基础 Markdown、围栏代码、表格和任务列表正确展示；
- 明暗主题下正文均清晰可读；
- `Cmd/Ctrl + E` 可稳定往返切换；
- 编辑后切回查看态能看到最新保存内容；
- 快速切换文件或视图不会把内容保存到错误文件；
- 保存失败不会静默丢失编辑内容；
- 首版不加载语法高亮器；
- Milkdown 相关运行时代码和无用样式可被移除；
- 相关单元/组件测试与项目现有验证命令通过。

## 12. 不应直接照搬的说法

- 不应宣称 `marked + DOMPurify + Shiki` 的总 bundle 必然小于 30KB；这与 Shiki 官方 bundle 数据不符。
- 不应把“Notion、Obsidian、GitHub 都推荐”当成架构证据；这些产品的实际编辑模型并不一致。
- 不应仅根据解析器自己的基准决定选型；普通笔记中，编辑器初始化、代码高亮、重复读取和 DOM 数量往往更值得测量。
- 不应为了理论体积优势放弃当前已经具备的 CodeMirror 编辑能力。

## 13. 后续建议步骤

1. 基于本文写一份实现设计，明确组件边界、状态流和保存时序。
2. 在设计获批后写实施计划与测试清单。
3. 先以测试锁定查看/编辑切换和保存行为。
4. 实现 `MarkdownViewer` 和动态加载的源码编辑组件。
5. 引入 Typography 并完成视觉验证。
6. 迁移成功后再删除 Milkdown 及孤立依赖。
7. 使用真实长短笔记测量首次打开、切换文件和首次进入编辑态的耗时；只在有证据时继续优化。

## 14. Suggested skills

后续 agent 建议按阶段调用：

- `superpowers:brainstorming`：若需要重新讨论组件边界、快捷键或保存语义。
- `superpowers:writing-plans`：在实现前形成逐步、可验证的实施计划。
- `superpowers:test-driven-development`：先覆盖视图切换、保存 flush、文件切换与渲染能力。
- `superpowers:systematic-debugging`：出现保存竞态、焦点或滚动恢复问题时使用。
- `superpowers:verification-before-completion`：完成后运行验证并检查最终 diff。
- `project-aware-review`：确认实现符合本仓库既有 Notes、样式和保存队列约定。
- `open-code-review` 或 `superpowers:requesting-code-review`：实现完成后进行代码审查。
