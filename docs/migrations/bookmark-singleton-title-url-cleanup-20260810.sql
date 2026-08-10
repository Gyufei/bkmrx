.bail on
.timeout 10000

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TEMP TABLE singleton_title_url_candidates (
    tag_id INTEGER PRIMARY KEY,
    tag_name TEXT NOT NULL,
    bookmark_id INTEGER NOT NULL,
    title_match INTEGER NOT NULL,
    url_match INTEGER NOT NULL
);

INSERT INTO singleton_title_url_candidates(
    tag_id,
    tag_name,
    bookmark_id,
    title_match,
    url_match
)
WITH singleton AS (
    SELECT
        t.id AS tag_id,
        t.name AS tag_name,
        min(bt.bookmark_id) AS bookmark_id
    FROM tags t
    JOIN bookmark_tags bt ON bt.tag_id = t.id
    GROUP BY t.id, t.name
    HAVING count(*) = 1
)
SELECT
    singleton.tag_id,
    singleton.tag_name,
    singleton.bookmark_id,
    instr(lower(bookmarks.title), lower(singleton.tag_name)) > 0,
    instr(lower(bookmarks.url), lower(singleton.tag_name)) > 0
FROM singleton
JOIN bookmarks ON bookmarks.id = singleton.bookmark_id
WHERE instr(lower(bookmarks.title), lower(singleton.tag_name)) > 0
   OR instr(lower(bookmarks.url), lower(singleton.tag_name)) > 0;

CREATE TEMP TABLE migration_assert (
    value INTEGER NOT NULL CHECK (value = 1)
);

-- Freeze the reviewed read-only result and refuse to run if source data changed.
INSERT INTO migration_assert
SELECT count(*) = 603 FROM singleton_title_url_candidates;

INSERT INTO migration_assert
SELECT count(*) = 0
FROM singleton_title_url_candidates candidate
WHERE (
    SELECT count(*)
    FROM bookmark_tags
    WHERE bookmark_id = candidate.bookmark_id
) = 1;

DELETE FROM bookmark_tags
WHERE tag_id IN (
    SELECT tag_id FROM singleton_title_url_candidates
);

DELETE FROM tags
WHERE id IN (
    SELECT tag_id FROM singleton_title_url_candidates
);

-- Tag text is denormalized into FTS, so rebuild it after deleting relations.
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

INSERT INTO migration_assert SELECT count(*) = 2173 FROM bookmarks;
INSERT INTO migration_assert SELECT count(*) = 2226 FROM tags;
INSERT INTO migration_assert SELECT count(*) = 10522 FROM bookmark_tags;
INSERT INTO migration_assert
SELECT count(*) = 0
FROM bookmarks b
WHERE NOT EXISTS (
    SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id
);
INSERT INTO migration_assert
SELECT count(*) = 0
FROM tags t
WHERE NOT EXISTS (
    SELECT 1 FROM bookmark_tags bt WHERE bt.tag_id = t.id
);
INSERT INTO migration_assert SELECT count(*) = 0 FROM pragma_foreign_key_check;
INSERT INTO migration_assert SELECT count(*) = 2173 FROM bookmarks_fts;

COMMIT;
