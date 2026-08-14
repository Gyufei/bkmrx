# 书签自适应预览 v2 需求规格

## 1. 文档状态

- 状态：已确认，待实施
- 日期：2026-08-14
- 前置版本：`docs/specs/bookmark-web-preview-spec.md`
- 对应计划：`docs/plans/2026-08-14-bookmark-adaptive-preview.md`

本文档在现有 iframe 网页预览 Sheet 基础上增加后端预览决策、GitHub 仓库摘要和统一失败卡。未被本文明确修改的点击区域、访问计数、Sheet 覆盖范围、顶部栏、关闭方式、焦点恢复和 iframe sandbox 规则，继续沿用前置版本。

## 2. 背景与问题

现有预览对所有 HTTP(S) 地址直接创建 iframe。部分网站会通过 `X-Frame-Options` 或 CSP `frame-ancestors` 禁止嵌入；浏览器对跨域 iframe 的失败事件和错误详情暴露有限，可能触发 `load` 后仍显示空白。

GitHub 普通页面同时使用 `X-Frame-Options: deny` 和 CSP `frame-ancestors 'none'`，无法作为第三方 iframe 内容展示。继续把 iframe 当作任意网页的通用预览方式，会产生大面积无解释空白。

## 3. 目标

1. 后端统一决定一个书签应使用哪种预览方案。
2. GitHub 仓库使用 API 数据展示专属摘要，不再尝试 iframe。
3. 明确禁止嵌入、网络失败或不支持的地址使用统一失败卡，不留下空白区域。
4. 普通网页在后端未发现禁止条件时继续使用现有 iframe。
5. 前端只根据稳定的判别联合类型渲染 UI，不解析网站响应头或实现 Provider 识别。
6. 预览探测具备超时、重定向限制、缓存和 SSRF 防护。

## 4. 非目标

- 保证所有返回网页预览方案的网站都能在 iframe 中完成渲染。
- 绕过目标网站的 iframe 安全策略。
- 使用代理抓取、改写并重新托管目标网页。
- 第一阶段支持 GitHub 用户、Issue、Pull Request、Gist 等专属摘要。
- 第一阶段加载或渲染 GitHub README。
- 引入通用插件系统或运行时 Provider 注册机制。
- 替换为 Tauri 子 WebView。
- 管理 GitHub Token 或支持私有仓库认证。
- 持久化预览缓存到数据库。

## 5. 设计原则

### 5.1 后端生成预览方案，前端执行方案

后端负责 URL 校验、Provider 选择、外部请求、响应头分析和业务状态归类。前端负责调用后端、展示加载状态，并按照后端返回的 `kind` 渲染 GitHub 卡、iframe 或失败卡。

后端返回的网页方案表示“当前未发现明确的嵌入禁止条件，可以尝试 iframe”，不表示“保证渲染成功”。登录跳转、JavaScript 挑战、客户端脚本错误或 WebView 差异仍可能导致渲染失败。

### 5.2 预期失败是业务结果

网站拒绝嵌入、DNS 失败、超时、HTTP 错误、Provider 不支持和 GitHub API 限流均属于可展示的业务结果，必须返回 `fallback`，不能作为 Tauri command 异常抛给前端。

只有输入协议损坏、内部状态异常或无法构造响应等程序错误使用 `AppError`。

### 5.3 保持实现简单

第一阶段只实现两个明确分支：

- GitHub 仓库识别与摘要；
- 通用 HTTP(S) 网页探测。

Provider 通过普通的顺序分支或小型内部 trait 组织，以测试便利为准，不设计动态插件框架。

## 6. 系统边界与模块结构

新增独立 `preview` 领域，不把网络探测塞入现有 `BookmarkService`：

```text
BookmarkWebPreview
  -> prepare_bookmark_preview Tauri command
    -> PreviewService
      -> GitHub preview resolver
      -> Generic web preview resolver
        -> restricted HTTP client
```

建议文件：

```text
apps/desktop/src-tauri/src/preview/
  mod.rs
  model.rs
  service.rs
  github.rs
  web.rs
  security.rs
```

职责：

- `model.rs`：前后端 wire contract。
- `service.rs`：URL 规范化、分支编排、整体超时和缓存。
- `github.rs`：GitHub URL 识别、仓库路径提取和 API 映射。
- `web.rs`：通用网页请求、重定向和响应头判断。
- `security.rs`：协议、主机、IP 和重定向目标安全校验。
- `commands.rs`：只转发异步 command 调用。

## 7. 前后端协议

### 7.1 请求

```rust
pub struct PrepareBookmarkPreviewRequest {
    pub bookmark_id: i64,
    pub url: String,
}
```

首版同时传递 `bookmark_id` 和 `url`：

- `bookmark_id` 用于前端请求 key、日志关联和未来缓存演进；
- `url` 使用当前界面中的书签值，避免 PreviewService 与 BookmarkRepository 强耦合；
- 后端仍必须独立验证 URL，不能信任前端输入。

### 7.2 响应

```rust
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BookmarkPreview {
    Web {
        url: String,
        final_url: String,
    },
    GithubRepository {
        url: String,
        repository: GithubRepositoryPreview,
    },
    Fallback {
        url: String,
        reason: PreviewFallbackReason,
        message: String,
        http_status: Option<u16>,
    },
}
```

`GithubRepositoryPreview` 第一阶段字段：

```rust
pub struct GithubRepositoryPreview {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub owner_avatar_url: Option<String>,
    pub primary_language: Option<String>,
    pub stars: u64,
    pub forks: u64,
    pub topics: Vec<String>,
    pub default_branch: String,
    pub updated_at: String,
}
```

`PreviewFallbackReason` 使用稳定枚举值：

- `embedding_denied`
- `timeout`
- `dns_failure`
- `connection_failure`
- `http_error`
- `unsupported_protocol`
- `unsupported_provider_url`
- `provider_rate_limited`
- `provider_not_found`
- `provider_error`
- `unsafe_target`

`message` 是面向用户的中文说明。前端可根据 `reason` 选择图标和标题，但不得解析 `message` 决定逻辑。

## 8. 后端决策流程

### 8.1 通用入口

1. 解析并规范化 URL。
2. 只允许 `http:` 和 `https:` 进入预览准备流程。
3. 校验初始目标不属于禁止访问的本机或私有网络范围。
4. 识别 GitHub 仓库 URL；匹配时进入 GitHub 分支。
5. 其他地址进入通用网页分支。
6. 将结果按规范化 URL 写入短期内存缓存。

### 8.2 GitHub 分支

首版支持：

```text
https://github.com/{owner}/{repo}
https://github.com/{owner}/{repo}/...
```

仓库子路径统一归一到 `{owner}/{repo}` 的仓库摘要。必须排除 GitHub 保留路径和明显不代表仓库的地址，例如登录、设置、搜索和 Marketplace。

行为：

- 调用 GitHub REST repository API；
- 设置明确的 `User-Agent` 和 JSON `Accept`；
- 成功时映射为 `github_repository`；
- 404 映射为 `provider_not_found`；
- API 限流映射为 `provider_rate_limited`；
- 超时映射为 `timeout`；
- 其他上游错误映射为 `provider_error`；
- 不将 GitHub API 的原始错误正文直接展示给用户或写入普通日志。

非仓库 GitHub URL 返回 `unsupported_provider_url`，不回退 iframe，因为 `github.com` 已明确禁止嵌入。

### 8.3 通用网页分支

1. 使用受限 HTTP client 请求目标地址。
2. 最多跟随 5 次重定向，每次重定向前重新执行 SSRF 校验。
3. 优先使用可获取完整最终响应头的轻量请求；若站点不支持该方法，可在不读取大响应体的前提下回退。
4. 检查最终 HTTP 状态。
5. 检查 `X-Frame-Options`。
6. 检查 CSP `frame-ancestors`。
7. 明确禁止嵌入时返回 `embedding_denied`。
8. 请求失败时返回对应 `fallback`。
9. 未发现明确禁止条件时返回 `web` 和最终 URL。

`X-Frame-Options: sameorigin` 对本应用同样视为拒绝嵌入。没有 `frame-ancestors` 指令本身不构成拒绝；若响应中存在该指令，则必须结合 Tauri 页面实际 origin 判断是否允许嵌入，无法确认允许时按保守策略返回 `embedding_denied`。解析器必须有独立测试，不使用简单字符串包含代替结构化 token 判断。

## 9. 网络与安全约束

- 只允许 HTTP(S)。
- 禁止 loopback、私网、link-local、unspecified、multicast 等目标。
- DNS 解析所得全部地址都必须通过校验；任一连接目标不得在校验后被替换为内网地址。
- 每次重定向重新校验协议、主机和解析地址。
- 总超时建议 8 秒，单次连接超时建议 3 秒。
- 最多 5 次重定向。
- 不携带应用 Cookie、浏览器 Cookie、Authorization 或用户凭据。
- 限制响应体读取；通用网页探测不下载完整页面。
- 日志不得记录 Token、Cookie、Authorization 或完整上游响应体。
- GitHub API 第一阶段使用未认证访问。

### 9.1 GitHub API client 扩展边界

GitHub 请求必须封装在独立 client 中，resolver 不直接拼接请求或读取配置。client 构造时接受可选认证信息，并统一负责 API base URL、`User-Agent`、`Accept`、认证请求头、超时及上游错误读取限制。

第一阶段传入 `None`，不增加设置项，也不读取环境变量。后续加入 GitHub Key 时，只替换凭据来源并在 Tauri 启动时注入 client；`PreviewService`、`GithubRepositoryPreview`、Tauri command 和前端协议保持不变。Key 不得进入前端、普通日志、错误消息或缓存 key。

## 10. 缓存

- 使用进程内存缓存，不写数据库。
- key 使用规范化 URL。
- GitHub 成功结果 TTL：15 分钟。
- 通用网页结果 TTL：5 分钟。
- 网络失败和限流结果使用较短 TTL，建议 30 秒。
- 用户点击预览顶部栏“刷新”时绕过缓存并重新准备预览。
- 缓存必须有容量上限；第一阶段可使用简单固定上限和过期清理，不引入分布式或持久化缓存抽象。

## 11. 前端状态模型

预览组件状态：

- `preparing`：等待后端生成预览方案；
- `github_repository`：展示 GitHub 摘要卡；
- `web_loading`：已取得网页方案，iframe 正在加载；
- `web_ready`：iframe 已触发 `load`；
- `fallback`：展示统一失败卡；
- `unexpected_error`：Tauri command 自身异常，复用失败卡视觉。

每次请求使用 `bookmark.id + bookmark.url` 识别当前对象。切换书签或关闭 Sheet 后，旧请求结果不得覆盖新状态。

前端不执行以下行为：

- 不请求目标 URL 或 GitHub API；
- 不解析 URL 来选择 GitHub UI；
- 不读取或分析安全响应头；
- 不根据 iframe 内容判断跨域页面是否为空白。

iframe 仍保留 UI 级超时兜底。超时只表示“应用内渲染未按期完成”，不修改后端判定，也不声称目标 URL 本身不可访问。

## 12. 共用 Sheet 布局

顶部栏继续展示：

- 原始书签标题；
- 原始书签域名；
- “在浏览器中打开”；
- 刷新；
- 关闭。

Sheet 尺寸、覆盖范围和打开关闭交互保持不变。内容区域根据状态切换 iframe、GitHub 卡或失败卡，避免预览类型变化导致抽屉尺寸跳动。

## 13. GitHub 摘要卡

### 13.1 布局

- 内容区域桌面端左右内边距 48px；较窄尺寸降为 20–24px。
- 卡片顶部距离内容区 40–48px，不在整个抽屉内垂直居中。
- 卡片使用 `min-height: 128px`，由内容自然撑开，不写死 100px 高度。
- 卡片最大宽度跟随内容区域，不额外制造窄列。
- 卡片圆角、边框、背景和阴影使用现有语义化设计 token，兼容亮暗主题。

### 13.2 信息层级

- 左侧：owner avatar；无头像时使用 GitHub 图标或稳定占位符。
- 中间第一行：`owner / repository`。
- 中间第二行：单行描述，超出省略。
- 中间第三行：主要语言、Stars、Forks、更新时间。
- 右侧：“查看 GitHub”按钮。
- 窄尺寸下操作按钮换行并占满卡片宽度。
- 卡片下方显示低干扰说明：“GitHub 不允许应用内网页预览，已展示仓库摘要”。

Topics 首版仅在空间足够且不增加卡片高度失控时展示；默认可以不展示在主卡上，但数据保留在协议中。

## 14. 统一失败卡

失败卡与 GitHub 卡使用相同的外边距、顶部位置、圆角、边框和最小高度，建立一致的预览降级语言。

### 14.1 内容

- 左侧：与原因匹配的低干扰状态图标。
- 中间标题：简洁说明，例如“此网站不允许应用内预览”或“网页暂时无法连接”。
- 中间说明：展示后端返回的用户可读 `message`。
- 可选详情：域名、HTTP 状态码或稳定错误原因；不得展示底层堆栈、原始网络错误或敏感响应内容。
- 右侧主操作：“在浏览器中打开”。
- 次操作：“重试”，仅对超时、DNS、连接、HTTP 和 Provider 临时错误展示。

### 14.2 原因映射

- `embedding_denied`：标题“此网站不允许应用内预览”；主操作外部打开；通常不显示重试。
- `timeout`：标题“网页加载超时”；显示重试和外部打开。
- `dns_failure` / `connection_failure`：标题“网页暂时无法连接”；显示重试和外部打开。
- `http_error`：标题“网页返回错误”；展示安全的 HTTP 状态码；显示重试和外部打开。
- `unsupported_protocol` / `unsafe_target`：标题“此地址不能在应用内预览”；仅在协议安全时允许外部打开。
- `provider_rate_limited`：标题“GitHub 信息请求过于频繁”；显示稍后重试和外部打开。
- `provider_not_found`：标题“未找到 GitHub 仓库”；提供外部打开，不默认重试。
- `provider_error`：标题“暂时无法获取 GitHub 信息”；显示重试和外部打开。
- `unexpected_error`：标题“预览准备失败”；显示重试和外部打开，并通过现有错误日志记录内部信息。

### 14.3 布局约束

- 错误正文最多展示两到三行，避免卡片无限增高。
- 窄尺寸时操作区换行到卡片底部。
- 不使用大面积红色背景；错误色只用于图标或小范围强调。
- 不使用 toast 代替卡片。只要 Sheet 已打开，错误必须在 Sheet 内持续可见。

## 15. 刷新、外部打开与访问计数

- 打开预览仍按现有规则记录一次访问。
- 后端准备请求、缓存命中、GitHub API 调用和 iframe 加载不额外记录。
- 顶部栏刷新绕过后端缓存，并重新进入 `preparing`。
- GitHub 卡和失败卡中的重试同样绕过缓存。
- 顶部栏或卡片中的外部打开不重复记录访问。
- 外部打开失败时保留当前卡片，并使用现有 toast 补充说明。

## 16. 自动化测试

### 16.1 Rust

至少覆盖：

1. GitHub 仓库根路径和子路径识别。
2. GitHub 保留路径不被误识别为仓库。
3. GitHub API 成功、404、限流、超时和无效响应映射。
4. `X-Frame-Options: deny` 与 `sameorigin` 判断。
5. CSP `frame-ancestors` 常见允许与拒绝组合。
6. 重定向后的最终 URL 和安全头判断。
7. 非 HTTP(S)、loopback、IPv4/IPv6 私网和 link-local 拒绝。
8. 重定向到私网时拒绝。
9. DNS、连接、超时和 HTTP 状态映射。
10. 成功、失败 TTL 和强制刷新行为。
11. wire contract 序列化快照或等价精确断言。

网络测试必须使用本地可控 mock server 或注入式 HTTP adapter，不依赖真实 GitHub 和公网。

### 16.2 前端

至少覆盖：

1. 准备期间展示 loading。
2. `github_repository` 渲染指定字段和操作。
3. `web` 才创建 iframe。
4. `fallback` 不创建 iframe，并显示正确标题、说明和操作。
5. 不同 reason 对重试按钮的显示规则。
6. 刷新和重试调用后端并绕过缓存。
7. command 异常使用统一错误卡。
8. 快速切换书签时忽略旧请求结果。
9. 关闭后旧请求不能重新打开或污染状态。
10. iframe UI 超时切换到失败卡。
11. 外部打开与访问计数不重复。
12. GitHub 卡和失败卡在窄宽度下的语义结构保持完整。

## 17. 手工验证

在真实 Tauri 应用中验证：

- GitHub 公共仓库根地址；
- GitHub 仓库子页面；
- GitHub 非仓库页面；
- 明确设置 `X-Frame-Options` 或 CSP 的网站；
- 可正常 iframe 的 HTTPS 网站；
- DNS 不存在、连接拒绝、HTTP 404 和慢响应地址；
- 刷新、重试、快速切换书签、关闭 Sheet 和窗口缩放；
- 亮色与暗色主题；
- 约 320px 内容宽度下卡片重排。

## 18. 验收标准

1. 前端只调用一个后端预览准备方法并按 `kind` 渲染。
2. GitHub 仓库不创建 iframe，展示完整且紧凑的摘要卡。
3. 明确禁止嵌入和可归类的网络失败展示统一失败卡。
4. 普通网页在未发现禁止条件时继续使用现有 sandboxed iframe。
5. 任一预览路径都不会留下无说明的空白 Sheet。
6. 后端具备超时、重定向限制、响应读取限制、缓存和 SSRF 防护。
7. 预期网络失败不会作为 command 异常泄露给前端。
8. 快速切换和关闭不会产生过期响应覆盖。
9. 访问计数、外部打开、关闭、焦点恢复和原有书签操作无回归。
10. Rust、前端测试、TypeScript 检查、Rust 格式检查和构建通过。
