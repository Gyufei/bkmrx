# bkmrx Monorepo Design

**Date:** 2026-07-24

## Goal

将桌面应用、Chrome 扩展和产品文档合并进一个 Git 仓库，使跨端 API
变更、实现和文档能够通过同一个原子提交维护，同时保留两个现有代码仓库的完整历史。

## Scope

纳入 monorepo：

- 当前 `bkmrx` 仓库，迁移至 `apps/desktop/`
- 当前 `bkmrx-chrome-ext` 仓库，迁移至 `apps/chrome-extension/`
- 父目录中的公共 `docs/`，迁移至根 `docs/`

不纳入 monorepo：

- `bkmr/`
- `bkmr-scripts/`
- `app-backups/`
- `migration-backups/`
- 数据库、应用安装包、依赖缓存、构建产物和 Git worktree

## Repository Layout

```text
bkmr-sync/
├── apps/
│   ├── desktop/
│   └── chrome-extension/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── .gitignore
```

根仓库沿用 `bkmrx` 的 GitHub remote。桌面端和 Chrome 扩展的历史分别重写路径前缀
到 `apps/desktop/` 和 `apps/chrome-extension/` 后，以不压缩的独立历史分支合并。
历史重写会生成新的提交哈希，但保留全部提交内容、作者、时间和消息；原哈希由迁移备份
中的源仓库永久保留。公共文档作为新的根级文档提交加入。旧仓库在迁移验证完成前保持
不变。

## Workspace

根目录使用 pnpm workspace，但不引入 Turborepo、Nx 或新的构建依赖。
`apps/desktop` 是当前唯一的 pnpm package。Chrome 扩展继续保持原生 Manifest V3
结构，不增加构建步骤。

根 `package.json` 只提供转发到桌面应用的常用命令：

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm tauri`

业务包名、Tauri crate 名、产品名和 Bundle Identifier 均保持不变。

## History-Preserving Migration

迁移必须满足以下约束：

1. 先在隔离的临时仓库中构造并验证结果，不直接改写现有仓库。
2. 桌面仓库的每个历史提交重写至 `apps/desktop/`，保留内容、作者、时间和消息。
3. Chrome 扩展仓库的每个历史提交重写至 `apps/chrome-extension/`，保留内容、作者、
   时间和消息。
4. 两段重写后的历史通过一次允许无共同祖先的 merge commit 连接，不 squash。
5. 公共 `docs/` 在代码历史合并后加入。
6. 完整验证通过前，不删除或覆盖任何原仓库、文档或备份。
7. 最终切换时保留可恢复副本，并记录两个源仓库迁移前的 HEAD。

## Ignore Policy

根 `.gitignore` 必须排除：

- 父目录中所有未纳入范围的既有目录
- `node_modules/`、`.pnpm-store/`
- `dist/`、Tauri `target/`
- `.worktrees/`
- `.DS_Store`
- SQLite 数据库及其 WAL/SHM 文件
- `.app`、迁移备份和安装备份

忽略规则不得遮蔽 `apps/desktop`、`apps/chrome-extension` 或 `docs` 中应跟踪的源码。

## Verification

迁移结果必须通过：

1. 根仓库状态干净，且只跟踪目标范围。
2. `git log -- apps/desktop` 能连续看到全部桌面端源提交对应的重写历史。
3. `git log -- apps/chrome-extension` 能连续看到全部扩展源提交对应的重写历史。
4. `pnpm install --frozen-lockfile` 成功。
5. 桌面前端测试通过。
6. 桌面前端构建通过。
7. Rust 测试通过。
8. Chrome 扩展 `manifest.json` 可解析，引用的后台脚本、popup 和图标均存在。

Chrome 中的点击级人工验收不作为目录迁移提交的阻塞项，但应在切换后进行。

## Commit Boundaries

迁移保持两类变更分离：

1. 历史与目录结构迁移，不修改业务行为。
2. 根 workspace、统一命令、README、忽略规则和文档导航。

未来共享 API contract 或引入任务编排器属于后续独立工作，不在本次范围内。
