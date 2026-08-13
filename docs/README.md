# bkmrx 文档索引

本目录按文档用途归类。项目当前架构从 [ARCHITECTURE.md](./ARCHITECTURE.md) 开始阅读；接口使用方式见 [HTTP API](./reference/http-api.md)。

## 目录约定

- `plans/`：尚待执行或用于追溯实施过程的计划、任务拆解。
- `specs/`：功能规格、技术设计、选型和稳定性约定。
- `reference/`：长期有效的接口、命令和集成参考。
- `reviews/`：需要人工确认或已经确认的批量审阅清单。
- `reports/`：执行结果、审计报告及其配套数据文件。
- `migrations/`：已经冻结的数据库 SQL 迁移文件。

## 命名规范

- 文件名统一使用小写 `kebab-case`，保留行业通用缩写。
- 有明确发生日期的计划以 `YYYY-MM-DD-` 开头。
- 审阅、报告和迁移产物以 `-YYYYMMDD` 结尾，方便同主题按时间排序。
- Markdown 文档以一个一级标题开头；文档内链接使用相对路径。
- 历史产物不覆盖、不删除；新一轮操作生成新的日期版本。

## 常用入口

- [系统架构](./ARCHITECTURE.md)
- [HTTP API](./reference/http-api.md)
- [Todo V1 规格](./specs/todo-v1-spec.md)
- [当前标签汉化审阅清单](./reviews/bookmark-tags-localization-review-20260813.md)
- [当前标签汉化迁移](./migrations/bookmark-tag-localization-20260813.sql)

## 历史资料

历史设计和计划保留在各自分类目录中。需要定位某次批量数据操作时，按相同主题名在 `reviews/`、`reports/` 和 `migrations/` 三个目录之间交叉查找。
