#!/usr/bin/env python3
"""Apply the reviewed bookmark descriptions to the live bkmrx database."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCUMENT = ROOT / "docs/reviews/2026-08-10-bookmark-description-translation-review.md"
DATABASE = Path.home() / "Library/Application Support/com.bkmrx/bookmarks.db"
BACKUP = ROOT / "backups/bookmark-description-20260810-reviewed/bookmarks.db"
BLOCK_RE = re.compile(
    r"^## \d+\. 书签 ID `(?P<id>\d+)`\n\n"
    r"- 原描述：(?P<original>.*)\n"
    r"- 翻译后描述：(?P<translated>.*)\n"
    r"- 最终描述：(?P<final>.*)$",
    re.MULTILINE,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    matches = list(BLOCK_RE.finditer(DOCUMENT.read_text()))
    if len(matches) != 1096:
        raise RuntimeError(f"expected 1096 review rows, found {len(matches)}")

    operations = []
    for match in matches:
        bookmark_id = int(match.group("id"))
        original = match.group("original")
        translated = match.group("translated").strip()
        final = match.group("final").strip()
        target = final or translated
        if not target:
            raise RuntimeError(f"bookmark {bookmark_id} has no target description")
        operations.append((bookmark_id, original, target, bool(final)))
    if len({operation[0] for operation in operations}) != len(operations):
        raise RuntimeError("duplicate bookmark ids in review document")

    connection = sqlite3.connect(DATABASE)
    connection.execute("PRAGMA foreign_keys = ON")
    current = {
        row[0]: row[1]
        for row in connection.execute(
            f"SELECT id, description FROM bookmarks WHERE id IN ({','.join('?' for _ in operations)})",
            [operation[0] for operation in operations],
        )
    }
    missing = [bookmark_id for bookmark_id, _, _, _ in operations if bookmark_id not in current]
    changed = [
        bookmark_id
        for bookmark_id, original, _, _ in operations
        if " ".join(current.get(bookmark_id, "").split()) != original
    ]
    if missing or changed:
        raise RuntimeError(f"preflight failed: missing={missing[:10]}, changed={changed[:10]}")

    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    if BACKUP.exists():
        raise RuntimeError(f"backup already exists: {BACKUP}")
    backup_connection = sqlite3.connect(BACKUP)
    connection.backup(backup_connection)
    backup_connection.close()

    now = int(time.time() * 1000)
    try:
        connection.execute("BEGIN IMMEDIATE")
        for bookmark_id, _original, target, _ in operations:
            cursor = connection.execute(
                "UPDATE bookmarks SET description = ?1, updated_at = ?2 "
                "WHERE id = ?3 AND description = ?4",
                (target, now, bookmark_id, current[bookmark_id]),
            )
            if cursor.rowcount != 1:
                raise RuntimeError(f"bookmark {bookmark_id} failed guarded update")
            url, title = connection.execute(
                "SELECT url, title FROM bookmarks WHERE id = ?1", (bookmark_id,)
            ).fetchone()
            tags = [
                row[0]
                for row in connection.execute(
                    "SELECT t.name FROM tags t "
                    "JOIN bookmark_tags bt ON bt.tag_id = t.id "
                    "WHERE bt.bookmark_id = ?1 ORDER BY lower(t.name), t.name",
                    (bookmark_id,),
                )
            ]
            connection.execute("DELETE FROM bookmarks_fts WHERE rowid = ?1", (bookmark_id,))
            connection.execute(
                "INSERT INTO bookmarks_fts(rowid, url, title, description, tags) "
                "VALUES (?1, ?2, ?3, ?4, ?5)",
                (bookmark_id, url, title, target, " ".join(tags)),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise

    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
    mismatches = connection.execute(
        "SELECT COUNT(*) FROM bookmarks b "
        "JOIN bookmarks_fts f ON f.rowid = b.id "
        "WHERE f.description <> b.description"
    ).fetchone()[0]
    fts_count = connection.execute("SELECT COUNT(*) FROM bookmarks_fts").fetchone()[0]
    connection.close()
    if integrity != "ok" or foreign_key_errors or mismatches or fts_count != 2173:
        raise RuntimeError(
            f"verification failed: integrity={integrity}, foreign_keys={len(foreign_key_errors)}, "
            f"fts_mismatches={mismatches}, fts_count={fts_count}"
        )

    print(
        json.dumps(
            {
                "updated": len(operations),
                "final_overrides": sum(operation[3] for operation in operations),
                "suggestions_used": sum(not operation[3] for operation in operations),
                "updated_at": now,
                "backup": str(BACKUP),
                "backup_sha256": sha256(BACKUP),
                "integrity_check": integrity,
                "foreign_key_errors": len(foreign_key_errors),
                "fts_mismatches": mismatches,
                "fts_count": fts_count,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
