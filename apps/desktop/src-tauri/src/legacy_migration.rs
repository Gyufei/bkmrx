use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::NaiveDateTime;
use rusqlite::backup::Backup;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::bookmarks::repository::{replace_tags, upsert_fts};
use crate::bookmarks::{AppError, AppResult};
use crate::database::Database;

#[derive(Debug, Clone)]
pub struct MigrationOptions {
    pub source: PathBuf,
    pub target: PathBuf,
    pub backup_dir: PathBuf,
    pub check_app_port: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MigrationReport {
    pub source_count: i64,
    pub target_count: i64,
    pub max_id: i64,
    pub source_hash_before: String,
    pub source_hash_after: String,
    pub backup_snapshot: PathBuf,
    pub backup_json: PathBuf,
    pub manifest: PathBuf,
    pub target: PathBuf,
}

pub fn migrate(options: &MigrationOptions) -> AppResult<MigrationReport> {
    preflight(options)?;
    let source_hash_before = sha256_file(&options.source)?;
    let source = Connection::open_with_flags(
        &options.source,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(database_error)?;
    verify_integrity(&source, "legacy source")?;
    let records = read_legacy_records(&source)?;
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let artifacts = create_backups(
        &source,
        &records,
        &options.source,
        &options.backup_dir,
        &source_hash_before,
        max_id,
    )?;
    drop(source);

    let migrating = migrating_path(&options.target);
    let migration_result = migrate_to_target(&migrating, &records);
    if let Err(error) = migration_result {
        let _ = fs::remove_file(&migrating);
        return Err(error);
    }

    let source_hash_after = sha256_file(&options.source)?;
    if source_hash_after != source_hash_before {
        let _ = fs::remove_file(&migrating);
        return Err(AppError::import_validation_failed(
            "Legacy source changed during migration",
        ));
    }

    fs::rename(&migrating, &options.target).map_err(file_error)?;
    sync_parent(&options.target)?;

    Ok(MigrationReport {
        source_count: records.len() as i64,
        target_count: records.len() as i64,
        max_id,
        source_hash_before,
        source_hash_after,
        backup_snapshot: artifacts.snapshot,
        backup_json: artifacts.json,
        manifest: artifacts.manifest,
        target: options.target.clone(),
    })
}

fn preflight(options: &MigrationOptions) -> AppResult<()> {
    if !options.source.is_file() {
        return Err(AppError::validation_error("Legacy source does not exist"));
    }
    if options.target.exists() {
        return Err(AppError::validation_error(
            "Migration target already exists",
        ));
    }
    if migrating_path(&options.target).exists() {
        return Err(AppError::validation_error(
            "A previous .migrating target already exists",
        ));
    }
    if options.check_app_port
        && TcpStream::connect_timeout(
            &SocketAddr::from(([127, 0, 0, 1], 8733)),
            Duration::from_millis(250),
        )
        .is_ok()
    {
        return Err(AppError::validation_error(
            "bkmrx is still listening on port 8733",
        ));
    }
    Ok(())
}

fn create_backups(
    source: &Connection,
    records: &[LegacyRecord],
    source_path: &Path,
    backup_dir: &Path,
    source_hash: &str,
    max_id: i64,
) -> AppResult<BackupArtifacts> {
    if backup_dir.exists() && backup_dir.read_dir().map_err(file_error)?.next().is_some() {
        return Err(AppError::validation_error(
            "Backup directory must not already contain files",
        ));
    }
    fs::create_dir_all(backup_dir).map_err(file_error)?;
    let snapshot = backup_dir.join("legacy-bkmr.db");
    let json = backup_dir.join("legacy-bookmarks.json");
    let manifest = backup_dir.join("manifest.json");

    let mut destination = Connection::open(&snapshot).map_err(database_error)?;
    let backup = Backup::new(source, &mut destination).map_err(database_error)?;
    backup
        .run_to_completion(100, Duration::from_millis(10), None)
        .map_err(database_error)?;
    drop(backup);
    destination
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(database_error)?;
    drop(destination);

    let export = LegacyExport {
        format: "bkmr-legacy-business-v1",
        source: source_path.to_string_lossy().into_owned(),
        bookmarks: records,
    };
    write_sync(
        &json,
        &serde_json::to_vec_pretty(&export).map_err(json_error)?,
    )?;
    let snapshot_hash = sha256_file(&snapshot)?;
    let json_hash = sha256_file(&json)?;
    let manifest_value = LegacyManifest {
        format: "bkmr-migration-manifest-v1",
        source_sha256: source_hash,
        snapshot_sha256: &snapshot_hash,
        json_sha256: &json_hash,
        bookmark_count: records.len() as i64,
        max_id,
    };
    write_sync(
        &manifest,
        &serde_json::to_vec_pretty(&manifest_value).map_err(json_error)?,
    )?;
    sync_parent(&manifest)?;
    Ok(BackupArtifacts {
        snapshot,
        json,
        manifest,
    })
}

fn migrate_to_target(path: &Path, records: &[LegacyRecord]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(file_error)?;
    }
    let database = Database::open(path)?;
    let mut connection = database.connection()?;
    let transaction = connection.transaction().map_err(database_error)?;
    for record in records {
        if record.access_count < 0 {
            return Err(AppError::import_validation_failed(format!(
                "Bookmark {} has a negative access count",
                record.id
            )));
        }
        let title = if record.title.trim().is_empty() {
            &record.url
        } else {
            record.title.trim()
        };
        let tags = normalize_legacy_tags(&record.tags);
        let updated_at = parse_legacy_timestamp(&record.updated_at)?;
        let created_at = record
            .created_at
            .as_deref()
            .map(parse_legacy_timestamp)
            .transpose()?
            .unwrap_or(updated_at);
        let accessed_at = record
            .accessed_at
            .as_deref()
            .map(parse_legacy_timestamp)
            .transpose()?;
        transaction
            .execute(
                "INSERT INTO bookmarks (
                    id, url, title, description, access_count,
                    created_at, updated_at, accessed_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    record.id,
                    record.url,
                    title,
                    record.description,
                    record.access_count,
                    created_at,
                    updated_at,
                    accessed_at,
                ],
            )
            .map_err(database_error)?;
        replace_tags(&transaction, record.id, &tags)?;
        upsert_fts(
            &transaction,
            record.id,
            &record.url,
            title,
            &record.description,
            &tags,
        )?;
    }
    transaction.commit().map_err(database_error)?;
    drop(connection);
    validate_target(&database, records)?;
    drop(database);
    sync_file(path)
}

fn validate_target(database: &Database, source: &[LegacyRecord]) -> AppResult<()> {
    let connection = database.connection()?;
    verify_integrity(&connection, "migration target")?;
    let foreign_key_errors: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(database_error)?;
    if foreign_key_errors != 0 {
        return Err(AppError::import_validation_failed(
            "Target foreign key validation failed",
        ));
    }
    let (count, max_id, fts_count): (i64, i64, i64) = connection
        .query_row(
            "SELECT
                (SELECT count(*) FROM bookmarks),
                coalesce((SELECT max(id) FROM bookmarks), 0),
                (SELECT count(*) FROM bookmarks_fts)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(database_error)?;
    let expected_max = source.iter().map(|record| record.id).max().unwrap_or(0);
    if count != source.len() as i64 || max_id != expected_max || fts_count != count {
        return Err(AppError::import_validation_failed(
            "Target count, max ID, or FTS count does not match source",
        ));
    }

    let expected = source
        .iter()
        .map(|record| {
            (
                record.url.clone(),
                normalize_legacy_tags(&record.tags)
                    .into_iter()
                    .collect::<BTreeSet<_>>(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut actual = BTreeMap::<String, BTreeSet<String>>::new();
    let mut statement = connection
        .prepare(
            "SELECT b.url, t.name
             FROM bookmarks b
             LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
             LEFT JOIN tags t ON t.id = bt.tag_id
             ORDER BY b.url, t.name",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(database_error)?;
    for row in rows {
        let (url, tag) = row.map_err(database_error)?;
        let tags = actual.entry(url).or_default();
        if let Some(tag) = tag {
            tags.insert(tag);
        }
    }
    if actual != expected {
        return Err(AppError::import_validation_failed(
            "Target URL or tag sets do not match source",
        ));
    }
    Ok(())
}

fn read_legacy_records(connection: &Connection) -> AppResult<Vec<LegacyRecord>> {
    let mut statement = connection
        .prepare(
            "SELECT id, URL, metadata, tags, desc, flags,
                    last_update_ts, created_ts, accessed_at
             FROM bookmarks
             ORDER BY id",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok(LegacyRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                tags: row.get(3)?,
                description: row.get(4)?,
                access_count: row.get(5)?,
                updated_at: row.get(6)?,
                created_at: row.get(7)?,
                accessed_at: row.get(8)?,
            })
        })
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn verify_integrity(connection: &Connection, label: &str) -> AppResult<()> {
    let result: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(database_error)?;
    if result != "ok" {
        return Err(AppError::import_validation_failed(format!(
            "{label} integrity check failed: {result}"
        )));
    }
    Ok(())
}

fn normalize_legacy_tags(tags: &str) -> Vec<String> {
    tags.split(',')
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn parse_legacy_timestamp(value: &str) -> AppResult<i64> {
    for format in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.fZ"] {
        if let Ok(timestamp) = NaiveDateTime::parse_from_str(value, format) {
            return Ok(timestamp.and_utc().timestamp_millis());
        }
    }
    Err(AppError::import_validation_failed(format!(
        "Invalid legacy timestamp: {value}"
    )))
}

fn migrating_path(target: &Path) -> PathBuf {
    PathBuf::from(format!("{}.migrating", target.to_string_lossy()))
}

fn write_sync(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(file_error)?;
    file.write_all(bytes).map_err(file_error)?;
    file.sync_all().map_err(file_error)
}

fn sync_file(path: &Path) -> AppResult<()> {
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(file_error)
}

fn sync_parent(path: &Path) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::internal_error("path has no parent directory"))?;
    File::open(parent)
        .and_then(|file| file.sync_all())
        .map_err(file_error)
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path).map_err(file_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(file_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(Debug, Clone, Serialize)]
struct LegacyExport<'a> {
    format: &'static str,
    source: String,
    bookmarks: &'a [LegacyRecord],
}

#[derive(Debug, Clone, Serialize)]
struct LegacyManifest<'a> {
    format: &'static str,
    source_sha256: &'a str,
    snapshot_sha256: &'a str,
    json_sha256: &'a str,
    bookmark_count: i64,
    max_id: i64,
}

#[derive(Debug, Clone, Serialize)]
struct LegacyRecord {
    id: i64,
    url: String,
    title: String,
    tags: String,
    description: String,
    access_count: i64,
    updated_at: String,
    created_at: Option<String>,
    accessed_at: Option<String>,
}

struct BackupArtifacts {
    snapshot: PathBuf,
    json: PathBuf,
    manifest: PathBuf,
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}

fn file_error(error: std::io::Error) -> AppError {
    AppError::internal_error(error.to_string())
}

fn json_error(error: serde_json::Error) -> AppError {
    AppError::internal_error(error.to_string())
}
