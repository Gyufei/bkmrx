#!/usr/bin/env python3
"""Build a frozen SQLite migration from the reviewed tag localization document."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "docs/reviews/2026-08-13-bookmark-tags-localization-review.md"
DATABASE = Path.home() / "Library/Application Support/com.bkmrx/bookmarks.db"
OUTPUT = ROOT / "docs/migrations/bookmark-tag-localization-20260813.sql"
ROW_PATTERN = re.compile(
    r"- `([^`]+)` \| 关联：(\d+) \| 推荐：(.+?) \| 最终标签：(.*)$"
)


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def reviewed_operations() -> list[tuple[str, str, int]]:
    section = ""
    operations: list[tuple[str, str, int]] = []
    for raw_line in REVIEW.read_text(encoding="utf-8").splitlines():
        if raw_line in ("## 建议汉化", "## 保留原文", "## 待确认"):
            section = raw_line.removeprefix("## ")
            continue
        match = ROW_PATTERN.fullmatch(raw_line)
        if not match:
            continue
        source, expected_count, recommendation, final = match.groups()
        target = final.strip() or (recommendation if section == "建议汉化" else "")
        if target and target != source:
            operations.append((source, target, int(expected_count)))
    return operations


def main() -> None:
    operations = reviewed_operations()
    if not operations:
        raise SystemExit("No reviewed localization operations found")
    if len({source for source, _, _ in operations}) != len(operations):
        raise SystemExit("Duplicate source label in review document")

    connection = sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)
    current_counts = dict(
        connection.execute(
            """
            SELECT t.name, count(bt.bookmark_id)
            FROM tags t
            JOIN bookmark_tags bt ON bt.tag_id = t.id
            GROUP BY t.id, t.name
            """
        )
    )
    current_tag_count = connection.execute("SELECT count(*) FROM tags").fetchone()[0]
    current_bookmark_count = connection.execute("SELECT count(*) FROM bookmarks").fetchone()[0]
    current_relation_count = connection.execute(
        "SELECT count(*) FROM bookmark_tags"
    ).fetchone()[0]
    relations = connection.execute(
        """
        SELECT bt.bookmark_id, t.name
        FROM bookmark_tags bt
        JOIN tags t ON t.id = bt.tag_id
        """
    ).fetchall()
    connection.close()

    for source, target, expected_count in operations:
        if current_counts.get(source) != expected_count:
            raise SystemExit(
                f"Stale source count: {source!r} expected {expected_count}, "
                f"got {current_counts.get(source)!r}"
            )
        if not target.strip() or target != target.strip() or "," in target:
            raise SystemExit(f"Invalid target label: {source!r} -> {target!r}")

    mapping = {source: target for source, target, _ in operations}
    if set(mapping) & set(mapping.values()):
        raise SystemExit("A migration target is also a migration source")

    final_relations = {
        (bookmark_id, mapping.get(tag_name, tag_name))
        for bookmark_id, tag_name in relations
    }
    final_tags = (set(current_counts) - set(mapping)) | set(mapping.values())
    expected_tag_count = len(final_tags)
    expected_relation_count = len(final_relations)

    values = ",\n".join(
        f"    ({sql_text(source)}, {sql_text(target)}, {expected_count})"
        for source, target, expected_count in operations
    )
    sql = f""".bail on
.timeout 10000

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TEMP TABLE tag_localization_map (
    source TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    expected_count INTEGER NOT NULL
);

INSERT INTO tag_localization_map(source, target, expected_count) VALUES
{values};

CREATE TEMP TABLE migration_assert (
    value INTEGER NOT NULL CHECK (value = 1)
);

INSERT INTO migration_assert
SELECT count(*) = {len(operations)}
FROM tags
WHERE name IN (SELECT source FROM tag_localization_map);

INSERT INTO migration_assert
SELECT count(*) = 0
FROM tag_localization_map mapping
WHERE mapping.expected_count != (
    SELECT count(*)
    FROM bookmark_tags bt
    JOIN tags source ON source.id = bt.tag_id
    WHERE source.name = mapping.source
);

INSERT INTO migration_assert
SELECT count(*) = 0
FROM tag_localization_map
WHERE source = target OR target != trim(target) OR target = '' OR instr(target, ',') > 0;

INSERT OR IGNORE INTO tags(name)
SELECT DISTINCT target FROM tag_localization_map;

INSERT INTO bookmark_tags(bookmark_id, tag_id)
SELECT bt.bookmark_id, target.id
FROM tag_localization_map mapping
JOIN tags source ON source.name = mapping.source
JOIN bookmark_tags bt ON bt.tag_id = source.id
JOIN tags target ON target.name = mapping.target
ON CONFLICT(bookmark_id, tag_id) DO NOTHING;

DELETE FROM bookmark_tags
WHERE tag_id IN (
    SELECT id FROM tags WHERE name IN (SELECT source FROM tag_localization_map)
);

DELETE FROM tags
WHERE name IN (SELECT source FROM tag_localization_map);

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

INSERT INTO migration_assert SELECT count(*) = {current_bookmark_count} FROM bookmarks;
INSERT INTO migration_assert SELECT count(*) = {expected_tag_count} FROM tags;
INSERT INTO migration_assert SELECT count(*) = {expected_relation_count} FROM bookmark_tags;
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
INSERT INTO migration_assert SELECT count(*) = {current_bookmark_count} FROM bookmarks_fts;
INSERT INTO migration_assert
SELECT count(*) = 0
FROM tags
WHERE name IN (SELECT source FROM tag_localization_map);

COMMIT;
"""
    OUTPUT.write_text(sql, encoding="utf-8")
    print(f"operations={len(operations)}")
    print(f"bookmarks={current_bookmark_count}")
    print(f"source_tags={current_tag_count}")
    print(f"target_tags={expected_tag_count}")
    print(f"source_relations={current_relation_count}")
    print(f"target_relations={expected_relation_count}")
    print(f"migration={OUTPUT}")


if __name__ == "__main__":
    main()
