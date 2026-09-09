use rusqlite::{params, Transaction};

use crate::error::AppResult;
use crate::identity::{BookmarkId, BookmarkTagId};

pub(super) fn apply(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute_batch(
        "ALTER TABLE bookmarks ADD COLUMN uuid TEXT;
         ALTER TABLE tags ADD COLUMN uuid TEXT;",
    )?;

    let bookmark_rows = collect_integer_ids(transaction, "bookmarks")?;
    for legacy_id in bookmark_rows {
        transaction.execute(
            "UPDATE bookmarks SET uuid = ?1 WHERE id = ?2",
            params![BookmarkId::new(), legacy_id],
        )?;
    }
    let tag_rows = collect_integer_ids(transaction, "tags")?;
    for legacy_id in tag_rows {
        transaction.execute(
            "UPDATE tags SET uuid = ?1 WHERE id = ?2",
            params![BookmarkTagId::new(), legacy_id],
        )?;
    }

    transaction.execute_batch(
        "CREATE UNIQUE INDEX idx_bookmarks_uuid ON bookmarks(uuid);
         CREATE UNIQUE INDEX idx_tags_uuid ON tags(uuid);

         DROP INDEX idx_bookmark_tags_tag_bookmark;
         ALTER TABLE bookmark_tags RENAME TO bookmark_tags_legacy;
         CREATE TABLE bookmark_tags (
             bookmark_id TEXT NOT NULL REFERENCES bookmarks(uuid) ON DELETE CASCADE,
             tag_id TEXT NOT NULL REFERENCES tags(uuid) ON DELETE CASCADE,
             PRIMARY KEY (bookmark_id, tag_id)
         );
         INSERT INTO bookmark_tags(bookmark_id, tag_id)
         SELECT b.uuid, t.uuid
         FROM bookmark_tags_legacy legacy
         JOIN bookmarks b ON b.id = legacy.bookmark_id
         JOIN tags t ON t.id = legacy.tag_id;
         DROP TABLE bookmark_tags_legacy;
         CREATE INDEX idx_bookmark_tags_tag_bookmark
             ON bookmark_tags(tag_id, bookmark_id);

         DROP TABLE bookmarks_fts;
         CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
             bookmark_uuid UNINDEXED,
             url,
             title,
             description,
             tags,
             tokenize = 'trigram'
         );
         INSERT INTO bookmarks_fts(bookmark_uuid, url, title, description, tags)
         SELECT b.uuid, b.url, b.title, b.description,
                COALESCE(group_concat(t.name, ' '), '')
         FROM bookmarks b
         LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.uuid
         LEFT JOIN tags t ON t.uuid = bt.tag_id
         GROUP BY b.uuid;

         CREATE INDEX idx_bookmarks_starred_uuid
             ON bookmarks(starred_at DESC, uuid DESC)
             WHERE starred_at IS NOT NULL;
         CREATE INDEX idx_bookmarks_updated_uuid
             ON bookmarks(updated_at DESC, uuid DESC);",
    )?;
    Ok(())
}

fn collect_integer_ids(transaction: &Transaction<'_>, table: &str) -> AppResult<Vec<i64>> {
    let mut statement = transaction.prepare(&format!("SELECT id FROM {table} ORDER BY id"))?;
    let rows = statement.query_map([], |row| row.get(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
