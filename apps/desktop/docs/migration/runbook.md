# BKMR 到 bkmrx SQLite 一次性迁移

本文只用于当前开发机的一次性迁移。迁移工具完成真实迁移后必须从最终 App 源码删除。

## 固定路径

```text
源码仓库：/Users/gyf/MyLib/bkmr-sync/bkmrx
旧数据库：/Users/gyf/.config/bkmr/bkmr.db
备份根目录：/Users/gyf/MyLib/bkmr-sync/migration-backups
新数据库：/Users/gyf/Library/Application Support/com.bkmrx/bookmarks.db
```

迁移工具只读打开旧数据库，不会修改、移动或删除它。

## 中止条件

出现任一情况立即停止：

- `127.0.0.1:8733` 仍有监听进程；
- 旧数据库不存在或 `PRAGMA integrity_check` 不为 `ok`；
- 新数据库或 `.migrating` 文件已经存在；
- 备份目录不是空目录；
- 旧库 hash 在迁移期间发生变化；
- 书签数量、最大 ID、URL 集合、标签集合、业务字段、FTS 数量不一致；
- 新库完整性或外键检查失败。

## 1. 停止写入

退出旧 bkmrx App，然后确认端口为空：

```bash
lsof -nP -iTCP:8733 -sTCP:LISTEN
```

预期：无输出。不要在迁移完成前启动新版 App，否则它会提前创建目标数据库。

## 2. 建立时间戳备份目录

```bash
mkdir -p /Users/gyf/MyLib/bkmr-sync/migration-backups
date '+%Y%m%d-%H%M%S'
mkdir /Users/gyf/MyLib/bkmr-sync/migration-backups/<上一步时间戳>
```

后续将该绝对路径记为：

```text
/Users/gyf/MyLib/bkmr-sync/migration-backups/<timestamp>
```

## 3. 记录旧库基线

```bash
shasum -a 256 /Users/gyf/.config/bkmr/bkmr.db
sqlite3 -readonly /Users/gyf/.config/bkmr/bkmr.db 'PRAGMA integrity_check;'
sqlite3 -readonly /Users/gyf/.config/bkmr/bkmr.db \
  'SELECT count(*) AS count, coalesce(max(id), 0) AS max_id FROM bookmarks;'
sqlite3 -readonly /Users/gyf/.config/bkmr/bkmr.db '.schema bookmarks'
```

规划时数量是 2145。若实际数量变化，以本次冻结后的真实结果为准，并将它写入迁移报告；不要强行套用 2145。

## 4. 运行迁移

在隔离实现 worktree 根目录运行：

```bash
cd /Users/gyf/MyLib/bkmr-sync/bkmrx/.worktrees/codex-replace-bkmr-sqlite

cargo run \
  --manifest-path src-tauri/Cargo.toml \
  --features legacy-migration \
  --bin migrate_bkmr \
  -- \
  --source /Users/gyf/.config/bkmr/bkmr.db \
  --target '/Users/gyf/Library/Application Support/com.bkmrx/bookmarks.db' \
  --backup-dir /Users/gyf/MyLib/bkmr-sync/migration-backups/<timestamp>
```

工具在创建目标前必须生成并 fsync：

```text
legacy-bkmr.db
legacy-bookmarks.json
manifest.json
```

目标先写为 `bookmarks.db.migrating`。只有完整验证通过后才原子重命名为 `bookmarks.db`。

## 5. 独立验证

```bash
sqlite3 -readonly '/Users/gyf/Library/Application Support/com.bkmrx/bookmarks.db' \
  'PRAGMA integrity_check; PRAGMA foreign_key_check;'

sqlite3 -readonly '/Users/gyf/Library/Application Support/com.bkmrx/bookmarks.db' \
  'SELECT count(*) AS count, coalesce(max(id), 0) AS max_id FROM bookmarks;
   SELECT count(*) AS fts_count FROM bookmarks_fts;'

shasum -a 256 /Users/gyf/.config/bkmr/bkmr.db
```

还必须用只读脚本逐 URL 比较以下字段：

- ID；
- URL；
- title / metadata；
- description / desc；
- access_count / flags；
- created_at / created_ts；
- updated_at / last_update_ts；
- accessed_at；
- 完整标签集合。

时间从旧库 UTC 文本转换为 Unix 毫秒，显示时再转换为 RFC 3339。

## 6. 保存迁移报告

在本次时间戳备份目录创建 `migration-report.md`，记录：

- 执行时间和完整命令；
- 旧库迁移前后 SHA-256；
- snapshot、JSON、manifest SHA-256；
- 源/目标数量与最大 ID；
- integrity、foreign key 和 FTS 验证输出；
- 字段及标签集合比较结果；
- 最终目标路径。

报告和个人数据不提交到 Git。

## 7. 后续顺序

1. 确认迁移报告完整；
2. 从源码删除临时迁移 CLI、测试、feature 与全部旧 BKMR 模块；
3. 确认默认依赖树没有 BKMR、Diesel、fastembed、ORT 或 sqlite-vec；
4. 构建 Apple Silicon `.app`；
5. 备份旧 App，安装新 App；
6. 完成 App、HTTP 与 Chrome 扩展 smoke test。

## 8. Apple Silicon 本机构建

Tauri CLI 的 bundle 参数必须直接传给 `tauri build`，不要放在额外的
`--` 之后：

```bash
pnpm tauri build --bundles app
file src-tauri/target/release/bundle/macos/bkmrx.app/Contents/MacOS/bkmrx
```

未配置 Apple Developer 身份时，对完整 bundle 进行本机 ad-hoc 签名并校验：

```bash
codesign --force --deep --sign - \
  src-tauri/target/release/bundle/macos/bkmrx.app
codesign --verify --deep --strict --verbose=2 \
  src-tauri/target/release/bundle/macos/bkmrx.app
```

这是个人本机安装签名，不用于分发或 notarization。
