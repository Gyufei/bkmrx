.bail on
.read scripts/tag-merge-map.sql

PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT 'summary' AS check_name,
       (SELECT COUNT(*) FROM bookmarks) AS bookmarks,
       (SELECT COUNT(*) FROM bookmarks_fts) AS fts_rows,
       (SELECT COUNT(*) FROM tags) AS tags,
       (SELECT COUNT(*) FROM bookmark_tags) AS links;

SELECT 'removed_tags_remaining' AS check_name, COUNT(*) AS failures
FROM tags
JOIN tag_merge_map ON tags.id = tag_merge_map.old_id;

SELECT 'retained_tags_missing' AS check_name, COUNT(*) AS failures
FROM tag_merge_map
LEFT JOIN tags ON tags.id = tag_merge_map.keep_id
WHERE tags.id IS NULL;

SELECT 'orphan_links' AS check_name, COUNT(*) AS failures
FROM bookmark_tags bt
LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
LEFT JOIN tags t ON t.id = bt.tag_id
WHERE b.id IS NULL OR t.id IS NULL;

SELECT 'missing_fts_rows' AS check_name, COUNT(*) AS failures
FROM bookmarks b
LEFT JOIN bookmarks_fts f ON f.rowid = b.id
WHERE f.rowid IS NULL;

SELECT 'fts_tag_mismatches' AS check_name, COUNT(*) AS failures
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
