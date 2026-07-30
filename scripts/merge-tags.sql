.bail on
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
BEGIN IMMEDIATE;

.read scripts/tag-merge-map.sql

CREATE TEMP TABLE merge_guard (
    invalid_count INTEGER NOT NULL CHECK (invalid_count = 0)
);

INSERT INTO merge_guard
SELECT COUNT(*)
FROM tag_merge_map m
LEFT JOIN tags old ON old.id = m.old_id
LEFT JOIN tags keep ON keep.id = m.keep_id
WHERE old.id IS NULL OR keep.id IS NULL;

INSERT INTO merge_guard
SELECT COUNT(*)
FROM tag_merge_map m
JOIN tag_merge_map next ON next.old_id = m.keep_id;

CREATE TEMP TABLE merge_baseline AS
SELECT
    (SELECT COUNT(*) FROM bookmarks) AS bookmark_count,
    (SELECT COUNT(*) FROM tags) AS tag_count,
    (SELECT COUNT(*) FROM tag_merge_map) AS removed_tag_count;

INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id)
SELECT bt.bookmark_id, m.keep_id
FROM bookmark_tags bt
JOIN tag_merge_map m ON m.old_id = bt.tag_id;

DELETE FROM bookmark_tags
WHERE tag_id IN (SELECT old_id FROM tag_merge_map);

DELETE FROM tags
WHERE id IN (SELECT old_id FROM tag_merge_map);

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

INSERT INTO merge_guard
SELECT CASE
    WHEN (SELECT COUNT(*) FROM bookmarks) =
         (SELECT bookmark_count FROM merge_baseline)
     AND (SELECT COUNT(*) FROM tags) =
         (SELECT tag_count - removed_tag_count FROM merge_baseline)
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

COMMIT;
PRAGMA optimize;
