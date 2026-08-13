#!/usr/bin/env python3
"""Create and verify a complete pre-migration backup of the bkmrx database."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path


DATABASE = Path.home() / "Library/Application Support/com.bkmrx/bookmarks.db"
TABLES = ("bookmarks", "tags", "bookmark_tags", "todos", "todo_tags", "todo_tag_relations")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rows_as_dicts(connection: sqlite3.Connection, table: str) -> list[dict[str, object]]:
    cursor = connection.execute(f'SELECT * FROM "{table}"')
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor]


def main() -> None:
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    directory = Path.home() / "Documents" / f"bkmrx-tag-localization-backup-{stamp}"
    directory.mkdir(parents=True, exist_ok=False)
    snapshot = directory / "bookmarks.db"
    export = directory / "bookmarks.json"
    manifest_path = directory / "manifest.json"

    source = sqlite3.connect(DATABASE)
    destination = sqlite3.connect(snapshot)
    source.backup(destination)
    destination.close()

    data = {table: rows_as_dicts(source, table) for table in TABLES}
    export.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    source.close()

    check = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_key_errors = len(check.execute("PRAGMA foreign_key_check").fetchall())
    counts = {table: check.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0] for table in TABLES}
    max_ids = {
        table: check.execute(f'SELECT max(id) FROM "{table}"').fetchone()[0]
        for table in ("bookmarks", "tags", "todos", "todo_tags")
    }
    check.close()
    if integrity != "ok" or foreign_key_errors:
        raise RuntimeError(f"invalid backup: integrity={integrity}, foreign_keys={foreign_key_errors}")
    if any(len(data[table]) != counts[table] for table in TABLES):
        raise RuntimeError("JSON export counts do not match SQLite snapshot")

    manifest = {
        "created_at": datetime.now().astimezone().isoformat(),
        "source_database": str(DATABASE),
        "sqlite_snapshot": {
            "file": snapshot.name,
            "bytes": snapshot.stat().st_size,
            "sha256": sha256(snapshot),
            "integrity_check": integrity,
            "foreign_key_errors": foreign_key_errors,
        },
        "json_export": {
            "file": export.name,
            "bytes": export.stat().st_size,
            "sha256": sha256(export),
        },
        "counts": counts,
        "max_ids": max_ids,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"backup_directory": str(directory), **manifest}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
