# Rust 交互日志系统实施任务

本任务清单以 [Rust 交互日志系统设计](./2026-08-28-rust-interaction-logging-design.md)
为范围基线。实施顺序优先建立安全日志基础，再覆盖数据库、入站 HTTP 和出站 HTTP，
最后做全量审计。

## 任务依赖

```text
T1 日志依赖与配置
 ├─→ T2 安全字段与操作上下文
 │    ├─→ T4 入站 HTTP
 │    └─→ T5 出站 HTTP
 └─→ T3 生命周期与数据库
      └─→ T6 既有错误输出迁移

T3 + T4 + T5 + T6
 └─→ T7 测试与审计
```

## T1：接入日志插件

- [x] 增加 `log` 与 `tauri-plugin-log` Rust 依赖并更新 lockfile。
- [x] 新增日志配置模块，显式覆盖插件默认 targets 与 level。
- [x] Debug 配置为终端 + Debug；Release 配置为 LogDir + Info。
- [x] Release 配置 `bkmrx.log`、5 MB、保留 5 份旧日志、本地时区。
- [x] 收紧第三方依赖 target 到 Warn。
- [x] 在业务初始化前动态注册日志插件，不增加 WebView capability。

验证：配置单测、`cargo check`。

## T2：安全字段和操作上下文

- [x] 实现进程内递增 `operation_id`。
- [x] 实现 `redact_secret`。
- [x] 实现 URL 凭据查询参数脱敏。
- [x] 提供统一的耗时和安全错误格式 helper，避免散落规则。
- [x] 为凭据参数、普通 URL、短 secret 和 operation id 写单测。

验证：helper 单测证明凭据不会出现在输出。

## T3：应用生命周期和数据库

- [x] 记录应用启动、版本、构建模式、OS、架构和初始化完成。
- [x] 为数据库打开、PRAGMA 初始化、迁移和 FTS 能力检查增加结果与耗时日志。
- [x] 在具有业务语义的书签、Todo、RSS 和导入导出边界补充数据库交互日志。
- [x] 数据库失败记录 store、operation、稳定错误码和耗时，不记录 SQL/参数。
- [x] 记录应用关闭、本地服务关闭和监听器停止。
- [x] 安装尽力而为的 panic hook。

验证：database/migration/repository 测试。

## T4：入站 HTTP

- [x] 为 Axum Router 增加最外层请求日志 middleware。
- [x] 记录 method、path、status、operation_id 和 elapsed_ms。
- [x] 2xx/3xx、4xx、5xx 分别映射到 Info、Warn、Error。
- [x] 不记录 query、headers 和 body。
- [x] 确认 CORS、错误 envelope、状态码和响应 body 不变。

验证：http_server 全量测试并补 middleware 回归测试。

## T5：出站 HTTP

- [x] 记录 RSS Feed 抓取/发现每一跳的请求、响应、重定向、字节数和失败。
- [x] 记录 RSS 图片下载请求与文件写入结果。
- [x] 记录翻译请求的 provider、状态、耗时和失败，不记录正文或鉴权串。
- [x] 记录普通网页预览请求、重定向、嵌入策略结果和失败。
- [x] 记录 GitHub API 请求的仓库标识、状态、耗时和失败，不记录 token。
- [x] 所有 Debug URL 先经过 `sanitize_url`。

验证：现有本地网络测试与新增脱敏断言。

## T6：现有输出与静默错误

- [x] 将全部运行时 `eprintln!` 替换为 `log` 事件。
- [x] 为笔记 watcher 回调错误增加日志，不改变 watcher 行为。
- [x] 为关键 Tauri event emit 失败增加 Debug/Warn 日志，不改变 UI 契约。
- [x] 为本地 HTTP shutdown channel 和后台 task 结束增加日志。

验证：运行时代码无 `eprintln!`，现有功能测试通过。

## T7：全量验证与审计

- [x] `cargo fmt --check`。
- [x] `cargo test`。
- [x] Debug `cargo check`。
- [x] Release `cargo check --release`。
- [x] 审计所有新增日志调用，不直接输出 Settings、headers、body、SQL 或 secret。
- [x] 审计 Debug/Release target，确保开发不写文件、发布不写终端。
- [x] 更新本任务清单的完成状态与偏差说明。

## 实施偏差记录

如插件锁定版本的 API 与设计使用的 v2 官方接口存在差异，只允许在不改变环境矩阵、
有界轮转、Rust-only 和凭据脱敏原则的前提下调整实现，并在此处记录。

- 锁定版本为 `tauri-plugin-log 2.9.0`。
- 为满足“日志初始化失败不阻止应用启动”，使用插件的 `split`/`attach_logger` 在
  Tauri `setup` 最开始动态初始化；文件 target 失败时改用 stderr target。业务初始化仍在
  logger 成功或回退之后开始。
- `KeepSome(5)` 在该版本中表示保留 5 份归档文件，另有 1 份活动 `bkmrx.log`，最大占用
  约 30 MB，而不是 25 MB。
- 预览缓存是内存缓存，不属于数据库交互，因此未添加数据库日志；其外部网络请求已覆盖。
