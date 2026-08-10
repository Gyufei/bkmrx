## bkmr 的搜索可以支持哪些参数呢，给我详细列举一下 bkmr search，bkmr hsearch 有哪些使用方法和参数

下面把 bkmr 的两个搜索命令的参数和用法详列出来（直接、完整、带示例）。先给结论：bkmr search 支持丰富的 FTS + 标签过滤 + 交互选项（包括 --fzf）；bkmr hsearch 是混合（hybrid）检索，将全文检索与语义检索用 RRF 融合，并提供类似的标签过滤、交互和 JSON 输出选项。

提醒（工具搜索说明）：我基于仓库源码（bkmr/src/cli/args.rs 等）收集了这些参数。注意搜索结果可能不完整；如需查看更多代码请到仓库搜索页面查看（例如 https://github.com/sysid/bkmr/search?q=fzf ）。

1) bkmr search — 参数与含义
用法概览： bkmr search [FTS_QUERY] [选项...]

参数列表（按类别）

- 基本文本/标签过滤
  - fts_query: 可选的位置参数，全文检索查询（FTS）。
  - -e, --exact <tags>: 精确匹配标签（逗号分隔）。
  - --exact-prefix <prefixes>: 与 --exact 联合使用时给标签做前缀匹配。
  - -t, --tags <tags>: 必须包含所有这些标签（逗号分隔）。
  - --tags-prefix <prefixes>: 与 --tags 联合时使用前缀匹配。
  - -T, --Tags <tags>: 排除（如果条目包含所有这些标签则排除）。
  - --Tags-prefix <prefixes>: 与 --Tags 联合使用的前缀选项。
  - -n, --ntags <tags>: 必须包含任意这些标签（ANY，逗号分隔）。
  - --ntags-prefix <prefixes>: 与 --ntags 联合的前缀选项。
  - -N, --Ntags <tags>: 排除如果条目包含任一这些标签（ANY 排除）。
  - --Ntags-prefix <prefixes>: 与 --Ntags 联合的前缀选项。
  - --embeddable: 仅显示可嵌入（embeddable）条目（用于语义搜索相关标记/流）。
  - --interpolate: 在展示结果时处理模板插值（注意：FZF 模式和 bookmark 操作会自动插值，不需要手动使用）。

- 排序 / 限制 / 输出
  - -o, --descending: 降序（如果未指定 --sort，则暗含 --sort modified）。
  - -O, --ascending: 升序（如果未指定 --sort，则暗含 --sort modified）。
  - --sort <field>: 指定排序字段：id, title, modified（默认 id）。默认排序方向规则：若未用 -o/-O，id/title 默认升序，modified 默认降序。
  - -l, --limit <n>: 限制结果数。
  - --np: no prompt（不进入交互提示/非交互模式）。
  - --json: 非交互模式下输出 JSON（以机器可读格式输出整个结果集）。

- 交互 / fzf 相关
  - --fzf: 使用 fuzzy finder（交互式选择）。内建快捷键行为：ENTER 打开、CTRL‑E 编辑、CTRL‑D 删除、CTRL‑A 克隆、CTRL‑P 显示详情、CTRL‑O / CTRL‑Y 复制等。
  - --fzf-style <FZF_STYLE>: fuzzy finder 风格：classic 或 enhanced（默认 classic）。enhanced 会使用右侧预览窗等更丰富的展示。
  - --stdout: 在选择时将选中条目的内容输出到 stdout（适合脚本管道），而不是执行默认动作。
  - --shell-stubs: 为 shell 脚本类型的 bookmark 输出 shell function stub（并会自动过滤为 _shell_ 类型）。
  - --non_interactive / --np: 见上（不弹提示，通常与 --json 或直接打印 ids 一起用）。

- 其它/实用
  - --limit 同上
  - 传递到 open/edit 的其他开关在其它子命令中描述（例如 open 有 --no-edit, --stdout 等）

示例
- 基本全文检索并列出：
  - bkmr search "docker compose"
- 用标签必须同时包含 tag1 和 tag2：
  - bkmr search -t tag1,tag2
- 排除带有某些标签：
  - bkmr search --Ntags imported,_snip_
- 交互式 fuzzy 查找并使用 enhanced 预览：
  - bkmr search --fzf --fzf-style enhanced
- 非交互 JSON 输出，限制 10 条：
  - bkmr search "kubernetes" --json -l 10
- 只输出选中内容到 stdout（适合集成脚本）：
  - bkmr search --fzf --stdout

2) bkmr hsearch — 参数与含义
用途：Hybrid search，将全文检索与语义检索用 Reciprocal Rank Fusion (RRF) 融合，用于提升相关性。

基本用法： bkmr hsearch <query> [选项...]

参数列表

- 必填位置参数
  - query: 要搜索的文本查询（必填）。

- 标签过滤（与 search 相似）
  - -t, --tags: 必须包含所有这些标签（逗号分隔）。
  - -T, --Tags: 排除如果包含所有这些标签。
  - -n, --ntags: 必须包含任意这些标签。
  - -N, --Ntags: 排除如果包含任一这些标签。
  - -e, --exact: 精确标签匹配（逗号分隔）。

- 模式 / 限制 / 输出
  - --mode <mode>: 搜索模式，默认 "hybrid"。可选值见实现：hybrid 或 exact（exact 会只做精确匹配模式）。
  - -l, --limit <n>: 限制结果数。
  - --json: 输出 JSON（注意：JSON 输出中包含 rrf_score 字段，表明混合得分）。
  - --fzf: 使用 fzf 进行交互选择（如果交互选择需要，hsearch 支持同样的 fzf 行为）。
  - --stdout: 将选中项输出到 stdout（适合脚本）。
  - --np: no prompt（不弹交互提示）。

示例
- 混合检索：
  - bkmr hsearch "deploy to production"
- 带标签过滤和限制：
  - bkmr hsearch "docker" -t devops --limit 5
- 以 exact 模式运行（只做精确模式）：
  - bkmr hsearch "TODO" --mode exact
- 交互式选择并将选中内容打印到 stdout：
  - bkmr hsearch "connection pool" --fzf --stdout
- JSON 输出查看 rrf_score：
  - bkmr hsearch "authentication" --json

额外提示 / 行为说明
- fzf 模式与普通模式的区别：fzf 会把每个 bookmark 包装为 SkimItem（在源码中实现为 FzfBookmarkItem），显示自定义的 display_text 和 preview；按键处理在 skim 返回后由程序处理（打开/编辑/删除等）。fzf-style = enhanced 会启用右侧或更丰富的预览窗口。
- --interpolate 会对展示中的模板变量进行渲染（例如 URL 中的 {{var}}），通常 FZF 模式和 bookmark 执行会自动 interpolated，所以平时不必显式使用。
- --stdout 非交互化场景常用：把内容输出以便被管道/脚本消费。
- limit 会限制上层返回到展示层的条目数（能减少交互启动时的项目数）。
- hsearch 的 JSON 输出包含 rrf_score，便于调试和自动化消费混合排序分数。
- 全局选项：CLI 还有若干全局参数（config 文件指定 --config, 指定 DB 文件 --db, 关闭颜色 --no-color, debug 级别 -d/-dd 等），这些影响所有子命令。

3) 我可以帮你做的下一步（选择一项）
- 给你生成若干常见命令的示例脚本（例如把 hsearch 结果直接 feed 到 fzf 的自动化脚本）。
- 帮你在仓库中添加一个新的 fzf 风格（例如 --fzf-style mystyle），并创建 patch/PR（需要我在仓库上创建分支并提交）。
- 演示如何把 sem-search / hsearch 的 top-N 结果预先排序后交给 fzf（示例代码片段）。

要不要我现在
- 我可以把上面关键的用例示例写成 README 风格的命令段，或按你的需要生成实际命令脚本 / 补丁。你想先要哪个？
