# RSS 阅读 V1 实施计划

本计划以 [RSS 阅读 V1 需求规格](./2026-08-19-rss-v1-spec.md) 为唯一产品范围。方案已于 2026-08-19 确认并进入实施；任务按依赖顺序推进，每项以自动化测试和构建验证收口。

## 1. 总体策略

- 优先复用当前 app 的迁移、错误、SSRF 防护、逐跳重定向、游标、UI 和 React Query 模式。
- RSS/Atom 语法统一交给 `feed-rs`，不自行实现 XML parser；V1 显式拒绝 JSON Feed。
- HTML 清洗交给成熟 sanitizer，不自行维护危险标签/属性黑名单。
- Folo 只作为 AGPL 架构参考；Rss_Reader_Tauri 只参考处理形式，V1 不逐行复制两个项目的源码。
- 每阶段必须保持现有功能测试可运行；高风险共享网络抽取单独提交，和 RSS 业务实现分离。

## 2. 任务依赖图

```text
T1 共享安全 HTTP 基础能力
 ├─→ T4 Feed Fetcher 与网页发现
 └─→ 书签预览回归验证

T2 RSS schema 迁移
 └─→ T6 Repository 与游标分页

T3 领域模型与 RSS/Atom Parser
 ├─→ T5 HTML 清洗与摘要
 └─→ T7 Service 刷新编排

T4 + T5 + T6
 └─→ T7 Service 刷新编排
      └─→ T8 Tauri 契约与前端查询层
           ├─→ T9 导航与三栏骨架
           ├─→ T10 添加/编辑/删除 Feed
           └─→ T11 文章列表与正文阅读
                └─→ T12 集成验收与审查
```

## 3. T1：抽取共享安全 HTTP 基础能力

### 目标

将当前书签预览中的 HTTP scheme 校验、DNS 公共地址校验、手动重定向和 host 地址绑定抽成与 `BookmarkPreview` 无关的通用模块，供书签预览和 RSS 共用。

### 工作

- 新增聚焦的通用安全网络模块，定义协议、DNS、私网、超时、HTTP 状态和重定向错误。
- 将 `parse_http_url`、公共 IP 判断和 `resolve_public_target` 的底层逻辑迁入通用模块。
- 提供逐跳请求 helper：禁用 reqwest 自动重定向，每跳重新解析、校验并绑定解析地址。
- 书签预览 adapter 将通用错误继续映射为原有 `BookmarkPreview::Fallback`，保持现有 UI 契约不变。
- 通用 helper 支持调用方配置超时、重定向上限和响应读取策略；不把 RSS 语义写入共享模块。

### 先写测试

- 拒绝 file、localhost、IPv4/IPv6 私网、链路本地、组播和未指定地址。
- 接受合法 HTTP/HTTPS 公共地址。
- 每个重定向目标都重新校验；公共地址重定向到内网时拒绝。
- 超过重定向上限返回稳定错误。
- 书签预览原有 scheme、私网、超时、重定向和 fallback 测试保持通过。

### 验证

- 运行 preview 单测及书签预览集成测试。
- 确认该任务不改变 RSS 以外功能表现。

## 4. T2：数据库 schema 与迁移

### 工作

- 新增连续 schema 迁移版本，创建 `rss_feeds` 和 `rss_entries`。
- 增加唯一约束、级联外键及列表查询所需索引。
- 已有数据库升级只新增 RSS schema，不改变书签、Todo 及标签数据。
- 使用现有 migration runner 的事务和 `user_version` 更新，不写运行时 `column_exists` 式迁移。

### 先写测试

- 新数据库包含完整 RSS 表、字段、外键、唯一约束和索引。
- 当前版本升级后保留全部旧数据。
- 重复 Feed URL 和重复 `(feed_id, dedupe_key)` 被约束拒绝。
- 删除 Feed 级联删除 Entry。
- 迁移失败回滚并保持原 schema version。

### 验证

运行 migration 与 database repository 全量测试。

## 5. T3：领域模型与 RSS/Atom Parser

### 依赖

新增并锁定兼容当前 Rust toolchain 的 `feed-rs`。复用其统一 parser/model API，不复制 Rss_Reader_Tauri parser 源码。

### 工作

- 新增 Feed、Entry、Preview、RefreshResult、查询和游标领域模型。
- parser 接收字节、最终 Feed URL 和抓取时间，通过 `feed-rs` 输出统一 Feed 与 Entry 草稿。
- 将 `feed-rs` 的 content、summary、links、authors、published/updated 和 id 映射到领域模型。
- 解析 Feed 站点地址、alternate link 和稳定条目标识。
- 使用现有 `url` crate 规范化 URL 并生成稳定 dedupe key。
- 无发布时间保持空值，禁止用 `Utc::now()` 冒充发布时间。

### 测试 fixture

- RSS 2.0：content:encoded、description、GUID、enclosure、Dublin Core 日期。
- Atom：content、summary、alternate、author、published/updated。
- 相对链接、协议相对链接、缺失标题/链接/GUID/日期。
- malformed XML、非 RSS/Atom XML、重复条目。
- dedupe key 的 GUID、链接和哈希三级回退。

### 验证

运行 parser 单元测试，fixture 不访问网络。

## 6. T4：Feed Fetcher 与网页自动发现

### 依赖

- 复用 T1 安全 HTTP 模块。
- 使用 `scraper` 的 selector API 解析 HTML，不复制 Rss_Reader_Tauri 的字符串 HTML 重建代码。

### 工作

- 实现 15 秒总超时、最多 5 跳、5 MB 解压后响应上限的流式读取。
- 根据 Content-Type 和内容尝试 RSS/Atom 解析。
- 普通 HTML 只发现 `link[rel~=alternate]` 且类型为 RSS/Atom 的链接。
- 使用最终网页 URL 解析相对 Feed URL，去重发现结果并保留文档顺序。
- 单个发现结果直接预览；多个结果返回候选列表；零结果返回稳定错误。
- 返回 `source_url`、最终 `feed_url`、HTTP 状态和可诊断错误，不记录正文。

### 先写测试

- 直接 RSS、直接 Atom、单个/多个/零个 HTML alternate。
- 相对 URL、重复 alternate、非 RSS 类型 link。
- 5 MB 边界、超时、HTTP 错误、5/6 次重定向。
- 每跳 SSRF 校验及公共转私网拒绝。
- 不启动浏览器、不猜测常见路径。

### 验证

使用本地测试 server 完成网络集成测试，不依赖公网。

## 7. T5：HTML 清洗、相对 URL 与摘要

### 依赖

选择成熟 Rust sanitizer crate；实施时在 Cargo lock 前核对其维护状态、许可证和 allowlist API。优先评估 `ammonia`，不实现自定义 sanitizer。

### 工作

- 在入库前用文章 URL 或 Feed/站点 URL 解析链接与图片相对地址。
- 配置最小可读正文标签/属性 allowlist。
- 移除 iframe、script、object、embed、form、事件属性、危险 style 和危险协议。
- 只保留安全 HTTP/HTTPS 链接与 HTTPS 图片，为链接增加安全外部打开语义，为图片增加 lazy 属性。
- 从清洗后的 DOM/纯文本生成摘要，合并空白并按字符边界截断约 140 字符。

### 先写测试

- XSS 标签、事件属性、javascript/data/file 协议和 CSS 注入被移除。
- 合法标题、段落、列表、代码、引用和 HTTPS 图片保留。
- 相对链接、根路径、协议相对地址正确解析。
- 中文、emoji、HTML entity 和多空白摘要不会在非法 UTF-8 边界截断。

### 验证

运行 sanitizer/summary 单测，并保存一组真实但脱敏的 Feed HTML fixture。

## 8. T6：Repository、Upsert 与游标分页

### 工作

- 实现 Feed 查询、创建、重命名、刷新状态更新、删除和文章数量。
- 在单一事务中插入 Feed 与首批 Entry。
- 刷新 upsert 更新远程字段并保留 `is_read`。
- 实现全部、未读和单 Feed 三种查询模式，每批固定 30 条。
- 复用现有版本化 Base64 URL-safe 游标处理形式，提取通用 encode/decode helper；RSS cursor 使用 `sort_at + id` 并绑定查询 hash。
- 实现未读总数和按 Feed 未读数；实现单篇已读/未读切换。
- SQL 全部参数化，稳定排序使用 `COALESCE(published_at, fetched_at) DESC, id DESC`。

### 先写测试

- 确认添加原子性和重复 URL 冲突。
- upsert 更新正文等远程字段但保留已读状态。
- 全部、未读、单 Feed 查询和 30 条分页正确。
- 相同时间文章跨页无重复、无遗漏，错误查询 cursor 被拒绝。
- 未读计数随状态和删除正确变化。
- 删除 Feed 返回文章数并级联清理。

### 验证

运行 RSS repository 集成测试及现有数据库回归测试。

## 9. T7：Service 与刷新编排

### 工作

- 实现预览订阅、确认添加、编辑显示名、删除、查询列表、标记已读。
- 实现按 15 分钟成功时间筛选 stale Feed。
- 刷新全部使用并发上限 4；同一 Feed 的重复刷新复用进行中任务。
- 单 Feed 失败不取消其他任务，不自动重试。
- 成功清除旧错误并写成功时间；失败只写失败时间和稳定错误。
- 汇总总 Feed、新增文章、更新文章和失败数。
- 只有成功 mutation 才发送独立 `rss-changed` 事件。

### 先写测试

- 预览失败、重复确认和事务失败不留下数据。
- 15 分钟边界、从未成功和最近失败 Feed 的 stale 判断正确。
- 最大并发数为 4，同 Feed 只执行一次网络请求。
- 部分失败仍完成其他 Feed，汇总准确。
- 成功/失败时间与错误清理语义正确。

### 验证

使用 fake fetcher/repository 做 service 单测，避免测试依赖真实网络与时钟。

## 10. T8：Tauri Commands、TypeScript 契约与 React Query

### 工作

- 注册 RSS state/service 与薄 commands。
- 增加 TypeScript Feed、Entry、Preview、Page、RefreshSummary 和错误类型。
- 在现有 invoke 边界增加 RSS adapter。
- 建立独立 RSS query key namespace，区分全部、未读和单 Feed cursor。
- 监听 `rss-changed`，只失效 Feed、计数、文章和必要详情查询。
- 不修改 Axum HTTP server 或 Chrome 扩展契约。

### 先写测试

- command 名称、参数和返回映射正确。
- query key 包含范围、Feed 与 cursor。
- mutation 和事件只失效必要 RSS 查询。
- 非 RSS 查询缓存不受影响。

### 验证

运行 command/service 测试与前端 API/query 测试。

## 11. T9：导航与固定三栏页面骨架

### 工作

- 新增 RSS path、导航 tab、icon、Layout 分支与 `Mod+4`。
- 复用 `CollapsibleSidebar` 构建 Feed 侧栏。
- 创建固定文章栏和弹性正文栏，V1 不提供 resize。
- 实现无 Feed、无文章、无未读和未选择文章的空状态。
- 增加页面级刷新全部按钮和加载/错误状态。

### 先写测试

- 点击 RSS tab 和 `Mod+4` 正确切换，不回归已有快捷键。
- 左栏折叠/展开与笔记页行为一致。
- 默认“全部文章”且不自动选择文章。
- 各空状态和刷新状态正确。

### 验证

运行 Navbar、Layout、hotkey 和 RSS 页面骨架测试。

## 12. T10：Feed 添加、编辑、刷新与删除 UI

### 工作

- 实现单弹窗 URL 输入、候选单选、异步预览、自定义标题和确认订阅。
- 一个候选时跳过选择列表，多个候选时保持同弹窗交互。
- 重复订阅提示并定位已有 Feed。
- Feed 行展示未读数、刷新中、失败 icon 和 hover 操作。
- 编辑只修改显示名称。
- 删除 AlertDialog 展示 Feed 名称和文章数量。
- 刷新全部完成后显示单个汇总 Toast。

### 先写测试

- 单个/多个/零个发现结果的完整交互。
- 切换候选时 preview pending、成功和失败不会串数据。
- pending 防止重复确认，失败保留输入与选择。
- 重复订阅定位已有 Feed。
- 编辑、单 Feed 刷新、错误详情、删除取消/确认正确。
- 汇总 Toast 不按 Feed 刷屏。

### 验证

运行 Feed sidebar/dialog 组件测试和页面集成测试。

## 13. T11：文章无限列表与正文阅读

### 工作

- 实现全部、未读和单 Feed 范围切换。
- 使用 `useInfiniteQuery` 每次加载 30 条，滚动触底加载下一页。
- 列表展示来源、时间、摘要和已读视觉状态。
- 点击后展示清洗正文并立即标记已读。
- 未读视图当前缓存保留刚读文章，只改变样式；重新查询后移除。
- 正文链接通过 Tauri shell 在系统浏览器打开；空正文显示降级卡片。
- 远程图片懒加载并限制布局尺寸。

### 先写测试

- 三种范围传递正确查询参数。
- 无限加载合并页面且无重复项。
- 已读/未读/选中三种视觉状态互不覆盖。
- 点击已读 mutation、手动改回未读及计数刷新正确。
- 未读当前页不跳动，重新查询后消失。
- 正文链接不在 WebView 内导航，空正文降级正确。

### 验证

运行 Article list/reader 测试及生产构建。

## 14. T12：集成验收、视觉检查与代码审查

### 自动化验证

- Rust parser、fetcher、sanitizer、repository、service 和 migration 定向测试。
- Rust 全量测试、格式和 lint。
- 前端 RSS 定向测试、前端全量测试、TypeScript 和生产构建。
- 书签预览、数据库、导航、笔记和 Todo 回归测试。

### 手工验证

- 浅色/深色主题、侧栏折叠、固定三栏和长标题/摘要布局。
- 添加直接 RSS、Atom、单/多 Feed 网页、重复和失败场景。
- 15 分钟自动刷新、单 Feed 刷新、并发汇总和失败 icon。
- 全部/未读/单 Feed 无限滚动及应用重启持久化。
- HTML 表格、代码块、图片、危险标签和外部链接。
- 删除 Feed 的数量提示和级联结果。

### 最终质量门槛

- 使用代码审查技能检查最终 diff 的正确性、安全性、性能、可维护性和测试充分性。
- 每处改动可追溯到规格或验证需要。
- 不包含任何非目标能力或两个参考项目的受限源码/资源。
- 所有自动化检查通过，手工验收无阻断问题。

## 15. 建议提交边界

1. `refactor: extract shared safe http primitives`：仅 T1，确保书签预览行为不变。
2. `feat: add rss backend domain`：T2–T7，包含 migration、parser、fetcher、sanitizer、repository 和 service。
3. `feat: add rss frontend workspace`：T8–T11，包含契约、导航、Feed UI、列表和阅读器。
4. `test: complete rss integration coverage`：仅在确有独立 fixture/验收补充时使用；否则测试随对应功能提交。

每个提交前运行对应定向测试；最终提交前运行全量质量门槛。未经用户确认本计划，不开始任何任务。
