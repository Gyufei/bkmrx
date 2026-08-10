# bkmrx Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the bkmrx desktop app, Chrome extension, and shared documentation into one history-preserving monorepo rooted at `/Users/gyf/MyLib/bkmr-sync`.

**Architecture:** Clone each source into an isolated temporary directory, rewrite every commit tree with its final monorepo path prefix, and merge the two rewritten histories without squashing. Add root workspace metadata and shared docs, verify the temporary repository, then move original source directories into a recoverable migration backup and install the verified repository at the parent path.

**Tech Stack:** Git 2.50, pnpm 11, Tauri 2, React 18, Rust, Chrome Manifest V3

## Global Constraints

- Include only the desktop app, Chrome extension, and shared docs.
- Preserve every desktop and extension source commit, including content, authorship, timestamps, and messages; rewritten commits receive new hashes while original hashes remain in the source backup.
- Do not squash either source history.
- Do not modify product behavior, package identity, Tauri crate identity, product name, or Bundle Identifier.
- Do not add Turborepo, Nx, or another task orchestrator.
- Do not delete original repositories before all temporary-repository verification passes.
- Keep `bkmr`, `bkmr-scripts`, app backups, migration backups, databases, build output, dependency caches, and worktrees untracked.

---

### Task 1: Capture Baselines and Build the Isolated History

**Files:**
- Create in temporary repository: `apps/desktop/**`
- Create in temporary repository: `apps/chrome-extension/**`

**Interfaces:**
- Consumes: desktop repository at `/Users/gyf/MyLib/bkmr-sync/bkmrx`
- Consumes: extension repository at `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext`
- Produces: a temporary Git repository whose `main` contains both path-rewritten histories

- [ ] **Step 1: Reconfirm clean source states and exact source commits**

Run:

```bash
git -C /Users/gyf/MyLib/bkmr-sync/bkmrx status --short
git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext status --short
DESKTOP_SOURCE_HEAD="$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx rev-parse HEAD)"
EXTENSION_SOURCE_HEAD="$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext rev-parse HEAD)"
git -C /Users/gyf/MyLib/bkmr-sync/bkmrx \
  merge-base --is-ancestor bf40d3f "$DESKTOP_SOURCE_HEAD"
test "$EXTENSION_SOURCE_HEAD" = "73597694c9c0b2b14b89a8206615208515c00e4d"
```

Expected: both status commands print nothing; record both variables in the migration
report; the desktop ancestry check and extension equality check exit zero.

- [ ] **Step 2: Clone and rewrite the desktop history**

Run:

```bash
test ! -e /private/tmp/bkmrx-monorepo-rewrite-20260724
git clone --no-local \
  /Users/gyf/MyLib/bkmr-sync/bkmrx \
  /private/tmp/bkmrx-monorepo-rewrite-20260724
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 config commit.gpgsign false
FILTER_BRANCH_SQUELCH_WARNING=1 git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  filter-branch --tree-filter '
    mkdir -p .monorepo-prefix/apps/desktop
    find . -mindepth 1 -maxdepth 1 \
      ! -name .git ! -name .monorepo-prefix \
      -exec mv {} .monorepo-prefix/apps/desktop/ \;
    mv .monorepo-prefix/apps .
  ' -- main
```

Expected: every desktop commit is rewritten and every tracked file is beneath
`apps/desktop/`.

- [ ] **Step 3: Clone and rewrite the extension history**

Run:

```bash
git clone --no-local \
  /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext \
  /private/tmp/bkmrx-extension-rewrite-20260724
git -C /private/tmp/bkmrx-extension-rewrite-20260724 config commit.gpgsign false
FILTER_BRANCH_SQUELCH_WARNING=1 git -C /private/tmp/bkmrx-extension-rewrite-20260724 \
  filter-branch --tree-filter '
    mkdir -p .monorepo-prefix/apps/chrome-extension
    find . -mindepth 1 -maxdepth 1 \
      ! -name .git ! -name .monorepo-prefix \
      -exec mv {} .monorepo-prefix/apps/chrome-extension/ \;
    mv .monorepo-prefix/apps .
  ' -- main
```

Expected: every extension commit is rewritten and every tracked file is beneath
`apps/chrome-extension/`.

- [ ] **Step 4: Merge the rewritten histories without squashing**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 remote remove origin
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 remote add extension-rewrite \
  /private/tmp/bkmrx-extension-rewrite-20260724
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 fetch extension-rewrite main
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 merge \
  --allow-unrelated-histories --no-ff extension-rewrite/main \
  -m "chore: merge Chrome extension history"
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 remote remove extension-rewrite
```

Expected: one merge commit joins the two rewritten histories without conflicts.

- [ ] **Step 5: Verify imported trees and history counts**

Run:

```bash
test -f /private/tmp/bkmrx-monorepo-rewrite-20260724/apps/desktop/package.json
test -f /private/tmp/bkmrx-monorepo-rewrite-20260724/apps/desktop/src-tauri/Cargo.toml
test -f /private/tmp/bkmrx-monorepo-rewrite-20260724/apps/chrome-extension/manifest.json
test "$(git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  rev-list --count HEAD^1)" = \
  "$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx rev-list --count HEAD)"
test "$(git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  rev-list --count HEAD^2)" = \
  "$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext rev-list --count HEAD)"
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 log \
  --follow --oneline -- apps/desktop/package.json
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 log \
  --follow --oneline -- apps/chrome-extension/manifest.json
```

Expected: all files exist, the source branch counts are 61 and 7, and both path
logs show pre-migration history.

- [ ] **Step 6: Preserve the source-to-rewritten commit map**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  rev-parse refs/original/refs/heads/main
git -C /private/tmp/bkmrx-extension-rewrite-20260724 \
  rev-parse refs/original/refs/heads/main
```

Expected: the refs resolve to the captured source HEADs. Record the rewritten
`main` tips and original source tips in the migration report.

### Task 2: Add Root Workspace and Ignore Boundaries

**Files:**
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/package.json`
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/pnpm-workspace.yaml`
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/.gitignore`
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/README.md`
- Move from imported desktop tree: `apps/desktop/pnpm-lock.yaml` → `pnpm-lock.yaml`
- Replace imported desktop file: `apps/desktop/pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `apps/desktop` package scripts `dev`, `build`, `test`, and `tauri`
- Produces: root commands that dispatch to package `bkmrx`

- [ ] **Step 1: Create the root package manifest**

Create `package.json`:

```json
{
  "name": "bkmrx-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter bkmrx dev",
    "build": "pnpm --filter bkmrx build",
    "test": "pnpm --filter bkmrx test",
    "tauri": "pnpm --filter bkmrx tauri"
  }
}
```

- [ ] **Step 2: Create the root workspace configuration**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/desktop

allowBuilds:
  esbuild: true

minimumReleaseAgeExclude:
  - prettier@3.9.6
```

Remove `apps/desktop/pnpm-workspace.yaml`, because pnpm workspaces may not be
nested. Move `apps/desktop/pnpm-lock.yaml` to the repository root so frozen
installation remains deterministic.

- [ ] **Step 3: Create the root ignore policy**

Create `.gitignore`:

```gitignore
.DS_Store
.worktrees/
node_modules/
.pnpm-store/
dist/
target/
*.db
*.db-shm
*.db-wal
*.sqlite
*.sqlite3
*.app

/app-backups/
/migration-backups/
/bkmr/
/bkmr-scripts/
/bkmrx/
/bkmrx-chrome-ext/
/sqlite:/
```

- [ ] **Step 4: Create the root README**

Create `README.md` with:

````markdown
# bkmrx

Unified repository for the bkmrx desktop application, Chrome extension, and
project documentation.

## Layout

- `apps/desktop` — Tauri and React desktop app
- `apps/chrome-extension` — Chrome Manifest V3 extension
- `docs` — architecture, API, migration, and development documentation

## Commands

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm tauri
```
````

- [ ] **Step 5: Regenerate only the lockfile importer paths**

Run:

```bash
pnpm --dir /private/tmp/bkmrx-monorepo-rewrite-20260724 install --lockfile-only
```

Expected: the root lockfile describes the workspace root and
`apps/desktop`; dependency versions remain unchanged.

- [ ] **Step 6: Commit root workspace metadata**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 add \
  .gitignore README.md package.json pnpm-lock.yaml pnpm-workspace.yaml \
  apps/desktop/pnpm-lock.yaml apps/desktop/pnpm-workspace.yaml
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 commit \
  -m "build: configure bkmrx monorepo workspace"
```

Expected: one workspace-only commit with no product source changes.

### Task 3: Add Shared Documentation

**Files:**
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/docs/ARCHITECTURE.md`
- Create: `/private/tmp/bkmrx-monorepo-rewrite-20260724/docs/**/*.md`

**Interfaces:**
- Consumes: public documentation at `/Users/gyf/MyLib/bkmr-sync/docs`
- Produces: root-level documentation that is committed with application changes

- [ ] **Step 1: Copy only versionable documentation**

Run:

```bash
rsync -a --exclude=.DS_Store \
  /Users/gyf/MyLib/bkmr-sync/docs/ \
  /private/tmp/bkmrx-monorepo-rewrite-20260724/docs/
```

Expected: Markdown documents and documentation subdirectories are copied; no
`.DS_Store` is copied.

- [ ] **Step 2: Check for collisions**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 status --short
```

Expected: only new root `docs/` paths appear. Imported desktop documentation
remains under `docs/`.

- [ ] **Step 3: Commit shared documentation**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 add docs
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 commit \
  -m "docs: add shared bkmrx documentation"
```

Expected: the commit contains only root-level documentation.

### Task 4: Verify the Temporary Monorepo

**Files:**
- No repository changes expected

**Interfaces:**
- Consumes: complete temporary monorepo
- Produces: evidence that history, workspace, desktop app, Rust backend, and extension structure are valid

- [ ] **Step 1: Verify scope and ignored legacy directories**

Run:

```bash
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 status --short
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 ls-files
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 check-ignore \
  bkmr bkmr-scripts app-backups migration-backups bkmrx bkmrx-chrome-ext
```

Expected: status is empty; tracked paths start with `apps/`, `docs/`, or are one
of the four root metadata files; all legacy paths are ignored.

- [ ] **Step 2: Verify both rewritten histories are complete**

Run:

```bash
MERGE_COMMIT="$(git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  log --merges --format=%H -1)"
test "$(git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  rev-list --count "$MERGE_COMMIT^1")" = \
  "$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx rev-list --count HEAD)"
test "$(git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 \
  rev-list --count "$MERGE_COMMIT^2")" = \
  "$(git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext rev-list --count HEAD)"
git -C /private/tmp/bkmrx-monorepo-rewrite-20260724 log --graph --oneline --all -20
```

Expected: both rewritten branch counts match their source repositories and the
graph shows both histories joining the monorepo branch.

- [ ] **Step 3: Install dependencies from the root lockfile**

Run:

```bash
pnpm --dir /private/tmp/bkmrx-monorepo-rewrite-20260724 install --frozen-lockfile
```

Expected: exit zero without changing `pnpm-lock.yaml`.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
pnpm --dir /private/tmp/bkmrx-monorepo-rewrite-20260724 test
```

Expected: all existing Vitest tests pass.

- [ ] **Step 5: Build the desktop frontend**

Run:

```bash
pnpm --dir /private/tmp/bkmrx-monorepo-rewrite-20260724 build
```

Expected: TypeScript and Vite exit zero.

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path \
  /private/tmp/bkmrx-monorepo-rewrite-20260724/apps/desktop/src-tauri/Cargo.toml
```

Expected: all existing Rust tests pass.

- [ ] **Step 7: Validate the Chrome extension structure**

Run:

```bash
node -e "
const fs = require('fs');
const path = '/private/tmp/bkmrx-monorepo-rewrite-20260724/apps/chrome-extension';
const manifest = JSON.parse(fs.readFileSync(path + '/manifest.json', 'utf8'));
const required = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons)
];
for (const file of required) {
  if (!fs.existsSync(path + '/' + file)) throw new Error('Missing: ' + file);
}
console.log('Chrome extension structure valid');
"
```

Expected: `Chrome extension structure valid`.

### Task 5: Install the Verified Repository at the Parent Root

**Files:**
- Move, without deleting: `/Users/gyf/MyLib/bkmr-sync/bkmrx`
- Move, without deleting: `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext`
- Move, without deleting: `/Users/gyf/MyLib/bkmr-sync/docs`
- Create: `/Users/gyf/MyLib/bkmr-sync/apps/**`
- Create: `/Users/gyf/MyLib/bkmr-sync/.git/**`

**Interfaces:**
- Consumes: verified temporary repository
- Produces: monorepo rooted at `/Users/gyf/MyLib/bkmr-sync`

- [ ] **Step 1: Create a recoverable source snapshot directory**

Run:

```bash
mkdir -p /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724
```

Expected: the directory exists outside the future Git tracking scope.

- [ ] **Step 2: Move original in-scope directories into the snapshot**

Run:

```bash
mv /Users/gyf/MyLib/bkmr-sync/bkmrx \
  /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724/bkmrx
mv /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext \
  /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724/bkmrx-chrome-ext
mv /Users/gyf/MyLib/bkmr-sync/docs \
  /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724/docs
```

Expected: all three original directories remain recoverable under the snapshot.

- [ ] **Step 3: Install the verified worktree and Git metadata**

Run:

```bash
rsync -a --exclude=node_modules --exclude=target \
  /private/tmp/bkmrx-monorepo-rewrite-20260724/ \
  /Users/gyf/MyLib/bkmr-sync/
```

Expected: `/Users/gyf/MyLib/bkmr-sync/.git`,
`/Users/gyf/MyLib/bkmr-sync/apps`, and `/Users/gyf/MyLib/bkmr-sync/docs` exist.

- [ ] **Step 4: Restore the bkmrx remote**

Run:

```bash
git -C /Users/gyf/MyLib/bkmr-sync remote add origin git@github.com:Gyufei/bkmrx.git
```

Expected: `git remote -v` shows the existing bkmrx GitHub repository for fetch
and push. Do not push during this migration.

### Task 6: Verify the Installed Monorepo

**Files:**
- No changes expected

**Interfaces:**
- Consumes: installed parent-root monorepo
- Produces: final evidence and rollback location

- [ ] **Step 1: Verify installed Git state and scope**

Run:

```bash
git -C /Users/gyf/MyLib/bkmr-sync status --short --branch
git -C /Users/gyf/MyLib/bkmr-sync diff --check
git -C /Users/gyf/MyLib/bkmr-sync log --follow --oneline -- apps/desktop/package.json
git -C /Users/gyf/MyLib/bkmr-sync log --follow --oneline -- apps/chrome-extension/manifest.json
```

Expected: clean `main`; diff check exits zero; both path logs cross the migration
boundary and show source-era commits.

- [ ] **Step 2: Re-run workspace verification from the installed path**

Run:

```bash
pnpm --dir /Users/gyf/MyLib/bkmr-sync install --frozen-lockfile
pnpm --dir /Users/gyf/MyLib/bkmr-sync test
pnpm --dir /Users/gyf/MyLib/bkmr-sync build
cargo test --manifest-path \
  /Users/gyf/MyLib/bkmr-sync/apps/desktop/src-tauri/Cargo.toml
```

Expected: installation, frontend tests, frontend build, and Rust tests all exit
zero.

- [ ] **Step 3: Report rollback and remote status**

Run:

```bash
git -C /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724/bkmrx \
  rev-parse HEAD
git -C /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724/bkmrx-chrome-ext \
  rev-parse HEAD
git -C /Users/gyf/MyLib/bkmr-sync remote -v
```

Report the two exact source commits together with:

```text
Monorepo root: /Users/gyf/MyLib/bkmr-sync
Original sources: /Users/gyf/MyLib/bkmr-sync/migration-backups/monorepo-source-20260724
Push performed: no
```

Do not remove the source snapshot until the user has used and accepted the
installed monorepo.
