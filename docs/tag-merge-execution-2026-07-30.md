# 标签合并执行报告

## 执行结果

2026-07-30 已对书签数据库执行一次性标签合并。此次只处理
`docs/tag-similarity-audit-2026-07-30.md` 中的 118 组高置信度候选，
12 组语义相近但存在歧义的候选保持不变。

| 指标 | 执行前 | 执行后 |
|---|---:|---:|
| 书签 | 2151 | 2151 |
| FTS5 记录 | 2151 | 2151 |
| tag | 3043 | 2919 |
| 书签—tag 关联 | 11177 | 11151 |

合并了 124 个旧 tag。关联减少 26 条，是因为部分书签原本同时关联了
同组的旧 tag 与保留 tag；迁移使用唯一 `(bookmark_id, tag_id)` 关系去重，
没有删除书签。

## 备份

- 文件：`/Users/gyf/MyLib/bkmrx-app/backups/bookmarks-before-tag-merge-20260730-204321.db`
- SHA-256：`a8b3bc97750177e670121cd06975edb2919f44459ca53bcefc1ddbe321e9abb7`
- SQLite 完整性检查：`ok`
- 保留策略：只有用户明确确认后才允许删除

## 迁移内容

1. 将旧 tag 的书签关联复制到每组保留 tag。
2. 对同一书签已有保留 tag 的情况去重。
3. 删除旧关联和 124 个旧 tag。
4. 根据 `bookmarks`、`bookmark_tags`、`tags` 完整重建 `bookmarks_fts`。
5. 所有写入在一个 `BEGIN IMMEDIATE` 事务中完成。

具体 ID 映射见 `scripts/tag-merge-map.sql`。

## 自动校验

- `PRAGMA integrity_check`：`ok`
- 删除的 tag ID 仍存在：0
- 缺失的保留 tag ID：0
- 孤立书签—tag 关联：0
- 缺失 FTS 行：0
- FTS tag 文本与关系表不一致：0
- 与备份相比，非 tag 的书签字段变化：0
- 与映射计算出的预期关联集合差异：0
- 除映射内旧 ID 外的 tag 集合变化：0

## 待用户确认

启动 bkmrx 后手工检查：

1. tag 下拉列表中不再出现旧名称。
2. 使用保留 tag 筛选时能看到合并前各名称下的书签合集。
3. 搜索保留 tag 时结果正常。
4. 编辑并保存一个已合并书签后，tag 保持正确。
5. 确认无误后，再决定是否删除备份。
