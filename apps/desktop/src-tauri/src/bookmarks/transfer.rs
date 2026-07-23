use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::database::Database;

use super::repository::{remove_unused_tags, replace_tags, upsert_fts};
use super::{AppError, AppResult, BookmarkExportV1, BookmarkTransferRecord, ImportPreview};

pub(crate) fn export_bookmarks(database: &Database, destination: &Path) -> AppResult<PathBuf> {
    let export = snapshot(database)?;
    let bytes = serde_json::to_vec_pretty(&export).map_err(|error| {
        AppError::internal_error(format!("failed to serialize export: {error}"))
    })?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let destination = if destination.extension().is_some_and(|value| value == "json") {
        destination.to_owned()
    } else {
        destination.join(format!("bookmarks-{timestamp}.json"))
    };
    let directory = destination
        .parent()
        .ok_or_else(|| AppError::validation_error("export path has no parent directory"))?;
    fs::create_dir_all(directory).map_err(file_error)?;
    let temporary = directory.join(format!(
        ".bookmarks-{timestamp}-{}-{}.tmp",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));

    let write_result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(file_error)?;
        file.write_all(&bytes).map_err(file_error)?;
        file.sync_all().map_err(file_error)?;
        fs::rename(&temporary, &destination).map_err(file_error)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result?;
    Ok(destination)
}

pub(crate) fn preview_import(database: &Database, path: &Path) -> AppResult<ImportPreview> {
    let bytes = fs::read(path).map_err(file_error)?;
    let validated = parse_and_validate(&bytes)?;
    preview_validated(database, &validated, hash_bytes(&bytes))
}

pub(crate) fn apply_import(
    database: &Database,
    path: &Path,
    expected_hash: &str,
) -> AppResult<ImportPreview> {
    let bytes = fs::read(path).map_err(file_error)?;
    let actual_hash = hash_bytes(&bytes);
    if actual_hash != expected_hash {
        return Err(AppError::import_validation_failed(
            "The import file changed after preview",
        ));
    }
    let validated = parse_and_validate(&bytes)?;
    let preview = preview_validated(database, &validated, actual_hash)?;
    let mut connection = database.connection()?;
    let transaction = connection.transaction().map_err(database_error)?;

    for record in &validated.records {
        let existing = transaction
            .query_row(
                "SELECT id, title, description, access_count,
                        created_at, updated_at, accessed_at
                 FROM bookmarks WHERE url = ?1",
                [&record.url],
                |row| {
                    Ok(ExistingBookmark {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        description: row.get(2)?,
                        access_count: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        accessed_at: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(database_error)?;

        match existing {
            None => {
                transaction
                    .execute(
                        "INSERT INTO bookmarks (
                            url, title, description, access_count,
                            created_at, updated_at, accessed_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            record.url,
                            record.title,
                            record.description,
                            record.access_count,
                            record.created_at,
                            record.updated_at,
                            record.accessed_at,
                        ],
                    )
                    .map_err(database_error)?;
                let id = transaction.last_insert_rowid();
                replace_tags(&transaction, id, &record.tags)?;
                upsert_fts(
                    &transaction,
                    id,
                    &record.url,
                    &record.title,
                    &record.description,
                    &record.tags,
                )?;
            }
            Some(existing) => {
                let content_is_newer = record.updated_at > existing.updated_at;
                let title = if content_is_newer {
                    &record.title
                } else {
                    &existing.title
                };
                let description = if content_is_newer {
                    &record.description
                } else {
                    &existing.description
                };
                let updated_at = existing.updated_at.max(record.updated_at);
                let accessed_at = latest_optional(existing.accessed_at, record.accessed_at);
                transaction
                    .execute(
                        "UPDATE bookmarks
                         SET title = ?1,
                             description = ?2,
                             access_count = ?3,
                             created_at = ?4,
                             updated_at = ?5,
                             accessed_at = ?6
                         WHERE id = ?7",
                        params![
                            title,
                            description,
                            existing.access_count.max(record.access_count),
                            existing.created_at.min(record.created_at),
                            updated_at,
                            accessed_at,
                            existing.id,
                        ],
                    )
                    .map_err(database_error)?;
                if content_is_newer {
                    replace_tags(&transaction, existing.id, &record.tags)?;
                    upsert_fts(
                        &transaction,
                        existing.id,
                        &record.url,
                        title,
                        description,
                        &record.tags,
                    )?;
                }
            }
        }
    }
    remove_unused_tags(&transaction)?;
    transaction.commit().map_err(database_error)?;
    Ok(preview)
}

fn snapshot(database: &Database) -> AppResult<BookmarkExportV1> {
    let mut connection = database.connection()?;
    let transaction = connection.transaction().map_err(database_error)?;
    let mut statement = transaction
        .prepare(
            "SELECT id, url, title, description, access_count,
                    created_at, updated_at, accessed_at
             FROM bookmarks
             ORDER BY url",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                BookmarkTransferRecord {
                    url: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    tags: Vec::new(),
                    access_count: row.get(4)?,
                    created_at: timestamp_to_string(row.get(5)?)?,
                    updated_at: timestamp_to_string(row.get(6)?)?,
                    accessed_at: row
                        .get::<_, Option<i64>>(7)?
                        .map(timestamp_to_string)
                        .transpose()?,
                },
            ))
        })
        .map_err(database_error)?;
    let mut records = Vec::new();
    let mut positions = BTreeMap::new();
    for row in rows {
        let (id, record) = row.map_err(database_error)?;
        positions.insert(id, records.len());
        records.push(record);
    }
    drop(statement);

    let mut tag_statement = transaction
        .prepare(
            "SELECT bt.bookmark_id, t.name
             FROM bookmark_tags bt
             JOIN tags t ON t.id = bt.tag_id
             ORDER BY bt.bookmark_id, t.name",
        )
        .map_err(database_error)?;
    let tags = tag_statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    for tag in tags {
        let (bookmark_id, name) = tag.map_err(database_error)?;
        if let Some(position) = positions.get(&bookmark_id) {
            records[*position].tags.push(name);
        }
    }
    drop(tag_statement);
    transaction.commit().map_err(database_error)?;

    Ok(BookmarkExportV1 {
        format_version: 1,
        exported_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        bookmarks: records,
    })
}

fn parse_and_validate(bytes: &[u8]) -> AppResult<ValidatedExport> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| AppError::import_validation_failed(format!("Invalid JSON: {error}")))?;
    let version = value
        .get("format_version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    if version != 1 {
        return Err(AppError::unsupported_import_format(version));
    }
    let export: BookmarkExportV1 = serde_json::from_value(value).map_err(|error| {
        AppError::import_validation_failed(format!("Invalid v1 import document: {error}"))
    })?;
    parse_timestamp("exported_at", &export.exported_at)?;
    let mut urls = HashSet::new();
    let mut records = Vec::with_capacity(export.bookmarks.len());
    for (index, record) in export.bookmarks.into_iter().enumerate() {
        let url = record.url.trim().to_owned();
        if url.is_empty() || url::Url::parse(&url).is_err() {
            return Err(record_error(index, "url is invalid"));
        }
        if !urls.insert(url.clone()) {
            return Err(record_error(index, "URL is duplicated in the import file"));
        }
        if record.access_count < 0 {
            return Err(record_error(index, "access_count must not be negative"));
        }
        let created_at = parse_timestamp("created_at", &record.created_at)
            .map_err(|_| record_error(index, "created_at must be RFC 3339"))?;
        let updated_at = parse_timestamp("updated_at", &record.updated_at)
            .map_err(|_| record_error(index, "updated_at must be RFC 3339"))?;
        let accessed_at = record
            .accessed_at
            .as_deref()
            .map(|value| parse_timestamp("accessed_at", value))
            .transpose()
            .map_err(|_| record_error(index, "accessed_at must be RFC 3339"))?;
        let title = {
            let title = record.title.trim();
            if title.is_empty() {
                url.clone()
            } else {
                title.to_owned()
            }
        };
        let tags = record
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_owned())
            .filter(|tag| !tag.is_empty())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        records.push(ValidatedRecord {
            url,
            title,
            description: record.description,
            tags,
            access_count: record.access_count,
            created_at,
            updated_at,
            accessed_at,
        });
    }
    records.sort_by(|left, right| left.url.cmp(&right.url));
    Ok(ValidatedExport { records })
}

fn preview_validated(
    database: &Database,
    export: &ValidatedExport,
    file_hash: String,
) -> AppResult<ImportPreview> {
    let connection = database.connection()?;
    let mut statement = connection
        .prepare("SELECT url, updated_at FROM bookmarks")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(database_error)?;
    let existing = rows
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(database_error)?;
    let mut create_count = 0;
    let mut update_count = 0;
    let mut skip_count = 0;
    for record in &export.records {
        match existing.get(&record.url) {
            None => create_count += 1,
            Some(updated_at) if record.updated_at > *updated_at => update_count += 1,
            Some(_) => skip_count += 1,
        }
    }
    Ok(ImportPreview {
        file_hash,
        total: export.records.len(),
        create_count,
        update_count,
        skip_count,
    })
}

struct ValidatedExport {
    records: Vec<ValidatedRecord>,
}

struct ValidatedRecord {
    url: String,
    title: String,
    description: String,
    tags: Vec<String>,
    access_count: i64,
    created_at: i64,
    updated_at: i64,
    accessed_at: Option<i64>,
}

struct ExistingBookmark {
    id: i64,
    title: String,
    description: String,
    access_count: i64,
    created_at: i64,
    updated_at: i64,
    accessed_at: Option<i64>,
}

fn parse_timestamp(field: &str, value: &str) -> AppResult<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.timestamp_millis())
        .map_err(|error| {
            AppError::import_validation_failed(format!("{field} must be RFC 3339: {error}"))
        })
}

fn timestamp_to_string(timestamp: i64) -> rusqlite::Result<String> {
    DateTime::<Utc>::from_timestamp_millis(timestamp)
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Secs, true))
        .ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Integer,
                format!("invalid Unix millisecond timestamp: {timestamp}").into(),
            )
        })
}

fn latest_optional(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(bytes))
}

fn record_error(index: usize, message: &str) -> AppError {
    AppError::import_validation_failed(format!("bookmarks[{index}]: {message}"))
}

fn file_error(error: std::io::Error) -> AppError {
    AppError::internal_error(error.to_string())
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
