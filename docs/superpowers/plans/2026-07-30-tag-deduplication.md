# Tag Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely merge approved duplicate and near-duplicate tags while preserving every bookmark association and rebuilding the FTS5 tag index.

**Architecture:** Treat the audit document as review input, but convert approved groups into an explicit old-tag-ID → retained-tag-ID mapping before any write. Apply all relational changes and a complete `bookmarks_fts` rebuild in one `BEGIN IMMEDIATE` transaction, with preflight and postflight verification around a recoverable SQLite backup. This is a one-time data migration and does not require an App code change.

**Tech Stack:** SQLite 3, FTS5 trigram, shell runner, existing Rust/rusqlite repository tests.

## Global Constraints

- Source database: `~/Library/Application Support/com.bkmrx/bookmarks.db`.
- Audit baseline: `docs/tag-similarity-audit-2026-07-30.md`.
- Stop the desktop App before backup and migration; do not mutate a live database.
- Never infer merge targets at execution time; use reviewed numeric tag IDs.
- Preserve all bookmarks and all unique bookmark-to-tag associations.
- Rebuild `bookmarks_fts` inside the same transaction as the relational merge.
- Do not change `PRAGMA user_version`; this is data cleanup, not a schema migration.
- Keep the backup until the user has manually tested the migrated App.

---

## Decision Summary

The current schema stores tags in three places:

1. `tags`: canonical tag ID and name.
2. `bookmark_tags`: relational bookmark-to-tag associations.
3. `bookmarks_fts.tags`: a space-joined copy used by full-text search.

Tag filtering uses `bookmark_tags` joined to `tags` in
`apps/desktop/src-tauri/src/bookmarks/search.rs:285`. Full-text search uses
`bookmarks_fts` in `apps/desktop/src-tauri/src/bookmarks/search.rs:174`.
The FTS table is standalone and has no synchronization triggers; normal App
writes explicitly refresh it through `upsert_fts` in
`apps/desktop/src-tauri/src/bookmarks/repository.rs:324`.

Therefore:

- A relational-only SQL merge is insufficient.
- A SQL migration that also rebuilds `bookmarks_fts` is sufficient.
- No App change is required for this one-time cleanup.
- An App change is only warranted if tag merging should become a repeatable
  user-facing feature or maintenance command.

## File Structure

- Create: `scripts/tag-merge-map.sql`
  - Reviewed numeric `old_id → keep_id` mapping only.
- Create: `scripts/merge-tags.sql`
  - Preconditions, relational merge, tag deletion, FTS rebuild, and transaction.
- Create: `scripts/verify-tag-merge.sql`
  - Read-only invariants and per-group verification.
- Create: `scripts/run-tag-merge.sh`
  - App-process check, SQLite backup, migration execution, verification, and paths.
- Modify: `docs/tag-similarity-audit-2026-07-30.md`
  - Mark approved groups and record the executed backup/report paths.
- Test: `apps/desktop/src-tauri/tests/database_repository.rs`
  - Only needed if the existing Rust repository rebuild logic is changed; not
    required for the recommended SQL-only route.

---

### Task 1: Freeze and approve the exact merge scope

**Files:**
- Create: `scripts/tag-merge-map.sql`
- Reference: `docs/tag-similarity-audit-2026-07-30.md`

**Interfaces:**
- Consumes: reviewed audit rows containing tag IDs and suggested retained IDs.
- Produces: temporary table `tag_merge_map(old_id INTEGER PRIMARY KEY, keep_id INTEGER NOT NULL)`.

- [ ] **Step 1: Review high-confidence groups**

Approve format variants, clear singular/plural pairs, and unambiguous
abbreviation/full-name pairs. Review the 12 semantic candidates separately.
Do not include ambiguous groups such as `authorization/authentication`,
`node/nodejs`, or `ci-cd/continuous-*` without inspecting their bookmarks.

- [ ] **Step 2: Encode only approved numeric mappings**

Create `scripts/tag-merge-map.sql` with explicit IDs:

```sql
CREATE TEMP TABLE tag_merge_map (
    old_id INTEGER PRIMARY KEY,
    keep_id INTEGER NOT NULL CHECK (old_id <> keep_id)
);

INSERT INTO tag_merge_map (old_id, keep_id) VALUES
    (364, 4073),  -- tailwind -> tailwindcss
    (428, 4073);  -- tailwind-css -> tailwindcss
```

Repeat the `VALUES` rows for every approved group. Never look up IDs by name
inside the write transaction because names or associations may have changed
since the audit snapshot.

- [ ] **Step 3: Validate the mapping against the current database**

Run a read-only preflight query:

```sql
SELECT m.old_id, old.name AS old_name, m.keep_id, keep.name AS keep_name
FROM tag_merge_map m
LEFT JOIN tags old ON old.id = m.old_id
LEFT JOIN tags keep ON keep.id = m.keep_id
WHERE old.id IS NULL OR keep.id IS NULL;
```

Expected: zero rows.

- [ ] **Step 4: Reject malformed or chained mappings**

```sql
SELECT m.*
FROM tag_merge_map m
JOIN tag_merge_map next ON next.old_id = m.keep_id;
```

Expected: zero rows. Every group must point directly to its final retained ID.

---

### Task 2: Implement the transactional SQL migration

**Files:**
- Create: `scripts/merge-tags.sql`
- Consume: `scripts/tag-merge-map.sql`

**Interfaces:**
- Consumes: `tag_merge_map`.
- Produces: merged `bookmark_tags`, deleted redundant `tags`, and rebuilt
  `bookmarks_fts`.

- [ ] **Step 1: Start with safety pragmas and an immediate transaction**

```sql
.bail on
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
BEGIN IMMEDIATE;
```

The runner must load `scripts/tag-merge-map.sql` after `BEGIN IMMEDIATE`.

- [ ] **Step 2: Abort if mapping IDs are missing**

Use a temporary guard table whose check constraint fails on invalid mappings:

```sql
CREATE TEMP TABLE merge_guard (
    invalid_count INTEGER NOT NULL CHECK (invalid_count = 0)
);

INSERT INTO merge_guard
SELECT COUNT(*)
FROM tag_merge_map m
LEFT JOIN tags old ON old.id = m.old_id
LEFT JOIN tags keep ON keep.id = m.keep_id
WHERE old.id IS NULL OR keep.id IS NULL;
```

- [ ] **Step 3: Preserve the pre-migration bookmark count**

```sql
CREATE TEMP TABLE merge_baseline AS
SELECT
    (SELECT COUNT(*) FROM bookmarks) AS bookmark_count,
    (SELECT COUNT(*) FROM bookmarks_fts) AS fts_count;
```

- [ ] **Step 4: Copy associations to retained tag IDs**

```sql
INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id)
SELECT bt.bookmark_id, m.keep_id
FROM bookmark_tags bt
JOIN tag_merge_map m ON m.old_id = bt.tag_id;
```

`OR IGNORE` is required because a bookmark may already carry both the old and
retained tag, and `(bookmark_id, tag_id)` is the primary key.

- [ ] **Step 5: Delete old associations and redundant tags**

```sql
DELETE FROM bookmark_tags
WHERE tag_id IN (SELECT old_id FROM tag_merge_map);

DELETE FROM tags
WHERE id IN (SELECT old_id FROM tag_merge_map);
```

Deleting associations explicitly makes the operation correct even if the
calling SQLite connection forgot to enable foreign keys.

- [ ] **Step 6: Rebuild the standalone FTS5 table**

Use the same SQL as the App repository implementation:

```sql
DELETE FROM bookmarks_fts;

INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
SELECT b.id, b.url, b.title, b.description,
       coalesce((
           SELECT group_concat(name, ' ')
           FROM (
               SELECT t.name AS name
               FROM bookmark_tags bt
               JOIN tags t ON t.id = bt.tag_id
               WHERE bt.bookmark_id = b.id
               ORDER BY t.name
           )
       ), '')
FROM bookmarks b;
```

Do not use FTS5's generic `'rebuild'` command: `bookmarks_fts` is not an
external-content table, so the relational source data must be inserted
explicitly.

- [ ] **Step 7: Assert core invariants before commit**

```sql
INSERT INTO merge_guard
SELECT CASE
    WHEN (SELECT COUNT(*) FROM bookmarks) =
         (SELECT bookmark_count FROM merge_baseline)
     AND (SELECT COUNT(*) FROM bookmarks_fts) =
         (SELECT bookmark_count FROM merge_baseline)
     AND NOT EXISTS (
         SELECT 1 FROM tags
         WHERE id IN (SELECT old_id FROM tag_merge_map)
     )
     AND NOT EXISTS (
         SELECT 1 FROM bookmark_tags
         WHERE tag_id IN (SELECT old_id FROM tag_merge_map)
     )
    THEN 0 ELSE 1 END;
```

- [ ] **Step 8: Commit atomically**

```sql
COMMIT;
PRAGMA optimize;
```

If any statement fails, `.bail on` stops the runner and the wrapper must issue
or rely on connection-close rollback. The original database must remain
unchanged.

---

### Task 3: Add backup and execution orchestration

**Files:**
- Create: `scripts/run-tag-merge.sh`

**Interfaces:**
- Consumes: source database and the two SQL files.
- Produces: timestamped SQLite backup, migration output, and verification output.

- [ ] **Step 1: Refuse to run while the App is open**

Check for the `bkmrx` process and exit non-zero with an instruction to close it.
External SQL writes do not emit the App's `bookmarks-changed` event, and a live
App could retain stale frontend query caches or perform concurrent writes.

- [ ] **Step 2: Create a consistent SQLite backup**

Use SQLite's backup command rather than copying only the main file:

```bash
sqlite3 "$database_path" ".backup '$backup_path'"
```

Expected: the backup exists and `PRAGMA integrity_check` returns `ok`.

- [ ] **Step 3: Execute the migration with visible failure status**

```bash
sqlite3 "$database_path" \
  ".read scripts/merge-tags.sql"
```

The migration file reads `scripts/tag-merge-map.sql` from the repository root.
The runner must `cd` to the repository root first.

- [ ] **Step 4: Run post-migration verification**

Execute `scripts/verify-tag-merge.sql` read-only and save its output beside the
backup. Do not delete the backup after a successful run.

---

### Task 4: Implement read-only verification

**Files:**
- Create: `scripts/verify-tag-merge.sql`

**Interfaces:**
- Consumes: migrated database and approved mapping.
- Produces: zero-row failure queries plus summary counts.

- [ ] **Step 1: Check relational integrity**

```sql
PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT bt.bookmark_id, bt.tag_id
FROM bookmark_tags bt
LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
LEFT JOIN tags t ON t.id = bt.tag_id
WHERE b.id IS NULL OR t.id IS NULL;
```

Expected: `integrity_check` is `ok`; other queries return zero rows.

- [ ] **Step 2: Check FTS row coverage**

```sql
SELECT
    (SELECT COUNT(*) FROM bookmarks) AS bookmarks,
    (SELECT COUNT(*) FROM bookmarks_fts) AS fts_rows,
    (SELECT COUNT(*) FROM bookmarks b
     LEFT JOIN bookmarks_fts f ON f.rowid = b.id
     WHERE f.rowid IS NULL) AS missing_fts_rows;
```

Expected: `bookmarks = fts_rows` and `missing_fts_rows = 0`. At the current
baseline, both counts are 2,151.

- [ ] **Step 3: Check indexed tag text equals relational tag text**

```sql
SELECT b.id
FROM bookmarks b
JOIN bookmarks_fts f ON f.rowid = b.id
WHERE f.tags <> coalesce((
    SELECT group_concat(name, ' ')
    FROM (
        SELECT t.name AS name
        FROM bookmark_tags bt
        JOIN tags t ON t.id = bt.tag_id
        WHERE bt.bookmark_id = b.id
        ORDER BY t.name
    )
), '');
```

Expected: zero rows.

- [ ] **Step 4: Verify removed and retained IDs**

Reload `tag_merge_map`, then verify:

```sql
SELECT t.id, t.name
FROM tags t
JOIN tag_merge_map m ON m.old_id = t.id;
```

Expected: zero rows. Separately verify every `keep_id` still exists.

- [ ] **Step 5: Manually smoke-test the App**

Start the App only after SQL verification passes. Confirm:

1. The tag selector lists retained names and not removed names.
2. Filtering by a retained tag returns the union of bookmarks previously
   associated with all names in the group.
3. Full-text searching for a retained tag finds those bookmarks.
4. Full-text searching for a removed tag no longer matches merely because of
   stale FTS tag text.
5. Editing and saving one migrated bookmark preserves its tags.

---

### Task 5: Record the executed migration

**Files:**
- Modify: `docs/tag-similarity-audit-2026-07-30.md`

**Interfaces:**
- Consumes: approved mapping, backup path, verification output.
- Produces: durable audit trail for future cleanup work.

- [ ] **Step 1: Mark each group status**

Add one of `merged`, `deferred`, or `rejected` to every reviewed group. Record
the retained ID for merged groups.

- [ ] **Step 2: Record execution metadata**

Append the execution timestamp, database backup path, mapping file commit, tag
count before/after, association count before/after, and verification result.

- [ ] **Step 3: Preserve the original audit baseline**

Do not rewrite historical IDs or counts in the original tables. Add execution
status as new columns or a new section so the pre-migration state remains
traceable.

---

## Optional App Enhancement — Not Required for This Cleanup

Only plan an App change if tag merging will be repeated interactively. The
minimal supported feature would add a repository/service command such as:

```rust
pub struct MergeTag {
    pub old_id: i64,
    pub keep_id: i64,
}

fn merge_tags(&self, mappings: &[MergeTag]) -> AppResult<MergeTagSummary>;
```

Its repository implementation should run the same association migration and
FTS rebuild transaction, then the service should emit `bookmarks-changed`.
This would require Rust repository tests, a Tauri command, and optionally a UI.
It is unnecessary complexity for a reviewed, one-time batch cleanup.
