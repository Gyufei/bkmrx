# Markdown Retrospective and v1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Markdown wrapping polish, publish an engineering retrospective, and synchronize the desktop application version to `1.0.0`.

**Architecture:** Preserve the completed reading-first Markdown architecture and document its decisions and concurrency invariants. Treat the release as metadata and documentation work around the already verified product; synchronize every active first-party version source without changing dependencies, storage, commands, or runtime behavior.

**Tech Stack:** React 18, TypeScript, CodeMirror 6, react-markdown, Vitest, Tauri 2, Rust, Cargo, pnpm

## Global Constraints

- The application version is exactly `1.0.0`.
- Do not change the database schema, note file format, settings format, or Tauri command contracts.
- Do not change dependency versions.
- Keep rendered fenced code horizontally scrollable.
- CodeMirror line wrapping is visual only and must not mutate Markdown source.
- `1.0.0` marks feature completion and the start of compatibility-first maintenance.
- Breaking changes after `1.0.0` require explicit justification, migration impact, and documented rollout.
- Bug fixes and behavior changes require regression tests.
- Remove generated build artifacts after verification.
- Do not include unrelated refactors or cleanup.

## File Structure

Create:

- `docs/features/2026-07-29-markdown-view-edit-refactor-retrospective.md` — durable engineering retrospective and `1.0.0` maintenance contract.

Modify:

- `apps/desktop/src/App.css` — rendered-link wrapping rule.
- `apps/desktop/src/notes/MarkdownViewer.test.tsx` — rendered-link wrapping regression.
- `apps/desktop/src/notes/MarkdownSourceEditor.tsx` — official CodeMirror visual line-wrapping extension.
- `apps/desktop/src/notes/MarkdownSourceEditor.test.tsx` — CodeMirror wrapping regression.
- `apps/desktop/package.json` — frontend product version.
- `apps/desktop/src-tauri/tauri.conf.json` — Tauri bundle version.
- `apps/desktop/src-tauri/Cargo.toml` — Rust package version.
- `apps/desktop/src-tauri/Cargo.lock` — generated `bkmrx` package version.

Inspect only:

- `pnpm-lock.yaml` — confirm its importer format does not record the workspace package version; do not modify unless regeneration proves otherwise.

---

### Task 1: Complete the Markdown Wrapping Polish

**Files:**
- Modify: `apps/desktop/src/App.css`
- Modify: `apps/desktop/src/notes/MarkdownViewer.test.tsx`
- Modify: `apps/desktop/src/notes/MarkdownSourceEditor.tsx`
- Modify: `apps/desktop/src/notes/MarkdownSourceEditor.test.tsx`

**Interfaces:**
- Consumes: `.markdown-viewer`, `MarkdownSourceEditor`, and `EditorView.lineWrapping`.
- Produces: rendered links that remain inside the reading column and visually wrapped CodeMirror source lines.

- [ ] **Step 1: Review the existing uncommitted wrapping diff**

Run:

```bash
git diff -- \
  apps/desktop/src/App.css \
  apps/desktop/src/notes/MarkdownViewer.test.tsx \
  apps/desktop/src/notes/MarkdownSourceEditor.tsx \
  apps/desktop/src/notes/MarkdownSourceEditor.test.tsx
```

Confirm the diff contains only:

```css
.markdown-viewer a {
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

and `EditorView.lineWrapping` plus the two focused regression tests.

- [ ] **Step 2: Run the focused wrapping tests**

Run:

```bash
CI=true pnpm --filter bkmrx exec vitest run \
  src/notes/MarkdownViewer.test.tsx \
  src/notes/MarkdownSourceEditor.test.tsx
```

Expected: both files pass; 18 tests pass.

- [ ] **Step 3: Run the complete frontend suite and build**

Run:

```bash
CI=true pnpm --filter bkmrx test
CI=true pnpm --filter bkmrx build
git diff --check
```

Expected: 11 test files and 87 tests pass; TypeScript and Vite build exit zero; diff check produces no output.

- [ ] **Step 4: Remove the generated frontend build**

Run:

```bash
rm -rf apps/desktop/dist
```

Expected: `apps/desktop/dist` no longer exists.

- [ ] **Step 5: Commit the wrapping polish**

```bash
git add \
  apps/desktop/src/App.css \
  apps/desktop/src/notes/MarkdownViewer.test.tsx \
  apps/desktop/src/notes/MarkdownSourceEditor.tsx \
  apps/desktop/src/notes/MarkdownSourceEditor.test.tsx
git commit -m "fix: wrap long markdown lines"
```

### Task 2: Write the Engineering Retrospective

**Files:**
- Create: `docs/features/2026-07-29-markdown-view-edit-refactor-retrospective.md`
- Reference: `docs/features/2026-07-28-markdown-view-edit-refactor-selection.md`
- Reference: `docs/superpowers/features/2026-07-28-markdown-view-edit-refactor-design.md`
- Reference: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: the approved design, implementation history, final architecture, verification evidence, and maintenance policy.
- Produces: one durable retrospective for future maintainers.

- [ ] **Step 1: Write the retrospective with the exact section structure**

Create the document with these sections:

```markdown
# Markdown 查看/编辑重构复盘与 1.0 稳定性约定

## 摘要
## 背景与目标
## 方案调研与取舍
## 最终架构
## 读取与保存竞态：问题、失败路径与不变量
## 测试、审查与真实桌面验收
## 最终结果
## 做得好的地方
## 可以改进的地方
## 已知技术债
## 1.0.0 之后的维护约定
## 给未来维护者的检查清单
```

The content must explicitly record:

- default rendered view and lazy CodeMirror edit view;
- removal of Milkdown/Crepe;
- CommonMark/GFM tables/task lists/fenced code scope;
- captured `path/content/session/version/generation` save snapshots;
- stale-read guards, per-path serialization, pending reads, flush draining,
  retry retention, unmount flush, and watermark reclamation;
- why Yjs, RxJS, Zustand, Monaco, and syntax-highlighting libraries were not
  introduced for the current single-document scope;
- dark-theme, IME, narrow-window, scroll, selection, empty-save,
  failure/retry, and A/B isolation acceptance results;
- 85-test refactor baseline and 87-test wrapping baseline;
- existing sourcemap-location and large-chunk warnings as non-blocking debt;
- compatibility-first maintenance rules after `1.0.0`.

- [ ] **Step 2: Self-review the retrospective**

Run:

```bash
rg -n 'T[B]D|T[O]DO|PLACEHOLD[E]R' docs/features/2026-07-29-markdown-view-edit-refactor-retrospective.md
git diff --check -- docs/features/2026-07-29-markdown-view-edit-refactor-retrospective.md
```

Expected: no placeholder matches and no diff-check output.

Read the document once and confirm it is decision-oriented rather than a
chronological transcript.

- [ ] **Step 3: Commit the retrospective**

```bash
git add docs/features/2026-07-29-markdown-view-edit-refactor-retrospective.md
git commit -m "docs: record markdown editor refactor retrospective"
```

### Task 3: Synchronize and Verify v1.0.0

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Inspect: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: active product-version metadata used by the frontend package, Tauri bundler, and `CARGO_PKG_VERSION`.
- Produces: consistent application and bundle version `1.0.0`.

- [ ] **Step 1: Add a failing version verification command**

Run before editing:

```bash
node -e '
const fs = require("node:fs");
const pkg = require("./apps/desktop/package.json");
const tauri = require("./apps/desktop/src-tauri/tauri.conf.json");
const cargo = fs.readFileSync("./apps/desktop/src-tauri/Cargo.toml", "utf8");
if (pkg.version !== "1.0.0") throw new Error("desktop package version");
if (tauri.version !== "1.0.0") throw new Error("tauri bundle version");
if (!/^version = "1\\.0\\.0"$/m.test(cargo)) throw new Error("cargo package version");
'
```

Expected: FAIL because the active version sources still report `0.1.0`.

- [ ] **Step 2: Update the three source declarations**

Set:

```json
// apps/desktop/package.json
"version": "1.0.0"

// apps/desktop/src-tauri/tauri.conf.json
"version": "1.0.0"
```

```toml
# apps/desktop/src-tauri/Cargo.toml
version = "1.0.0"
```

- [ ] **Step 3: Regenerate lock metadata**

Run:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
CI=true pnpm install --lockfile-only --frozen-lockfile
```

Expected:

- the `bkmrx` entry in `apps/desktop/src-tauri/Cargo.lock` reports `1.0.0`;
- `pnpm-lock.yaml` remains unchanged because its importer does not store the
  workspace package version.

- [ ] **Step 4: Verify every active version source**

Run:

```bash
node -e '
const fs = require("node:fs");
const pkg = require("./apps/desktop/package.json");
const tauri = require("./apps/desktop/src-tauri/tauri.conf.json");
const cargo = fs.readFileSync("./apps/desktop/src-tauri/Cargo.toml", "utf8");
const lock = fs.readFileSync("./apps/desktop/src-tauri/Cargo.lock", "utf8");
if (pkg.version !== "1.0.0") process.exit(1);
if (tauri.version !== "1.0.0") process.exit(1);
if (!/^version = "1\\.0\\.0"$/m.test(cargo)) process.exit(1);
if (!/name = "bkmrx"\\nversion = "1\\.0\\.0"/m.test(lock)) process.exit(1);
'
cargo metadata \
  --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --no-deps \
  --format-version 1
```

Expected: the Node command exits zero and Cargo metadata reports
`"version":"1.0.0"` for package `bkmrx`.

- [ ] **Step 5: Run full release verification**

Run:

```bash
CI=true pnpm --filter bkmrx test
CI=true pnpm --filter bkmrx build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy \
  --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --all-targets \
  -- -D warnings
git diff --check
```

Expected: frontend tests, frontend build, Rust tests, strict Clippy, and diff
check all pass.

- [ ] **Step 6: Confirm release scope and remove generated artifacts**

Run:

```bash
git diff --stat HEAD~2
git diff -- apps/desktop/package.json \
  apps/desktop/src-tauri/tauri.conf.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/Cargo.lock \
  pnpm-lock.yaml
rm -rf apps/desktop/dist
```

Confirm:

- only first-party version values changed;
- dependency versions did not change;
- `pnpm-lock.yaml` did not change;
- no database or migration file changed;
- generated frontend output was removed.

- [ ] **Step 7: Commit the v1.0.0 release metadata**

```bash
git add \
  apps/desktop/package.json \
  apps/desktop/src-tauri/tauri.conf.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/Cargo.lock
git commit -m "chore: release version 1.0.0"
```

- [ ] **Step 8: Verify the final repository state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: the worktree is clean and the latest commits are the wrapping polish,
retrospective, and `1.0.0` release metadata.
