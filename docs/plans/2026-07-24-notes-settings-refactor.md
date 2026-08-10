# Notes and Settings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Notes and Settings into focused modules, unify their error contract, make settings writes atomic, and serialize note saves without changing the deferred frontmatter or path-boundary behavior.

**Architecture:** A crate-level error module supplies the existing wire-compatible error type. Notes uses a concrete managed service over focused repository and watcher modules; Settings uses focused model, runtime, and store modules. The frontend serializes writes per note path and submits complete current settings snapshots.

**Tech Stack:** Rust 2021, Tauri 2, notify 8, serde/serde_json, React 18, TypeScript, TanStack Query 5, Vitest 3.

## Global Constraints

- Do not preserve Markdown frontmatter; current stripping and write-back behavior remains unchanged.
- Do not restrict Notes paths to the configured notes directory; current absolute-path command inputs remain valid.
- Do not add generic repository traits for Notes or Settings.
- Do not change existing bookmark error codes, JSON shapes, Tauri command names, or HTTP behavior.
- Use test-first red-green-refactor for every behavior change.

---

### Task 1: Move the shared error contract out of Bookmarks

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/bookmarks/model.rs`
- Modify: `src-tauri/src/bookmarks/mod.rs`
- Modify: `src-tauri/src/bookmarks/repository.rs`
- Modify: `src-tauri/src/bookmarks/search.rs`
- Modify: `src-tauri/src/bookmarks/service.rs`
- Modify: `src-tauri/src/bookmarks/transfer.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/http_server.rs`
- Test: existing `src-tauri/tests/*.rs`

**Interfaces:**
- Produces: `crate::error::{AppError, AppResult}` with the existing serialized fields and bookmark constructors.
- Preserves: `crate::bookmarks::{AppError, AppResult}` re-exports during migration if existing external tests depend on them.

- [ ] **Step 1: Add a compile-time contract test**

Add a test in `src-tauri/src/error.rs` that serializes an `AppError` and asserts:

```rust
assert_eq!(
    serde_json::to_value(AppError::bookmark_not_found(7)).unwrap(),
    serde_json::json!({
        "code": "bookmark_not_found",
        "message": "Bookmark not found",
        "details": { "id": 7 }
    })
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml error::tests::keeps_wire_contract`

Expected: FAIL because `crate::error` does not exist.

- [ ] **Step 3: Move the existing type and update imports**

Move `AppError`, `AppResult`, and existing constructors verbatim from `bookmarks/model.rs` to
`error.rs`. Add only these new constructors:

```rust
pub fn note_error(code: impl Into<String>, message: impl Into<String>) -> Self;
pub fn settings_error(code: impl Into<String>, message: impl Into<String>) -> Self;
```

Re-export the types from `bookmarks/mod.rs` for compatibility and make backend modules import from
`crate::error`.

- [ ] **Step 4: Run the focused and complete Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml error::tests::keeps_wire_contract
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS with the existing bookmark test count unchanged plus the new unit test.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "refactor: share application error contract"
```

### Task 2: Split Settings and make persistence atomic

**Files:**
- Delete: `src-tauri/src/settings.rs`
- Create: `src-tauri/src/settings/mod.rs`
- Create: `src-tauri/src/settings/model.rs`
- Create: `src-tauri/src/settings/runtime.rs`
- Create: `src-tauri/src/settings/store.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tests/settings.rs`

**Interfaces:**
- Produces: `SettingsStore::load(&Path) -> AppResult<Settings>`.
- Produces: `SettingsStore::save(&Path, &Settings) -> AppResult<()>`.
- Preserves: module-level `settings::load` and `settings::save` wrappers only if existing callers
  need them during the refactor.

- [ ] **Step 1: Add failing Settings storage tests**

Add tests covering invalid JSON and successful atomic replacement:

```rust
#[test]
fn invalid_settings_return_stable_error_code() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("settings.json");
    std::fs::write(&path, b"{").unwrap();

    let error = load(&path).unwrap_err();

    assert_eq!(error.code(), "settings_invalid");
}

#[test]
fn save_replaces_settings_without_leaving_temp_files() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("settings.json");
    save(&path, &Settings::default()).unwrap();
    save(
        &path,
        &Settings {
            notes_dir: Some("/tmp/notes".into()),
            backup_dir: None,
        },
    )
    .unwrap();

    assert_eq!(load(&path).unwrap().notes_dir.as_deref(), Some("/tmp/notes"));
    assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
}
```

- [ ] **Step 2: Run Settings tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test settings`

Expected: FAIL because invalid JSON currently reports `internal_error`.

- [ ] **Step 3: Split Settings and implement atomic save**

Move models and runtime paths unchanged into their focused files. Implement save with:

```rust
let temp_path = path.with_extension(format!("json.tmp-{}", std::process::id()));
let result = (|| -> AppResult<()> {
    let mut file = std::fs::File::create(&temp_path).map_err(settings_io_error)?;
    use std::io::Write;
    file.write_all(&json).map_err(settings_io_error)?;
    file.sync_all().map_err(settings_io_error)?;
    std::fs::rename(&temp_path, path).map_err(settings_io_error)
})();
if result.is_err() {
    let _ = std::fs::remove_file(&temp_path);
}
result
```

Map malformed JSON to `settings_invalid`; map I/O failures to `settings_io_error`.

- [ ] **Step 4: Run focused and complete Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test settings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings src-tauri/src/settings.rs src-tauri/src/commands.rs src-tauri/src/main.rs src-tauri/tests/settings.rs
git commit -m "refactor: split settings and write atomically"
```

### Task 3: Split Notes behind a managed service

**Files:**
- Delete: `src-tauri/src/notes.rs`
- Create: `src-tauri/src/notes/mod.rs`
- Create: `src-tauri/src/notes/model.rs`
- Create: `src-tauri/src/notes/repository.rs`
- Create: `src-tauri/src/notes/service.rs`
- Create: `src-tauri/src/notes/watcher.rs`
- Create: `src-tauri/tests/notes.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `SharedNoteService = Arc<NoteService>`.
- Produces: `NoteService::{scan, read, write, create, delete, rename, stop}` returning `AppResult`.
- Preserves: existing command names and absolute string path parameters.

- [ ] **Step 1: Add failing service tests using a real temporary directory**

Create `src-tauri/tests/notes.rs` with tests equivalent to:

```rust
#[test]
fn service_round_trips_note_file_operations() {
    let temp = TempDir::new().unwrap();
    let service = NoteService::without_events();
    let created = service.create(temp.path().to_str().unwrap(), "one").unwrap();
    service.write(&created, "# changed\n").unwrap();
    assert_eq!(service.read(&created).unwrap(), "# changed\n");
    let renamed = temp.path().join("two.md");
    service.rename(&created, renamed.to_str().unwrap()).unwrap();
    service.delete(renamed.to_str().unwrap()).unwrap();
    assert!(!renamed.exists());
}

#[test]
fn scan_returns_nested_markdown_in_title_order() {
    // Create b.md, nested/a.md, and ignored.txt; assert a then b.
}

#[test]
fn missing_note_returns_stable_error() {
    let error = NoteService::without_events().read("/missing/note.md").unwrap_err();
    assert_eq!(error.code(), "note_io_error");
}
```

- [ ] **Step 2: Run Notes tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test notes`

Expected: FAIL because `NoteService` and the split module do not exist.

- [ ] **Step 3: Move repository and model code**

Move filesystem behavior from `notes.rs` without adding path validation or frontmatter handling.
Return `std::io::Result` from repository functions so service owns error mapping.

- [ ] **Step 4: Implement watcher and service**

Make `NoteWatcher` own `Mutex<Option<(PathBuf, RecommendedWatcher)>>`. Accept an event callback in
its constructor so Tauri-specific emission stays at the composition root. `NoteService::scan`
performs repository scanning, then starts/replaces the watcher and propagates watcher errors.

- [ ] **Step 5: Route commands through managed state**

Construct `Arc<NoteService>` in `main.rs`, manage it with Tauri, and change every Notes command to
accept `State<'_, SharedNoteService>`. Remove global `APP_HANDLE`, `WATCHER`, `set_app_handle`, and
free-function command calls.

- [ ] **Step 6: Run focused and complete Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test notes
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/notes src-tauri/src/notes.rs src-tauri/src/commands.rs src-tauri/src/main.rs src-tauri/tests/notes.rs
git commit -m "refactor: route notes through managed service"
```

### Task 4: Serialize frontend note saves

**Files:**
- Create: `src/notes/note-save-queue.ts`
- Create: `src/notes/note-save-queue.test.ts`
- Modify: `src/notes/NoteEditor.tsx`

**Interfaces:**
- Produces: `NoteSaveQueue.enqueue(path: string, content: string): Promise<void>`.
- Produces: `NoteSaveQueue.pending(path: string): Promise<void>`.
- Consumes: `writeNoteContentApi`.

- [ ] **Step 1: Add failing queue tests**

Test ordered execution and recovery:

```typescript
it('serializes saves for the same path', async () => {
  const releases: Array<() => void> = [];
  const writes: string[] = [];
  const queue = new NoteSaveQueue(async (_path, content) => {
    writes.push(content);
    await new Promise<void>((resolve) => releases.push(resolve));
  });

  const first = queue.enqueue('/a.md', 'first');
  const second = queue.enqueue('/a.md', 'second');
  expect(writes).toEqual(['first']);
  releases.shift()!();
  await first;
  expect(writes).toEqual(['first', 'second']);
  releases.shift()!();
  await second;
});

it('continues after a failed save', async () => {
  // First write rejects; second write still executes and resolves.
});
```

- [ ] **Step 2: Run queue tests and verify RED**

Run: `npm test -- --run src/notes/note-save-queue.test.ts`

Expected: FAIL because `NoteSaveQueue` does not exist.

- [ ] **Step 3: Implement the minimal per-path promise chain**

Store the tail promise for each path. Chain the next write after both fulfillment and rejection of
the prior tail, return the actual write promise to the caller, and remove a tail only when it is
still the latest promise for that path.

- [ ] **Step 4: Run queue tests and verify GREEN**

Run: `npm test -- --run src/notes/note-save-queue.test.ts`

Expected: PASS.

- [ ] **Step 5: Route all NoteEditor writes through one queue**

Create one queue in a ref. Replace direct `save(...)` and `writeNoteContentApi(...)` calls with
`queue.enqueue(path, content)`. Preserve the current 400 ms debounce, empty-content guard, status
display, and frontmatter behavior.

- [ ] **Step 6: Run frontend tests and type build**

Run:

```bash
npm test -- --run
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/notes/NoteEditor.tsx src/notes/note-save-queue.ts src/notes/note-save-queue.test.ts
git commit -m "fix: serialize note saves"
```

### Task 5: Preserve current Settings form state on save

**Files:**
- Create: `src/settings/SettingsPage.test.tsx`
- Modify: `src/settings/SettingsPage.tsx`

**Interfaces:**
- Preserves: `updateSettingsApi(settings: AppSettings)`.
- Changes: both save buttons send `{ backup_dir, notes_dir }` derived from current local state.

- [ ] **Step 1: Add a failing SettingsPage interaction test**

Mock the API adapter and render the page under QueryClientProvider. Resolve initial settings, edit
both inputs, click the backup save button, and assert:

```typescript
expect(updateSettingsApi).toHaveBeenCalledWith({
  backup_dir: '/new/backup',
  notes_dir: '/new/notes',
});
```

Repeat with the Notes save button, or parameterize the same behavior for both buttons.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/settings/SettingsPage.test.tsx`

Expected: FAIL because each handler currently spreads stale queried settings.

- [ ] **Step 3: Submit a current-state snapshot**

Add one helper:

```typescript
function currentSettings(backupDir: string, notesDir: string): AppSettings {
  return {
    backup_dir: backupDir.trim() || null,
    notes_dir: notesDir.trim() || null,
  };
}
```

Both handlers call `updateMutation.mutate(currentSettings(backupDir, notesDir))`.

- [ ] **Step 4: Run focused and complete frontend tests**

Run:

```bash
npm test -- --run src/settings/SettingsPage.test.tsx
npm test -- --run
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingsPage.tsx src/settings/SettingsPage.test.tsx
git commit -m "fix: preserve current settings edits"
```

### Task 6: Final integration verification

**Files:**
- Modify only files required to fix integration failures caused by Tasks 1-5.

**Interfaces:**
- Verifies all success criteria from the approved design.

- [ ] **Step 1: Run formatting checks without broad rewrites**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npx prettier --check "src/**/*.{ts,tsx,css,json}"
```

If changed files fail formatting, format only those changed files.

- [ ] **Step 2: Run complete verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test -- --run
npm run build
git diff --check
git status --short
```

Expected: all tests and build pass; only intentional files are changed.

- [ ] **Step 3: Inspect the final diff against deferred scope**

Confirm explicitly:

- `stripFrontmatter` behavior is unchanged.
- Notes commands still accept absolute paths.
- No path canonicalization or vault containment checks were added.
- Bookmark Tauri and HTTP contracts are unchanged.

- [ ] **Step 4: Commit any final integration-only changes**

```bash
git add <only integration files changed in this task>
git commit -m "test: verify notes and settings refactor"
```

Skip this commit when Task 6 requires no changes.
