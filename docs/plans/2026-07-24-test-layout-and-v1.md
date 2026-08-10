# Frontend Test Layout and v1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all frontend tests under `src/test/` and synchronize every App-owned version source to `1.0.0`.

**Architecture:** Move tests without changing their behavior, using the existing `@/` alias for production imports. Update only first-party package and bundle version metadata, then regenerate lock metadata through the native package managers.

**Tech Stack:** React, TypeScript, Vitest, pnpm, Rust, Cargo, Tauri 2

## Global Constraints

- All frontend tests live directly under `src/test/`.
- Product version is exactly `1.0.0`.
- Dependency versions and product behavior remain unchanged.
- Database schema remains unchanged.

---

### Task 1: Consolidate frontend tests

**Files:**
- Create: `src/test/BookmarkView.test.tsx`
- Create: `src/test/ResultList.test.tsx`
- Create: `src/test/bookmarks.api.test.ts`
- Delete: `src/bookmarks/BookmarkView.test.tsx`
- Delete: `src/bookmarks/ResultList.test.tsx`
- Delete: `src/bookmarks/bookmarks.api.test.ts`

**Interfaces:**
- Consumes: existing `@/` TypeScript path alias and Vitest `*.test.ts(x)` discovery.
- Produces: one flat `src/test/` directory containing every frontend test.

- [ ] **Step 1: Move the three test files**

Use `apply_patch` move hunks so Git records renames:

```text
src/bookmarks/BookmarkView.test.tsx  -> src/test/BookmarkView.test.tsx
src/bookmarks/ResultList.test.tsx    -> src/test/ResultList.test.tsx
src/bookmarks/bookmarks.api.test.ts  -> src/test/bookmarks.api.test.ts
```

- [ ] **Step 2: Replace moved relative production imports**

Use these imports in the moved files:

```ts
import BookmarkView from '@/bookmarks/BookmarkView';
import ResultList from '@/bookmarks/ResultList';
```

For API tests, import the same named exports from:

```ts
import {
  bookmarkQueryKey,
  getNextBookmarkPageParam,
} from '@/bookmarks/bookmarks.api';
```

Change only module IDs in existing mock calls and keep each current factory body:

```text
./bookmarks.api        -> @/bookmarks/bookmarks.api
./SearchBar            -> @/bookmarks/SearchBar
./TagPanel             -> @/bookmarks/TagPanel
./AddBookmarkDialog    -> @/bookmarks/AddBookmarkDialog
./ResultList           -> @/bookmarks/ResultList
../lib/invoke          -> @/lib/invoke
./DeleteBkDialog       -> @/bookmarks/DeleteBkDialog
./EditBookmarkDialog   -> @/bookmarks/EditBookmarkDialog
```

Also change the type-only dynamic import from
`import('./bookmarks.api')` to `import('@/bookmarks/bookmarks.api')`.

- [ ] **Step 3: Verify test discovery and absence of old tests**

Run:

```bash
pnpm test
rg --files src/bookmarks | rg '(test|spec)\.(ts|tsx|js|jsx)$'
rg --files src/test
```

Expected: Vitest reports three passing test files and five passing tests; the
second command has no output; the third lists exactly the three moved files.

- [ ] **Step 4: Commit the test layout**

```bash
git add src/bookmarks src/test
git commit -m "test: consolidate frontend tests"
```

---

### Task 2: Synchronize App version to 1.0.0

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `pnpm-lock.yaml` only if pnpm records the root project version

**Interfaces:**
- Consumes: first-party version fields used by Tauri and `env!("CARGO_PKG_VERSION")`.
- Produces: consistent `1.0.0` display and bundle metadata.

- [ ] **Step 1: Update first-party version declarations**

Set the following values:

```json
// package.json
"version": "1.0.0"

// src-tauri/tauri.conf.json
"version": "1.0.0"
```

```toml
# src-tauri/Cargo.toml
version = "1.0.0"
```

- [ ] **Step 2: Regenerate lock metadata**

Run:

```bash
pnpm install --lockfile-only
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: `src-tauri/Cargo.lock` records `bkmrx` as `1.0.0`; pnpm changes only
root importer metadata if its lockfile format stores the root version.

- [ ] **Step 3: Verify all first-party version sources**

Run:

```bash
node -e 'const p=require("./package.json"); const t=require("./src-tauri/tauri.conf.json"); if(p.version!=="1.0.0"||t.version!=="1.0.0") process.exit(1)'
cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1
```

Expected: the Node command exits zero and Cargo metadata reports the `bkmrx`
package version as `1.0.0`.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
```

Expected: five frontend tests, all 36 Rust tests, build, Clippy, and diff check
pass.

- [ ] **Step 5: Commit the version upgrade**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: release version 1.0.0"
```
