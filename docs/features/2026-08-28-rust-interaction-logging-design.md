# Rust 交互日志系统设计

## 1. 背景与目标

bkmrx 的 Rust 后端目前没有统一日志系统，运行时代码仅在少数失败分支使用
`eprintln!`。这使数据库初始化、本地 HTTP API、外部网络请求和后台任务发生问题时，
缺少连续、可检索的诊断信息。

本期使用 `tauri-plugin-log` 和 Rust `log` facade 建立基础日志系统，重点记录应用与
外部边界的交互：

1. 数据库打开、迁移和业务持久化操作；
2. 进入本地 Axum HTTP API 的请求与返回；
3. 应用发出的 RSS、翻译、网页预览、GitHub 和图片请求；
4. 应用启动、后台服务、文件监听、关闭和 panic 等必要上下文。

目标是本机开发与发布版排障，不把普通运行日志扩展为安全审计、遥测平台或崩溃上报系统。

## 2. 已确认范围

### 2.1 环境矩阵

| 构建环境 | 最高级别 | 输出目标 | 文件 |
| --- | --- | --- | --- |
| Debug | `Debug` | 仅终端 | 不创建 |
| Release | `Info` | 仅系统日志目录 | `bkmrx.log` |

- 第三方依赖默认限制为 `Warn`，应用自身 target 允许上述级别。
- Release 单文件上限 5 MB，保留 5 份旧日志，使用有界大小轮转。
- 使用本地时区和人类可读文本格式。
- 不向 WebView 注册日志 target，不新增前端日志权限或前端日志依赖。

### 2.2 非目标

- 不提供“打开日志目录”或“导出诊断包”界面。
- 不接入远程日志、统计、OpenTelemetry、Sentry 或 crash dump。
- 不改变当前错误传播、重试、用户提示和后台任务恢复行为。
- 不记录每条 SQL；每个业务级数据库操作最多记录一组开始/结果事件，避免按 SQL 放大日志量。
- 不为所有 Tauri command 增加统一成功日志；交互边界优先。

## 3. 日志格式与事件约定

格式：

```text
2026-08-28 10:32:15.482 INFO  [bkmrx::http_server] http_request_completed method=POST path=/api/bookmarks status=201 elapsed_ms=12
2026-08-28 10:32:17.103 WARN  [bkmrx::rss] outbound_request_failed operation_id=17 host=example.com error_code=timeout elapsed_ms=3001 error="request timed out"
```

约定：

- 事件名使用稳定的 `snake_case`，放在 message 开头。
- 动态字段使用 `key=value`；可能包含空格的值使用 Debug 字符串格式加引号。
- 时间、级别和 Rust target 由日志 formatter 统一添加。
- 外部请求和其他长任务使用进程内递增 `operation_id` 关联开始、响应和失败。
- 耗时统一使用单调时钟计算，字段名为 `elapsed_ms`。
- HTTP 日志记录 method、规范化 path、status、host、重定向次数和响应字节数；不记录请求头或响应正文。
- 数据库日志记录 store、operation、entity id、数量、结果和耗时；不记录 SQL 与完整数据结构。

## 4. 交互边界设计

### 4.1 数据库

基础生命周期事件：

- `database_open_started`
- `database_open_completed`
- `database_open_failed`
- `database_migration_started`
- `database_migration_completed`
- `database_migration_failed`
- `database_capability_check_completed`
- `database_capability_check_failed`

业务持久化事件在 repository/service 边界记录：

- 业务查询与 mutation 成功在 Info 记录 store、operation 和耗时，便于发布版观察数据库交互；
- Debug 可补充筛选摘要、实体 id 和数量，但不得包含正文或 SQL；
- 所有数据库失败在 Error 记录稳定错误码、store、operation 和耗时；
- 不记录 SQL、绑定参数、标题、正文或完整模型 Debug 输出。

首期重点覆盖书签、Todo、RSS、导入导出和预览缓存数据库边界。若操作已经在更高层
具有明确业务语义，优先在该层记录，避免 repository 与 service 重复输出同一事件。

### 4.2 入站 HTTP

在 Axum Router 最外层增加统一中间件：

- 收到请求时以 Debug 记录 `http_request_started`；
- 返回响应时记录 `http_request_completed`；2xx/3xx 用 Info，4xx 用 Warn，5xx 用 Error；
- 字段包括 `operation_id`、method、path、status、elapsed_ms；
- 使用 path，不记录 query string，避免搜索词、URL 和凭据意外进入 Info 日志；
- handler 的业务失败继续由现有 `ApiError` 映射，不改变响应契约。

### 4.3 出站 HTTP

需要埋点的请求边界：

- RSS Feed 抓取与网页发现；
- RSS 图片下载；
- 小牛翻译请求；
- 普通网页预览；
- GitHub 仓库信息请求。

每次请求记录：

1. Debug：`outbound_request_started`，包含 operation_id、kind、method、经处理 URL；
2. Info：`outbound_request_completed`，包含 host、status、redirects、bytes、elapsed_ms；
3. Warn/Error：`outbound_request_failed`，包含稳定 error_code 和脱敏错误文本。

普通标题和 URL 可以在 Debug 中记录。任何级别下，URL 中名为 `key`、`token`、
`access_token`、`api_key`、`secret`、`signature`、`auth` 的查询参数都必须脱敏。

## 5. 脱敏与安全

新增聚焦的日志安全 helper：

- `redact_secret`：凭据仅保留少量首尾字符；
- `sanitize_url`：解析 URL 并替换凭据型查询参数；解析失败时返回安全占位；
- `sanitize_error`：对错误文本中的已知凭据片段提供统一扩展入口。

硬性规则：

- 禁止记录 API Key、Token、Cookie、Authorization header 和完整 Settings Debug 输出；
- 禁止记录请求/响应 body、笔记正文、RSS 正文、翻译全文和 SQL 参数；
- 普通标题和普通 URL 不做业务脱敏，但仅允许出现在 Debug 日志；
- Release 的 Info 日志默认只记录 host、path、id、数量、状态和耗时；
- 底层错误使用 Display 文本前必须经过统一安全 helper。

## 6. 生命周期和容错

- 日志插件必须在其他插件与 `setup` 之前注册，覆盖初始化失败。
- 启动记录版本、debug/release、OS 和 CPU 架构，不记录用户名、设备名和绝对路径。
- 现有 `eprintln!` 迁移为统一日志事件。
- 安装 panic hook，尽力记录 panic 位置和简化 payload；不承诺 `panic = "abort"` 下所有
  崩溃均能刷新到文件。
- 日志系统失败不应阻止应用启动；Debug 环境至少回退到 stderr。插件 build 本身不执行
  文件 I/O，运行期目标失败由插件内部处理。
- 应用关闭时记录监听器停止、本地服务关闭和 `application_stopped`。

## 7. 测试策略

### 7.1 单元测试

- URL 凭据参数脱敏，普通参数和普通 URL 保持不变；
- secret 脱敏覆盖短值、长值和空值；
- event id 单调递增；
- Debug/Release 配置分别只生成终端/文件 target；
- HTTP middleware 记录后不改变 response status/body；
- 数据库初始化和迁移测试保持通过。

### 7.2 集成与回归

- 使用现有本地测试 server 验证入站和出站请求逻辑，不访问公网；
- 运行 Rust 全量测试；
- 分别执行 debug build 与 release `cargo check`；
- 搜索确认运行时代码不再包含 `eprintln!`；
- 搜索日志语句，确认未直接格式化 Settings、headers、body 或凭据变量。

## 8. 完成标准

- 开发版只向终端写 Debug 及以上日志，不创建文件；
- 发布版只向 `bkmrx.log` 写 Info 及以上日志，按 5 MB/5 份旧文件轮转；
- 数据库、入站 HTTP 和所有主要出站 HTTP 边界均有开始/结果/失败与耗时日志；
- 敏感凭据不会通过 URL、设置对象或错误文本进入日志；
- 不新增 WebView 权限，不增加日志 UI，不改变既有业务行为；
- 文档、测试、格式检查和构建全部通过。
