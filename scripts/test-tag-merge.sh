#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_db="${TAG_MERGE_TEST_DB:-/Users/gyf/MyLib/bkmrx-app/backups/bookmarks-before-tag-merge-20260730-204321.db}"
temp_dir="$(mktemp -d)"
test_db="$temp_dir/bookmarks.db"

cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

cp "$source_db" "$test_db"

before_bookmarks="$(sqlite3 "$test_db" "SELECT COUNT(*) FROM bookmarks")"
before_tags="$(sqlite3 "$test_db" "SELECT COUNT(*) FROM tags")"

(
  cd "$repo_root"
  sqlite3 "$test_db" ".read scripts/merge-tags.sql"
)

after_bookmarks="$(sqlite3 "$test_db" "SELECT COUNT(*) FROM bookmarks")"
after_tags="$(sqlite3 "$test_db" "SELECT COUNT(*) FROM tags")"
fts_rows="$(sqlite3 "$test_db" "SELECT COUNT(*) FROM bookmarks_fts")"
old_tags="$(sqlite3 "$test_db" \
  ".read scripts/tag-merge-map.sql" \
  "SELECT COUNT(*) FROM tags JOIN tag_merge_map ON tags.id = tag_merge_map.old_id")"
missing_keep_tags="$(sqlite3 "$test_db" \
  ".read scripts/tag-merge-map.sql" \
  "SELECT COUNT(*) FROM tag_merge_map LEFT JOIN tags ON tags.id = tag_merge_map.keep_id WHERE tags.id IS NULL")"
orphan_links="$(sqlite3 "$test_db" \
  "SELECT COUNT(*)
   FROM bookmark_tags bt
   LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
   LEFT JOIN tags t ON t.id = bt.tag_id
   WHERE b.id IS NULL OR t.id IS NULL")"
fts_mismatches="$(sqlite3 "$test_db" \
  "SELECT COUNT(*)
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
   ), '')")"

test "$before_bookmarks" = "2151"
test "$after_bookmarks" = "$before_bookmarks"
test "$before_tags" = "3043"
test "$after_tags" = "2919"
test "$fts_rows" = "$after_bookmarks"
test "$old_tags" = "0"
test "$missing_keep_tags" = "0"
test "$orphan_links" = "0"
test "$fts_mismatches" = "0"
test "$(sqlite3 "$test_db" "PRAGMA integrity_check")" = "ok"

echo "tag merge integration test passed"
