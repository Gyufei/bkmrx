use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Transaction};

use crate::database::Database;

use super::{AppError, AppResult, Bookmark, CreateBookmark, TagSummary, UpdateBookmark};

pub trait BookmarkRepository: Send + Sync {
    fn create(&self, input: CreateBookmark) -> AppResult<Bookmark>;
    fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark>;
    fn delete_many(&self, ids: &[i64]) -> AppResult<u64>;
    fn get_by_id(&self, id: i64) -> AppResult<Option<Bookmark>>;
    fn get_by_url(&self, url: &str) -> AppResult<Option<Bookmark>>;
    fn get_by_ids_ordered(&self, ids: &[i64]) -> AppResult<Vec<Bookmark>>;
    fn get_tags(&self) -> AppResult<Vec<TagSummary>>;
    fn record_access(&self, id: i64) -> AppResult<Bookmark>;
    fn rebuild_search_index(&self) -> AppResult<()>;
}

#[derive(Debug, Clone)]
pub struct SqliteBookmarkRepository {
    database: Arc<Database>,
}

impl SqliteBookmarkRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub(crate) fn database(&self) -> &Arc<Database> {
        &self.database
    }
}

impl BookmarkRepository for SqliteBookmarkRepository {
    fn create(&self, input: CreateBookmark) -> AppResult<Bookmark> {
        let url = normalize_url(&input.url)?;
        let title = normalize_title(&input.title, &url);
        let tags = normalize_tags(input.tags);
        let now = Utc::now().timestamp_millis();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        if let Err(error) = transaction.execute(
            "INSERT INTO bookmarks (
                url, title, description, access_count, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
            params![url, title, input.description, now],
        ) {
            return Err(write_error(error, &url));
        }
        let id = transaction.last_insert_rowid();
        replace_tags(&transaction, id, &tags)?;
        upsert_fts(&transaction, id, &url, &title, &input.description, &tags)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);

        self.get_by_id(id)?
            .ok_or_else(|| AppError::internal_error("created bookmark could not be reloaded"))
    }

    fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark> {
        let existing = self
            .get_by_id(id)?
            .ok_or_else(|| AppError::bookmark_not_found(id))?;
        let url = match input.url {
            Some(url) => normalize_url(&url)?,
            None => existing.url,
        };
        let title = normalize_title(input.title.as_deref().unwrap_or(&existing.title), &url);
        let description = input.description.unwrap_or(existing.description);
        let tags = input.tags.map(normalize_tags).unwrap_or(existing.tags);
        let now = Utc::now().timestamp_millis();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        if let Err(error) = transaction.execute(
            "UPDATE bookmarks
             SET url = ?1, title = ?2, description = ?3, updated_at = ?4
             WHERE id = ?5",
            params![url, title, description, now, id],
        ) {
            return Err(write_error(error, &url));
        }
        replace_tags(&transaction, id, &tags)?;
        upsert_fts(&transaction, id, &url, &title, &description, &tags)?;
        remove_unused_tags(&transaction)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);

        self.get_by_id(id)?
            .ok_or_else(|| AppError::internal_error("updated bookmark could not be reloaded"))
    }

    fn delete_many(&self, ids: &[i64]) -> AppResult<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = placeholders(ids.len());
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction
            .execute(
                &format!("DELETE FROM bookmarks_fts WHERE rowid IN ({placeholders})"),
                params_from_iter(ids.iter()),
            )
            .map_err(database_error)?;
        let deleted = transaction
            .execute(
                &format!("DELETE FROM bookmarks WHERE id IN ({placeholders})"),
                params_from_iter(ids.iter()),
            )
            .map_err(database_error)?;
        remove_unused_tags(&transaction)?;
        transaction.commit().map_err(database_error)?;
        Ok(deleted as u64)
    }

    fn get_by_id(&self, id: i64) -> AppResult<Option<Bookmark>> {
        Ok(self.get_by_ids_ordered(&[id])?.into_iter().next())
    }

    fn get_by_url(&self, url: &str) -> AppResult<Option<Bookmark>> {
        let id = self
            .database
            .connection()?
            .query_row("SELECT id FROM bookmarks WHERE url = ?1", [url], |row| {
                row.get::<_, i64>(0)
            })
            .optional()
            .map_err(database_error)?;
        match id {
            Some(id) => self.get_by_id(id),
            None => Ok(None),
        }
    }

    fn get_by_ids_ordered(&self, ids: &[i64]) -> AppResult<Vec<Bookmark>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = placeholders(ids.len());
        let connection = self.database.connection()?;
        let mut statement = connection
            .prepare(&format!(
                "SELECT id, url, title, description, access_count,
                        created_at, updated_at, accessed_at
                 FROM bookmarks
                 WHERE id IN ({placeholders})"
            ))
            .map_err(database_error)?;
        let rows = statement
            .query_map(params_from_iter(ids.iter()), bookmark_from_row)
            .map_err(database_error)?;
        let mut bookmarks = HashMap::new();
        for row in rows {
            let bookmark = row.map_err(database_error)?;
            bookmarks.insert(bookmark.id, bookmark);
        }
        drop(statement);

        let mut tag_statement = connection
            .prepare(&format!(
                "SELECT bt.bookmark_id, t.name
                 FROM bookmark_tags bt
                 JOIN tags t ON t.id = bt.tag_id
                 WHERE bt.bookmark_id IN ({placeholders})
                 ORDER BY t.name"
            ))
            .map_err(database_error)?;
        let tags = tag_statement
            .query_map(params_from_iter(ids.iter()), |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?;
        for tag in tags {
            let (bookmark_id, name) = tag.map_err(database_error)?;
            if let Some(bookmark) = bookmarks.get_mut(&bookmark_id) {
                bookmark.tags.push(name);
            }
        }

        Ok(ids.iter().filter_map(|id| bookmarks.remove(id)).collect())
    }

    fn get_tags(&self) -> AppResult<Vec<TagSummary>> {
        let connection = self.database.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT t.name, count(bt.bookmark_id)
                 FROM tags t
                 JOIN bookmark_tags bt ON bt.tag_id = t.id
                 GROUP BY t.id, t.name
                 ORDER BY t.name",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(TagSummary {
                    name: row.get(0)?,
                    count: row.get(1)?,
                })
            })
            .map_err(database_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
    }

    fn record_access(&self, id: i64) -> AppResult<Bookmark> {
        let changed = self
            .database
            .connection()?
            .execute(
                "UPDATE bookmarks
                 SET access_count = access_count + 1, accessed_at = ?1
                 WHERE id = ?2",
                params![Utc::now().timestamp_millis(), id],
            )
            .map_err(database_error)?;
        if changed == 0 {
            return Err(AppError::bookmark_not_found(id));
        }
        self.get_by_id(id)?
            .ok_or_else(|| AppError::internal_error("accessed bookmark could not be reloaded"))
    }

    fn rebuild_search_index(&self) -> AppResult<()> {
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction
            .execute("DELETE FROM bookmarks_fts", [])
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
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
                 FROM bookmarks b",
                [],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)
    }
}

fn normalize_url(url: &str) -> AppResult<String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::validation_error("URL must not be empty"));
    }
    Ok(url.to_owned())
}

fn normalize_title(title: &str, url: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        url.to_owned()
    } else {
        title.to_owned()
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub(crate) fn replace_tags(
    transaction: &Transaction<'_>,
    bookmark_id: i64,
    tags: &[String],
) -> AppResult<()> {
    transaction
        .execute(
            "DELETE FROM bookmark_tags WHERE bookmark_id = ?1",
            [bookmark_id],
        )
        .map_err(database_error)?;
    for tag in tags {
        transaction
            .execute(
                "INSERT INTO tags(name) VALUES (?1)
                 ON CONFLICT(name) DO NOTHING",
                [tag],
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO bookmark_tags(bookmark_id, tag_id)
                 SELECT ?1, id FROM tags WHERE name = ?2",
                params![bookmark_id, tag],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

pub(crate) fn upsert_fts(
    transaction: &Transaction<'_>,
    id: i64,
    url: &str,
    title: &str,
    description: &str,
    tags: &[String],
) -> AppResult<()> {
    transaction
        .execute("DELETE FROM bookmarks_fts WHERE rowid = ?1", [id])
        .map_err(database_error)?;
    transaction
        .execute(
            "INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, url, title, description, tags.join(" ")],
        )
        .map_err(database_error)?;
    Ok(())
}

pub(crate) fn remove_unused_tags(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction
        .execute(
            "DELETE FROM tags
             WHERE NOT EXISTS (
                 SELECT 1 FROM bookmark_tags WHERE tag_id = tags.id
             )",
            [],
        )
        .map_err(database_error)?;
    Ok(())
}

fn bookmark_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Bookmark> {
    let accessed_at = row
        .get::<_, Option<i64>>(7)?
        .map(timestamp_to_string)
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                7,
                rusqlite::types::Type::Integer,
                Box::new(error),
            )
        })?;
    Ok(Bookmark {
        id: row.get(0)?,
        url: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        tags: Vec::new(),
        access_count: row.get(4)?,
        created_at: timestamp_to_string(row.get(5)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Integer,
                Box::new(error),
            )
        })?,
        updated_at: timestamp_to_string(row.get(6)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Integer,
                Box::new(error),
            )
        })?,
        accessed_at,
    })
}

fn timestamp_to_string(timestamp: i64) -> Result<String, TimestampError> {
    chrono::DateTime::<Utc>::from_timestamp_millis(timestamp)
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Secs, true))
        .ok_or(TimestampError(timestamp))
}

#[derive(Debug, thiserror::Error)]
#[error("invalid Unix timestamp: {0}")]
struct TimestampError(i64);

fn placeholders(count: usize) -> String {
    std::iter::repeat_n("?", count)
        .collect::<Vec<_>>()
        .join(",")
}

fn write_error(error: rusqlite::Error, url: &str) -> AppError {
    match &error {
        rusqlite::Error::SqliteFailure(details, _)
            if details.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            AppError::bookmark_url_conflict(url)
        }
        _ => database_error(error),
    }
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}

trait OptionalRow<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalRow<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}
