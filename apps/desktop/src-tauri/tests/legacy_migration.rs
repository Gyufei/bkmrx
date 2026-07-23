#![cfg(feature = "legacy-migration")]

use std::fs;
use std::path::{Path, PathBuf};

use bkmrx_lib::legacy_migration::{migrate, MigrationOptions};
use rusqlite::{params, Connection};
use tempfile::TempDir;

struct Fixture {
    _root: TempDir,
    source: PathBuf,
    target: PathBuf,
    backup: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = TempDir::new().unwrap();
        let source = root.path().join("legacy.db");
        create_legacy_database(&source);
        Self {
            target: root.path().join("app-data/bookmarks.db"),
            backup: root.path().join("backup"),
            source,
            _root: root,
        }
    }

    fn options(&self) -> MigrationOptions {
        MigrationOptions {
            source: self.source.clone(),
            target: self.target.clone(),
            backup_dir: self.backup.clone(),
            check_app_port: false,
        }
    }
}

#[test]
fn preserves_ids_and_business_fields() {
    let fixture = Fixture::new();

    let report = migrate(&fixture.options()).unwrap();
    let target = Connection::open(&fixture.target).unwrap();
    let row = target
        .query_row(
            "SELECT id, url, title, description, access_count,
                    created_at, updated_at, accessed_at
             FROM bookmarks WHERE id = 7",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                ))
            },
        )
        .unwrap();

    assert_eq!(report.source_count, 2);
    assert_eq!(report.target_count, 2);
    assert_eq!(report.max_id, 11);
    assert_eq!(row.0, 7);
    assert_eq!(row.1, "https://example.com/one");
    assert_eq!(row.2, "标题");
    assert_eq!(row.3, "描述");
    assert_eq!(row.4, 4);
    assert_eq!(row.5, 1_704_067_200_123);
    assert_eq!(row.6, 1_704_153_600_456);
    assert_eq!(row.7, Some(1_704_240_000_789));
}

#[test]
fn normalizes_legacy_tags_into_relations() {
    let fixture = Fixture::new();
    migrate(&fixture.options()).unwrap();
    let target = Connection::open(&fixture.target).unwrap();

    let tags = target
        .prepare(
            "SELECT t.name
             FROM tags t
             JOIN bookmark_tags bt ON bt.tag_id = t.id
             WHERE bt.bookmark_id = 7
             ORDER BY t.name",
        )
        .unwrap()
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(tags, vec!["rust", "中文"]);
}

#[test]
fn omits_embedding_hash_file_and_opener_fields() {
    let fixture = Fixture::new();
    migrate(&fixture.options()).unwrap();
    let target = Connection::open(&fixture.target).unwrap();
    let columns = target
        .prepare("SELECT name FROM pragma_table_info('bookmarks')")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    let export = fs::read_to_string(fixture.backup.join("legacy-bookmarks.json")).unwrap();

    for discarded in [
        "embedding",
        "content_hash",
        "file_path",
        "file_mtime",
        "file_hash",
        "opener",
    ] {
        assert!(!columns.iter().any(|column| column == discarded));
        assert!(!export.contains(&format!("\"{discarded}\"")));
    }
}

#[test]
fn creates_snapshot_json_and_manifest_before_target() {
    let fixture = Fixture::new();

    let report = migrate(&fixture.options()).unwrap();

    assert!(report.backup_snapshot.is_file());
    assert!(report.backup_json.is_file());
    assert!(report.manifest.is_file());
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(report.manifest).unwrap()).unwrap();
    assert_eq!(manifest["bookmark_count"], 2);
    assert_eq!(manifest["max_id"], 11);
    assert_eq!(report.source_hash_before, report.source_hash_after);
}

#[test]
fn refuses_existing_target() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.target.parent().unwrap()).unwrap();
    fs::write(&fixture.target, b"existing").unwrap();

    let error = migrate(&fixture.options()).unwrap_err();

    assert_eq!(error.code(), "validation_error");
    assert_eq!(fs::read(&fixture.target).unwrap(), b"existing");
}

#[test]
fn source_integrity_failure_stops_before_target() {
    let fixture = Fixture::new();
    fs::write(&fixture.source, b"not a sqlite database").unwrap();

    let error = migrate(&fixture.options()).unwrap_err();

    assert!(matches!(
        error.code(),
        "database_error" | "import_validation_failed"
    ));
    assert!(!fixture.target.exists());
    assert!(!fixture.backup.exists());
}

#[test]
fn validation_failure_never_promotes_migrating_file() {
    let fixture = Fixture::new();
    Connection::open(&fixture.source)
        .unwrap()
        .execute("UPDATE bookmarks SET flags = -1 WHERE id = 11", [])
        .unwrap();

    let error = migrate(&fixture.options()).unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
    assert!(fixture.backup.join("legacy-bkmr.db").exists());
    assert!(fixture.backup.join("legacy-bookmarks.json").exists());
    assert!(fixture.backup.join("manifest.json").exists());
    assert!(!fixture.target.exists());
    assert!(!PathBuf::from(format!("{}.migrating", fixture.target.display())).exists());
}

fn create_legacy_database(path: &Path) {
    let connection = Connection::open(path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE bookmarks (
                id INTEGER NOT NULL PRIMARY KEY,
                URL TEXT NOT NULL UNIQUE,
                metadata TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                desc TEXT NOT NULL DEFAULT '',
                flags INTEGER NOT NULL DEFAULT 0,
                last_update_ts DATETIME NOT NULL,
                embedding BLOB,
                content_hash BLOB,
                created_ts DATETIME,
                embeddable BOOLEAN NOT NULL DEFAULT 0,
                file_path TEXT,
                file_mtime INTEGER,
                file_hash TEXT,
                opener TEXT,
                accessed_at DATETIME
             );",
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO bookmarks (
                id, URL, metadata, tags, desc, flags,
                last_update_ts, embedding, content_hash, created_ts,
                embeddable, file_path, file_mtime, file_hash, opener, accessed_at
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                X'0102', X'0304', ?8, 1, '/tmp/file', 123, 'hash', 'browser', ?9
             )",
            params![
                7,
                "https://example.com/one",
                "标题",
                ",rust, 中文,rust,",
                "描述",
                4,
                "2024-01-02 00:00:00.456",
                "2024-01-01 00:00:00.123",
                "2024-01-03 00:00:00.789",
            ],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO bookmarks (
                id, URL, metadata, tags, desc, flags,
                last_update_ts, created_ts, accessed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)",
            params![
                11,
                "https://example.com/two",
                "Second",
                ",web,",
                "",
                0,
                "2024-02-01 00:00:00",
                Option::<String>::None,
            ],
        )
        .unwrap();
}
