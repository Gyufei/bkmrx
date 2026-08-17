# Replace BKMR with SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the BKMR runtime completely, replace it with a clean rusqlite bookmark backend, migrate the existing 2145 bookmarks safely, add FTS5 Chinese search, infinite pagination, versioned JSON transfer, a unified API, and install a verified Apple Silicon app.

**Architecture:** SQLite remains the sole source of truth behind `BookmarkRepository`; `BookmarkSearch` provides a replaceable search boundary whose initial implementation is FTS5 Trigram plus short-query LIKE fallback. `BookmarkService` is the only business entry point used by Tauri and Axum. The React app, HTTP API, and Chrome extension migrate together to one snake_case model without compatibility shims.

**Tech Stack:** Rust 2021, Tauri 2, rusqlite bundled SQLite/FTS5, Axum 0.7, React 18, TypeScript, TanStack Query 5, Vitest, macOS Apple Silicon.

## Global Constraints

- Product name remains `bkmrx`.
- Bundle identifier remains `com.bkmrx`.
- SQLite lives at Tauri `app_data_dir()/bookmarks.db`.
- Settings live at Tauri `app_data_dir()/settings.json`.
- Do not use `tauri-plugin-sql`; WebView must never execute SQL.
- Use `rusqlite` with bundled SQLite and verify FTS5 Trigram at runtime.
- SQLite is the only source of truth; every search index is derived and rebuildable.
- Current search is FTS5 Trigram with escaped LIKE fallback for 1–2 Unicode characters.
- All bookmark list modes use the same cursor-page contract with a default page size of 50.
- Future search implementations must satisfy the same `BookmarkSearch` contract.
- Do not implement Meilisearch, semantic search, embeddings, ONNX, sqlite-vec, or metadata fetching.
- New JSON import accepts only the new `format_version = 1`.
- Real BKMR migration is a one-time offline operation and must not remain in the final source tree.
- Code clarity takes priority over compatibility; update App, API, and Chrome extension together.
- Build only Apple Silicon `.app`; do not add DMG, signing, notarization, Intel, or Universal builds.
- Never modify the real old database in place.

---

## File Structure

### bkmrx files to create

- `src-tauri/src/database.rs` — connection setup, app paths, schema migrations.
- `src-tauri/src/bookmarks/mod.rs` — bookmark module exports.
- `src-tauri/src/bookmarks/model.rs` — domain/API/page/import DTOs and structured errors.
- `src-tauri/src/bookmarks/repository.rs` — repository contract and rusqlite implementation.
- `src-tauri/src/bookmarks/search.rs` — search contract, cursor codec, SQLite FTS/LIKE queries.
- `src-tauri/src/bookmarks/service.rs` — CRUD/search/transfer orchestration and event emission.
- `src-tauri/src/bookmarks/transfer.rs` — JSON v1 export, preview, hash verification, import planning.
- `src-tauri/tests/database_repository.rs`
- `src-tauri/tests/search_pagination.rs`
- `src-tauri/tests/transfer.rs`
- `src-tauri/tests/http_api.rs`
- `src/bookmarks/bookmarks.api.test.ts`
- `src/bookmarks/BookmarkView.test.tsx`

### temporary files to create and later delete

- `src-tauri/src/bin/migrate_bkmr.rs`
- `src-tauri/tests/legacy_migration.rs`
- `src-tauri/tests/fixtures/legacy_bkmr.db`

### bkmrx files to modify

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/http_server.rs`
- `src-tauri/src/settings.rs`
- `src-tauri/src/api_docs.html`
- `src-tauri/capabilities/default.json`
- `package.json`
- `pnpm-lock.yaml`
- `src/types.ts`
- `src/lib/invoke.ts`
- `src/bookmarks/bookmarks.api.ts`
- `src/bookmarks/BookmarkView.tsx`
- `src/bookmarks/ResultList.tsx`
- `src/bookmarks/AddBookmarkDialog.tsx`
- `src/bookmarks/EditBookmarkDialog.tsx`
- `src/bookmarks/DeleteBkDialog.tsx`
- `src/bookmarks/TagPanel.tsx`
- `src/settings/SettingsPage.tsx`
- `src/settings/settings.api.ts`
- `README.md`

### bkmrx files to delete

- `src-tauri/src/container.rs`
- `src-tauri/src/service.rs`
- all temporary migration files listed above, after real migration succeeds.

### Chrome extension files to modify

- `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext/popup/popup.js`
- `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext/README.md`

---

### Task 1: Establish the SQLite schema, models, errors, and test harness

**Files:**

- Create: `src-tauri/src/database.rs`
- Create: `src-tauri/src/bookmarks/mod.rs`
- Create: `src-tauri/src/bookmarks/model.rs`
- Create: `src-tauri/tests/database_repository.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `package.json`

**Interfaces:**

- Produces: `Database::open(path)`, `Database::open_in_memory()`, `Database::schema_version()`.
- Produces: `Bookmark`, `TagSummary`, `BookmarkPageRequest`, `BookmarkPage`, `CreateBookmark`, `UpdateBookmark`, `AppError`, `AppResult<T>`.
- Consumes: none.

- [ ] **Step 1: Add direct dependencies and test runners**

Add:

```toml
rusqlite = { version = "0.35", features = ["bundled", "backup"] }
sha2 = "0.10"
base64 = "0.22"
thiserror = "2"
tauri-plugin-dialog = "2"

[dev-dependencies]
tempfile = "3"
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"
```

Add frontend test scripts and dependencies:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^26.0.0",
    "vitest": "^3.0.0"
  }
}
```

Run:

```bash
pnpm install
cd src-tauri && cargo check
```

Expected: dependencies resolve and both commands exit 0.

- [ ] **Step 2: Write failing schema and model tests**

Add tests that assert:

```rust
#[test]
fn creates_v1_schema_and_enables_fts5_trigram() {
    let db = Database::open_in_memory().unwrap();
    assert_eq!(db.schema_version().unwrap(), 1);
    assert!(db.has_table("bookmarks").unwrap());
    assert!(db.has_table("tags").unwrap());
    assert!(db.has_table("bookmark_tags").unwrap());
    assert!(db.has_table("bookmarks_fts").unwrap());
    db.assert_fts5_trigram().unwrap();
}

#[test]
fn rejects_database_newer_than_supported_schema() {
    let db = Database::open_in_memory().unwrap();
    db.set_user_version_for_test(2).unwrap();
    let err = db.verify_supported_version().unwrap_err();
    assert_eq!(err.code(), "unsupported_schema_version");
}
```

Run:

```bash
cd src-tauri && cargo test --test database_repository creates_v1_schema
```

Expected: FAIL because `Database` does not exist.

- [ ] **Step 3: Define the canonical DTOs and errors**

Implement these exact public shapes:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Bookmark {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub access_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub accessed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagSummary {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkPageRequest {
    pub query: String,
    pub tags: Vec<String>,
    pub cursor: Option<String>,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkPage {
    pub items: Vec<Bookmark>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

pub type AppResult<T> = Result<T, AppError>;
```

Use helpers for `validation_error`, `invalid_cursor`, `bookmark_not_found`, `bookmark_url_conflict`, `unsupported_import_format`, `import_validation_failed`, `database_error`, and `internal_error`.

- [ ] **Step 4: Implement database creation and migrations**

Use:

```sql
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    accessed_at INTEGER NULL
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE bookmark_tags (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX idx_bookmark_tags_tag_bookmark
    ON bookmark_tags(tag_id, bookmark_id);

CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
    url,
    title,
    description,
    tags,
    tokenize = 'trigram'
);
```

Apply:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

Set `PRAGMA user_version = 1` only after the migration transaction succeeds.

- [ ] **Step 5: Run Task 1 tests**

Run:

```bash
cd src-tauri && cargo test --test database_repository
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/database.rs \
  src-tauri/src/bookmarks src-tauri/src/lib.rs src-tauri/tests/database_repository.rs \
  package.json pnpm-lock.yaml
git commit -m "feat: add standalone sqlite schema"
```

---

### Task 2: Implement the bookmark repository and transactional FTS maintenance

**Files:**

- Create: `src-tauri/src/bookmarks/repository.rs`
- Modify: `src-tauri/tests/database_repository.rs`
- Modify: `src-tauri/src/bookmarks/mod.rs`

**Interfaces:**

- Consumes: `Database`, canonical model types.
- Produces:

```rust
pub trait BookmarkRepository: Send + Sync {
    fn create(&self, input: CreateBookmark) -> AppResult<Bookmark>;
    fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark>;
    fn delete_many(&self, ids: &[i64]) -> AppResult<u64>;
    fn get_by_id(&self, id: i64) -> AppResult<Option<Bookmark>>;
    fn get_by_url(&self, url: &str) -> AppResult<Option<Bookmark>>;
    fn get_by_ids_ordered(&self, ids: &[i64]) -> AppResult<Vec<Bookmark>>;
    fn get_tags(&self) -> AppResult<Vec<TagSummary>>;
    fn record_access(&self, id: i64) -> AppResult<Bookmark>;
    fn rebuild_search_index(&self) -> AppResult<()>;
}
```

- [ ] **Step 1: Add failing repository tests**

Cover:

```rust
#[test] fn create_round_trips_bookmark_and_tags()
#[test] fn duplicate_url_returns_stable_conflict_code()
#[test] fn update_replaces_complete_tag_set()
#[test] fn delete_cascades_relations_and_fts()
#[test] fn record_access_does_not_change_updated_at()
#[test] fn get_by_ids_preserves_input_order()
#[test] fn failed_write_rolls_back_bookmark_tags_and_fts()
#[test] fn rebuild_search_index_restores_missing_document()
```

Run:

```bash
cd src-tauri && cargo test --test database_repository repository_
```

Expected: FAIL because `SqliteBookmarkRepository` is missing.

- [ ] **Step 2: Implement input normalization**

Implement:

```rust
fn normalize_url(url: &str) -> AppResult<String>;
fn normalize_title(title: &str, url: &str) -> String;
fn normalize_tags(tags: Vec<String>) -> Vec<String>;
```

Rules:

- trim URL and reject empty;
- preserve full URL otherwise;
- use URL when title trims empty;
- trim tags, drop empty tags, deduplicate deterministically;
- do not canonicalize URL query/fragment/case.

- [ ] **Step 3: Implement transactional CRUD**

For each create/update/delete transaction:

1. mutate `bookmarks`;
2. upsert tags;
3. replace `bookmark_tags` when applicable;
4. build `tags_text` with deterministic ordering;
5. delete old FTS row when present;
6. insert new FTS row with `rowid = bookmark.id`;
7. commit.

Map SQLite unique violations to:

```rust
AppError::bookmark_url_conflict(url)
```

- [ ] **Step 4: Implement hydration without N+1**

Use one bookmark query and one batched tag query. Reorder in Rust according to the requested ID sequence.

- [ ] **Step 5: Run repository verification**

Run:

```bash
cd src-tauri && cargo test --test database_repository
cargo clippy --all-targets -- -D warnings
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src-tauri/src/bookmarks/repository.rs \
  src-tauri/src/bookmarks/mod.rs src-tauri/tests/database_repository.rs
git commit -m "feat: add sqlite bookmark repository"
```

---

### Task 3: Implement replaceable search and cursor pagination

**Files:**

- Create: `src-tauri/src/bookmarks/search.rs`
- Create: `src-tauri/tests/search_pagination.rs`
- Modify: `src-tauri/src/bookmarks/mod.rs`

**Interfaces:**

- Consumes: `BookmarkPageRequest`, SQLite database.
- Produces:

```rust
#[derive(Debug, Clone, PartialEq)]
pub struct SearchPage {
    pub bookmark_ids: Vec<i64>,
    pub next_cursor: Option<String>,
}

pub trait BookmarkSearch: Send + Sync {
    fn search(&self, request: &BookmarkPageRequest) -> AppResult<SearchPage>;
}
```

- [ ] **Step 1: Write failing search tests**

Use fixtures containing Chinese, English, URL punctuation, and multiple tags.

Cover:

```rust
#[test] fn empty_query_pages_by_updated_at_then_id()
#[test] fn tag_filter_requires_all_selected_tags()
#[test] fn one_character_chinese_query_uses_like()
#[test] fn two_character_chinese_query_uses_like()
#[test] fn three_character_chinese_query_uses_trigram()
#[test] fn special_characters_never_raise_fts_syntax_errors()
#[test] fn text_and_tags_compose()
#[test] fn page_size_is_limited_to_one_through_one_hundred()
#[test] fn cursor_is_bound_to_query_and_sorted_tags()
#[test] fn pages_contain_no_duplicates_or_omissions()
```

Run:

```bash
cd src-tauri && cargo test --test search_pagination
```

Expected: FAIL because `SqliteFtsSearch` is missing.

- [ ] **Step 2: Implement versioned opaque cursors**

Internal payload:

```rust
#[derive(Serialize, Deserialize)]
struct CursorV1 {
    version: u8,
    query_hash: String,
    mode: CursorMode,
}

enum CursorMode {
    Recent { updated_at: i64, id: i64 },
    SearchOffset { offset: u64 },
}
```

Encode JSON with URL-safe base64 without padding. Hash the normalized query, sorted tags, and page size. Reject mismatches with `invalid_cursor`.

- [ ] **Step 3: Implement query routing**

Rules:

```rust
match unicode_scalar_count(query.trim()) {
    0 => search_recent_or_tags(...),
    1 | 2 => search_like(...),
    _ => search_fts5_trigram(...),
}
```

LIKE must bind:

```sql
LIKE ? ESCAPE '\'
```

and escape `\`, `%`, `_`.

FTS input must be bound as a safe literal phrase. Tags use relational `GROUP BY/HAVING COUNT(DISTINCT ...) = ?`.

- [ ] **Step 4: Fetch `page_size + 1` and emit next cursor**

Use keyset for recent/tag-only mode and controlled offset for FTS/LIKE mode. Return only ordered IDs.

- [ ] **Step 5: Verify search**

Run:

```bash
cd src-tauri && cargo test --test search_pagination
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src-tauri/src/bookmarks/search.rs \
  src-tauri/src/bookmarks/mod.rs src-tauri/tests/search_pagination.rs
git commit -m "feat: add paginated fts5 search"
```

---

### Task 4: Implement BookmarkService and canonical Tauri commands

**Files:**

- Create: `src-tauri/src/bookmarks/service.rs`
- Replace: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/bookmarks/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**

- Consumes: `BookmarkRepository`, `BookmarkSearch`.
- Produces:

```rust
pub struct BookmarkService<R, S> { repository: R, search: S }

impl<R: BookmarkRepository, S: BookmarkSearch> BookmarkService<R, S> {
    pub fn query(&self, request: BookmarkPageRequest) -> AppResult<BookmarkPage>;
    pub fn create(&self, input: CreateBookmark) -> AppResult<Bookmark>;
    pub fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark>;
    pub fn delete_many(&self, ids: Vec<i64>) -> AppResult<u64>;
    pub fn get_by_id(&self, id: i64) -> AppResult<Bookmark>;
    pub fn get_by_url(&self, url: String) -> AppResult<Option<Bookmark>>;
    pub fn get_tags(&self) -> AppResult<Vec<TagSummary>>;
    pub fn record_access(&self, id: i64) -> AppResult<Bookmark>;
}
```

- [ ] **Step 1: Write service tests in repository/search test modules**

Assert ordered hydration, not-found mapping, validation, page forwarding, and event invalidation boundaries.

- [ ] **Step 2: Implement service orchestration**

Search page:

```rust
let hits = self.search.search(&request)?;
let items = self.repository.get_by_ids_ordered(&hits.bookmark_ids)?;
Ok(BookmarkPage { items, next_cursor: hits.next_cursor })
```

- [ ] **Step 3: Replace Tauri bookmark commands**

Expose:

```text
query_bookmarks
create_bookmark
update_bookmark
delete_bookmarks
get_bookmark_by_url
get_tags
record_bookmark_access
```

Commands return canonical DTOs and `AppError`, not strings.

- [ ] **Step 4: Initialize App State**

In setup:

1. obtain `app_data_dir`;
2. open `bookmarks.db`;
3. create repository and search;
4. manage one shared service state;
5. start Axum with the same service;
6. keep notes initialization unchanged.

- [ ] **Step 5: Verify compile and tests**

Run:

```bash
cd src-tauri && cargo test
cargo check
```

Expected: PASS; old `container` references may remain only until cleanup task but may not be invoked.

- [ ] **Step 6: Commit Task 4**

```bash
git add src-tauri/src/bookmarks/service.rs src-tauri/src/bookmarks/mod.rs \
  src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "refactor: route bookmark commands through service"
```

---

### Task 5: Redesign the Axum HTTP API and contract tests

**Files:**

- Replace: `src-tauri/src/http_server.rs`
- Create: `src-tauri/tests/http_api.rs`
- Modify: `src-tauri/src/api_docs.html`

**Interfaces:**

- Consumes: shared `BookmarkService`.
- Produces:

```text
GET    /api/health
GET    /api/bookmarks
POST   /api/bookmarks
GET    /api/bookmarks/by-url
GET    /api/bookmarks/:id
PATCH  /api/bookmarks/:id
DELETE /api/bookmarks/:id
GET    /api/tags
```

- [ ] **Step 1: Write failing HTTP contract tests**

Use `tower::ServiceExt::oneshot`.

Assert:

```rust
assert_eq!(response.status(), StatusCode::CREATED);
assert_eq!(json["url"], "https://example.com");

assert_eq!(conflict.status(), StatusCode::CONFLICT);
assert_eq!(json["error"]["code"], "bookmark_url_conflict");

assert_eq!(page["items"].as_array().unwrap().len(), 50);
assert!(page.get("next_cursor").is_some());
```

Cover every route and stable error mapping.

- [ ] **Step 2: Build a testable Router constructor**

Implement:

```rust
pub fn router(service: SharedBookmarkService) -> Router;
```

Keep server binding and shutdown separate from router construction.

- [ ] **Step 3: Implement canonical responses**

- single resource: direct Bookmark JSON;
- page: `{ items, next_cursor }`;
- POST: 201;
- PATCH: 200;
- DELETE: 204;
- structured error: `{ error: AppError }`.

- [ ] **Step 4: Update HTML API docs**

Document canonical fields, pagination, examples, and all error codes. Remove old check response and PUT examples.

- [ ] **Step 5: Run API tests**

Run:

```bash
cd src-tauri && cargo test --test http_api
cargo test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src-tauri/src/http_server.rs src-tauri/tests/http_api.rs \
  src-tauri/src/api_docs.html
git commit -m "feat: unify bookmark http api"
```

---

### Task 6: Add versioned JSON export, preview, and transactional import

**Files:**

- Create: `src-tauri/src/bookmarks/transfer.rs`
- Create: `src-tauri/tests/transfer.rs`
- Modify: `src-tauri/src/bookmarks/model.rs`
- Modify: `src-tauri/src/bookmarks/service.rs`
- Modify: `src-tauri/src/commands.rs`

**Interfaces:**

- Produces:

```rust
pub struct BookmarkExportV1 {
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub bookmarks: Vec<BookmarkTransferRecord>,
}

pub struct ImportPreview {
    pub file_hash: String,
    pub total: usize,
    pub create_count: usize,
    pub update_count: usize,
    pub skip_count: usize,
}
```

- [ ] **Step 1: Write failing transfer tests**

Cover:

```rust
#[test] fn export_v1_omits_database_ids()
#[test] fn exported_json_round_trips_into_empty_database()
#[test] fn preview_rejects_unknown_format()
#[test] fn preview_rejects_duplicate_urls()
#[test] fn apply_rejects_file_changed_after_preview()
#[test] fn merge_uses_newer_content_earlier_created_and_larger_access_count()
#[test] fn one_invalid_record_rolls_back_entire_import()
```

- [ ] **Step 2: Implement deterministic v1 serialization**

Use RFC 3339 timestamps and stable bookmark/tag ordering. Do not deserialize old top-level arrays.

- [ ] **Step 3: Implement atomic export**

1. read a consistent snapshot;
2. serialize;
3. write a sibling temporary file;
4. `sync_all`;
5. rename to `bookmarks-YYYYMMDD-HHMMSS.json`.

- [ ] **Step 4: Implement preview and hash-gated apply**

Preview validates all records before returning counts. Apply re-reads and compares SHA-256, then imports everything in one transaction.

- [ ] **Step 5: Expose Tauri commands**

```text
export_bookmarks
preview_bookmark_import
apply_bookmark_import
```

- [ ] **Step 6: Verify transfer**

Run:

```bash
cd src-tauri && cargo test --test transfer
cargo test
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src-tauri/src/bookmarks/transfer.rs src-tauri/src/bookmarks/model.rs \
  src-tauri/src/bookmarks/service.rs src-tauri/src/commands.rs \
  src-tauri/tests/transfer.rs
git commit -m "feat: add versioned bookmark transfer"
```

---

### Task 7: Move settings to App Data and add native file dialogs

**Files:**

- Replace: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/lib/invoke.ts`
- Modify: `src/settings/settings.api.ts`
- Modify: `src/settings/SettingsPage.tsx`

**Interfaces:**

- Consumes: App Data directory, transfer commands.
- Produces: `SystemInfo { app_data_dir, sqlite_db_path, schema_version, search_backend, app_version }`.

- [ ] **Step 1: Add failing settings path tests**

Assert settings are read/written under an injected App Data directory and never under `~/.bkmr`.

- [ ] **Step 2: Refactor settings around an explicit path**

Implement:

```rust
pub fn load(path: &Path) -> AppResult<Settings>;
pub fn save(path: &Path, settings: &Settings) -> AppResult<()>;
```

App setup computes `app_data_dir.join("settings.json")`.

- [ ] **Step 3: Register dialog plugin and minimum permission**

Initialize `tauri_plugin_dialog::init()` and add only required dialog capability. Confirm no `sql:*` permission exists.

- [ ] **Step 4: Replace settings-page system information**

Remove BKMR/ONNX fields. Display:

- App Data directory;
- SQLite database path;
- schema version;
- `sqlite_fts5_trigram`;
- App version.

- [ ] **Step 5: Add export/import UI**

Flow:

1. native save/open selection;
2. call Rust export or preview;
3. display create/update/skip counts;
4. require confirmation;
5. call hash-gated apply;
6. invalidate bookmark and tag queries.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm test
pnpm build
cd src-tauri && cargo test
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src-tauri/src/settings.rs src-tauri/src/main.rs src-tauri/Cargo.toml \
  src-tauri/Cargo.lock src-tauri/capabilities/default.json src/lib/invoke.ts \
  src/settings/settings.api.ts src/settings/SettingsPage.tsx
git commit -m "feat: add app data settings and json transfer ui"
```

---

### Task 8: Replace fake pagination with React Query infinite pagination

**Files:**

- Modify: `src/types.ts`
- Replace: `src/lib/invoke.ts` bookmark section
- Replace: `src/bookmarks/bookmarks.api.ts`
- Create: `src/bookmarks/bookmarks.api.test.ts`
- Replace: `src/bookmarks/BookmarkView.tsx`
- Modify: `src/bookmarks/ResultList.tsx`
- Create: `src/bookmarks/BookmarkView.test.tsx`
- Modify: `src/bookmarks/AddBookmarkDialog.tsx`
- Modify: `src/bookmarks/EditBookmarkDialog.tsx`
- Modify: `src/bookmarks/DeleteBkDialog.tsx`
- Modify: `src/bookmarks/TagPanel.tsx`

**Interfaces:**

- Consumes: canonical Tauri commands and page DTO.
- Produces:

```ts
export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  access_count: number;
  created_at: string;
  updated_at: string;
  accessed_at: string | null;
}

export interface BookmarkPage {
  items: Bookmark[];
  next_cursor: string | null;
}
```

- [ ] **Step 1: Write failing API and infinite-query tests**

Assert:

```ts
expect(queryKey).toEqual(['bookmarks', query, sortedTags, 50]);
expect(getNextPageParam({ next_cursor: 'abc' })).toBe('abc');
expect(getNextPageParam({ next_cursor: null })).toBeUndefined();
```

Render BookmarkView with mocked pages and assert pages flatten, next page loads once, and next-page error does not clear existing rows.

- [ ] **Step 2: Replace TypeScript DTOs and invoke wrappers**

Remove `modified?` and optional canonical fields. Add `AppError`, `BookmarkPageRequest`, `BookmarkPage`, and import-preview types.

- [ ] **Step 3: Implement one query API**

```ts
export function queryBookmarksApi(request: BookmarkPageRequest) {
  return invokeQueryBookmarks(request);
}
```

Delete `searchAllBookmarksApi` and `searchBookmarksApi`.

- [ ] **Step 4: Implement `useInfiniteQuery`**

Use:

```ts
useInfiniteQuery({
  queryKey: [BkQueryApiKey.BOOKMARKS, query, [...selectedTags].sort(), 50],
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => queryBookmarksApi({
    query,
    tags: selectedTags,
    cursor: pageParam,
    page_size: 50,
  }),
  getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
});
```

- [ ] **Step 5: Update ResultList states**

Separate:

- initial loading;
- `isFetchingNextPage`;
- initial error;
- next-page error with retry;
- end-of-list.

Guard IntersectionObserver with `hasNextPage && !isFetchingNextPage`.

- [ ] **Step 6: Unify cache invalidation**

Every bookmark mutation invalidates:

```ts
queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
```

The `bookmarks-changed` event performs the same invalidation.

- [ ] **Step 7: Verify frontend**

Run:

```bash
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 8**

```bash
git add src/types.ts src/lib/invoke.ts src/bookmarks
git commit -m "feat: add infinite bookmark pagination"
```

---

### Task 9: Coordinate the Chrome extension with the canonical HTTP API

**Files:**

- Modify: `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext/popup/popup.js`
- Modify: `/Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext/README.md`

**Interfaces:**

- Consumes: canonical HTTP API from Task 5.
- Produces: extension create, lookup, patch, tags, and structured error handling.

- [ ] **Step 1: Add small response parsing helpers**

Implement:

```js
async function parseApiResponse(response) {
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || '请求失败');
  }
  return body;
}
```

- [ ] **Step 2: Update routes**

- health check: `GET /api/health`;
- lookup: `GET /api/bookmarks/by-url?url=...`;
- create: `POST /api/bookmarks`;
- update: `PATCH /api/bookmarks/:id`;
- tags: `GET /api/tags`.

- [ ] **Step 3: Remove old response branches**

Delete `exists`, `duplicate`, top-level error-string handling, PUT, and temporary status strings.

- [ ] **Step 4: Update extension documentation**

Document canonical Bookmark and AppError.

- [ ] **Step 5: Manual extension smoke test**

With the dev App running:

1. open an unbookmarked tab;
2. create;
3. reopen extension and verify lookup;
4. update tags/description;
5. verify App receives event and invalidates queries.

Expected: all operations succeed.

- [ ] **Step 6: Commit extension changes in its repository**

```bash
git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext add popup/popup.js README.md
git -C /Users/gyf/MyLib/bkmr-sync/bkmrx-chrome-ext commit -m "refactor: use canonical bkmrx api"
```

---

### Task 10: Add and test the temporary legacy migration CLI

**Files:**

- Create: `src-tauri/src/bin/migrate_bkmr.rs`
- Create: `src-tauri/tests/legacy_migration.rs`
- Create: `src-tauri/tests/fixtures/legacy_bkmr.db`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**

- Consumes: legacy BKMR database and current `bkmr_lib` only behind `legacy-migration`.
- Produces: backup directory, migration report, and validated `.migrating` target.

- [ ] **Step 1: Isolate the legacy dependency**

Configure:

```toml
[features]
legacy-migration = ["dep:bkmr_lib"]

[dependencies]
bkmr_lib = { package = "bkmr", git = "https://github.com/sysid/bkmr", rev = "a6ca05ef4e20baa3c59d96653e8bdf734a27fca1", optional = true }

[[bin]]
name = "migrate_bkmr"
path = "src/bin/migrate_bkmr.rs"
required-features = ["legacy-migration"]
```

The default App target must compile without the feature.

- [ ] **Step 2: Write failing migration tests**

Cover:

```rust
#[test] fn preserves_ids_and_business_fields()
#[test] fn normalizes_legacy_tags_into_relations()
#[test] fn omits_embedding_hash_file_and_opener_fields()
#[test] fn creates_snapshot_json_and_manifest_before_target()
#[test] fn refuses_existing_target()
#[test] fn source_integrity_failure_stops_before_target()
#[test] fn validation_failure_never_promotes_migrating_file()
```

- [ ] **Step 3: Implement CLI arguments and preflight**

```text
migrate_bkmr
  --source <legacy.db>
  --target <bookmarks.db>
  --backup-dir <timestamped-directory>
```

Require:

- source exists;
- target does not exist;
- App port 8733 is not accepting connections;
- `PRAGMA integrity_check = ok`.

- [ ] **Step 4: Implement backup gate**

Before target creation:

1. use SQLite Backup API for `legacy.db`;
2. export complete legacy business JSON;
3. create `manifest.json` with SHA-256 and counts;
4. fsync artifacts.

- [ ] **Step 5: Implement migration and validation**

Write `target.migrating`, preserve IDs, convert times to Unix milliseconds, normalize tags, rebuild FTS, run integrity/foreign-key checks, compare URL and tag sets, then atomically promote.

- [ ] **Step 6: Verify feature isolation**

Run:

```bash
cd src-tauri
cargo test --features legacy-migration --test legacy_migration
cargo check --no-default-features
cargo tree --no-default-features | rg "bkmr|fastembed|ort|diesel" && exit 1 || true
```

Expected: migration tests pass; default target tree contains no legacy stack.

- [ ] **Step 7: Commit temporary migration tool**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/bin/migrate_bkmr.rs \
  src-tauri/tests/legacy_migration.rs src-tauri/tests/fixtures/legacy_bkmr.db
git commit -m "feat: add one-time bkmr migration tool"
```

---

### Task 11: Update documentation before the real cutover

**Files:**

- Modify: `README.md`
- Modify: `src-tauri/src/api_docs.html`
- Create: `docs/migration/runbook.md`
- Create: `docs/migration/rollback.md`

**Interfaces:**

- Consumes: all implemented commands, paths, API, and CLI.
- Produces: exact operator commands for backup, migration, build, install, and rollback.

- [ ] **Step 1: Replace README architecture and setup**

Remove BKMR prerequisites and document:

- local SQLite;
- FTS5 Trigram;
- pagination;
- JSON transfer;
- App Data paths;
- new API.

- [ ] **Step 2: Write the migration runbook**

Include exact source:

```text
/Users/gyf/.config/bkmr/bkmr.db
```

backup root:

```text
/Users/gyf/MyLib/bkmr-sync/migration-backups/
```

target:

```text
~/Library/Application Support/com.bkmrx/bookmarks.db
```

Include port checks, CLI command, expected counts, SQL verification, and abort conditions.

- [ ] **Step 3: Write rollback runbook**

Include old App restore, new DB quarantine, old DB unchanged guarantee, and re-migration sequence.

- [ ] **Step 4: Verify documentation**

Run:

```bash
rg -n "bkmr_lib|ONNX|sqlite-vec|hybrid_search|load_all_bookmarks" README.md docs/migration src-tauri/src/api_docs.html
```

Expected: only historical/migration references remain where intentional.

- [ ] **Step 5: Commit Task 11**

```bash
git add README.md src-tauri/src/api_docs.html docs/migration
git commit -m "docs: add sqlite migration runbooks"
```

---

### Task 12: Execute the real backup and migration

**Files outside Git:**

- Create: `/Users/gyf/MyLib/bkmr-sync/migration-backups/<timestamp>/`
- Create: `~/Library/Application Support/com.bkmrx/bookmarks.db`

**Interfaces:**

- Consumes: real legacy database.
- Produces: validated new database and migration report.

- [ ] **Step 1: Freeze writes**

Quit old App. Verify:

```bash
lsof -nP -iTCP:8733 -sTCP:LISTEN
```

Expected: no output.

- [ ] **Step 2: Record source baseline**

Run read-only integrity, count, max ID, table/schema, and SHA-256 commands. Store output in timestamped backup directory.

Expected bookmark count at planning time: 2145. If it differs, record the new count and use it consistently; do not assume data loss.

- [ ] **Step 3: Run real migration**

Run the exact command from `docs/migration/runbook.md` with explicit absolute paths.

Expected:

- three backup artifacts exist;
- target `.migrating` validates;
- final target is promoted;
- source file hash remains unchanged.

- [ ] **Step 4: Independently validate source and target**

Compare:

- count;
- max ID;
- URL set;
- every business field;
- every tag set;
- integrity;
- foreign keys;
- FTS row count.

- [ ] **Step 5: Save migration report**

Record exact commands, outputs, old/new hashes, counts, and timestamp in the backup directory. Do not commit personal data or absolute backup artifacts.

---

### Task 13: Remove all legacy and migration code

**Files:**

- Delete: `src-tauri/src/container.rs`
- Delete: `src-tauri/src/service.rs`
- Delete: `src-tauri/src/bin/migrate_bkmr.rs`
- Delete: `src-tauri/tests/legacy_migration.rs`
- Delete: `src-tauri/tests/fixtures/legacy_bkmr.db`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**

- Consumes: successful Task 12 migration report.
- Produces: final App with no legacy or migration runtime code.

- [ ] **Step 1: Delete temporary and old modules**

Use `apply_patch` deletes. Remove `legacy-migration`, old `bkmr_lib`, and any unused dependencies.

- [ ] **Step 2: Regenerate and inspect dependency tree**

Run:

```bash
cd src-tauri
cargo check
cargo tree | rg "bkmr|diesel|fastembed|ort|sqlite.?vec"
```

Expected: second command returns no matches.

- [ ] **Step 3: Search code and generated frontend**

Run:

```bash
rg -n "bkmr_lib|ServiceContainer|BkmrBookmark|BkmrTag|HybridSearch|SearchMode|ONNX|embedding|sqlite_vec|sqlite-vec|fastembed|ort" \
  src-tauri/src src package.json src-tauri/Cargo.toml README.md
```

Expected: no unintended matches. Product name `bkmrx` and migration documentation are allowed.

- [ ] **Step 4: Run full test suite**

```bash
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
cd .. && pnpm test && pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit final cleanup**

```bash
git add -A
git commit -m "refactor: remove bkmr runtime"
```

---

### Task 14: Build, install, smoke test, and document completion

**Files:**

- Modify: `docs/migration/runbook.md` only if verified commands differ.
- Create outside Git: timestamped old App backup and installation log.

**Interfaces:**

- Consumes: final source and migrated database.
- Produces: installed Apple Silicon `bkmrx.app`.

- [ ] **Step 1: Final verification before claiming completion**

Run:

```bash
git status --short
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
cd .. && pnpm test && pnpm build
pnpm tauri build -- --bundles app
```

Expected: all pass and `.app` exists under the Tauri release bundle directory.

- [ ] **Step 2: Verify architecture and bundle**

Run:

```bash
file src-tauri/target/release/bundle/macos/bkmrx.app/Contents/MacOS/bkmrx
```

Expected: arm64 executable.

- [ ] **Step 3: Back up and install the App**

Quit the old App. Copy `/Applications/bkmrx.app` to a timestamped recoverable backup, then copy the new App into `/Applications`.

Do not delete the old App backup.

- [ ] **Step 4: Run installed-App smoke tests**

Verify:

- App opens the new App Data database;
- first page has at most 50 rows;
- scrolling fetches more;
- Chinese 1/2/3+ character search;
- tags and combined filters;
- create/update/delete/access count;
- JSON export/preview/import;
- restart persistence;
- HTTP health/page/CRUD;
- Chrome extension lookup/create/update;
- old database hash remains unchanged.

- [ ] **Step 5: Verify rollback path without destroying the successful install**

Check that old App backup and old DB are present and document the exact restore command. Do not actually overwrite a successful new install unless smoke tests fail.

- [ ] **Step 6: Record final evidence**

Report:

- Git commits;
- test commands and results;
- migration counts/hashes without exposing bookmark content;
- bundle path;
- installed path;
- remaining backup paths;
- any deferred work.

---

## Plan Self-Review Checklist

- [ ] Every design requirement maps to at least one task.
- [ ] Temporary migration code is created, used, and deleted in separate gated tasks.
- [ ] Real database is untouched until automated tests and fixture migration pass.
- [ ] Default App compiles without the legacy feature before real migration.
- [ ] JSON transfer is permanent; BKMR migration is temporary.
- [ ] App, Tauri, HTTP, and Chrome extension share canonical fields.
- [ ] Infinite pagination covers every list/search mode.
- [ ] FTS5 Chinese 1/2/3+ behavior has explicit tests.
- [ ] Final release cannot contain BKMR, Diesel, ONNX, sqlite-vec, or migration code.
- [ ] Rollback retains both old App and old database.
