use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};

use crate::database::Database;
use crate::error::{AppError, AppResult};

use super::{
    sql::{escape_like, placeholders},
    Bookmark, CreateBookmark, TagQueryRequest, TagSummary, UpdateBookmark,
};

#[derive(Debug, Clone)]
pub(crate) struct SqliteBookmarkRepository {
    database: Arc<Database>,
}

impl SqliteBookmarkRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }
}

impl SqliteBookmarkRepository {
    pub(super) fn create(&self, input: CreateBookmark) -> AppResult<Bookmark> {
        let url = normalize_url(&input.url)?;
        let title = normalize_title(&input.title, &url);
        let tags = normalize_tags(input.tags)?;
        let now = Utc::now().timestamp_millis();
        self.database.write(|transaction| {
            if let Err(error) = transaction.execute(
                "INSERT INTO bookmarks (
                url, title, description, access_count, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
                params![url, title, input.description, now],
            ) {
                return Err(write_error(error, &url));
            }
            let id = transaction.last_insert_rowid();
            persist_searchable_content(transaction, id, &url, &title, &input.description, &tags)?;
            let bookmark = hydrate_ordered(transaction, &[id])?
                .into_iter()
                .next()
                .ok_or_else(|| {
                    AppError::internal_error("created bookmark could not be reloaded")
                })?;
            Ok(bookmark)
        })
    }

    pub(super) fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark> {
        self.database.write(|transaction| {
            let existing = hydrate_ordered(transaction, &[id])?
                .into_iter()
                .next()
                .ok_or_else(|| AppError::bookmark_not_found(id))?;
            let url = match input.url {
                Some(url) => normalize_url(&url)?,
                None => existing.url,
            };
            let title = normalize_title(input.title.as_deref().unwrap_or(&existing.title), &url);
            let description = input.description.unwrap_or(existing.description);
            let tags = input
                .tags
                .map(normalize_tags)
                .transpose()?
                .unwrap_or(existing.tags);
            let now = Utc::now().timestamp_millis();

            if let Err(error) = transaction.execute(
                "UPDATE bookmarks
             SET url = ?1, title = ?2, description = ?3, updated_at = ?4
             WHERE id = ?5",
                params![url, title, description, now, id],
            ) {
                return Err(write_error(error, &url));
            }
            persist_searchable_content(transaction, id, &url, &title, &description, &tags)?;
            remove_unused_tags(transaction)?;
            let bookmark = hydrate_ordered(transaction, &[id])?
                .into_iter()
                .next()
                .ok_or_else(|| {
                    AppError::internal_error("updated bookmark could not be reloaded")
                })?;
            Ok(bookmark)
        })
    }

    pub(super) fn delete_many(&self, ids: &[i64]) -> AppResult<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = placeholders(ids.len());
        self.database.write(|transaction| {
            transaction.execute(
                &format!("DELETE FROM bookmarks_fts WHERE rowid IN ({placeholders})"),
                params_from_iter(ids.iter()),
            )?;
            let deleted = transaction.execute(
                &format!("DELETE FROM bookmarks WHERE id IN ({placeholders})"),
                params_from_iter(ids.iter()),
            )?;
            remove_unused_tags(transaction)?;
            Ok(deleted as u64)
        })
    }

    pub(super) fn delete(&self, id: i64) -> AppResult<()> {
        self.database.write(|transaction| {
            let exists = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM bookmarks WHERE id = ?1)",
                [id],
                |row| row.get::<_, bool>(0),
            )?;
            if !exists {
                return Err(AppError::bookmark_not_found(id));
            }
            transaction.execute("DELETE FROM bookmarks_fts WHERE rowid = ?1", [id])?;
            transaction.execute("DELETE FROM bookmarks WHERE id = ?1", [id])?;
            remove_unused_tags(transaction)?;
            Ok(())
        })
    }

    pub(super) fn get_by_id(&self, id: i64) -> AppResult<Option<Bookmark>> {
        Ok(self.get_by_ids_ordered(&[id])?.into_iter().next())
    }

    pub(super) fn get_by_url(&self, url: &str) -> AppResult<Option<Bookmark>> {
        let url = normalize_url(url)?;
        self.database.read(|connection| {
            let id = connection
                .query_row("SELECT id FROM bookmarks WHERE url = ?1", [&url], |row| {
                    row.get::<_, i64>(0)
                })
                .optional()
                .map_err(AppError::from)?;
            Ok(match id {
                Some(id) => hydrate_ordered(connection, &[id])?.into_iter().next(),
                None => None,
            })
        })
    }

    fn get_by_ids_ordered(&self, ids: &[i64]) -> AppResult<Vec<Bookmark>> {
        self.database
            .read(|connection| hydrate_ordered(connection, ids))
    }

    pub(super) fn get_tags(&self, request: &TagQueryRequest) -> AppResult<Vec<TagSummary>> {
        if request
            .limit
            .is_some_and(|limit| !(1..=100).contains(&limit))
        {
            return Err(AppError::validation_error(
                "Tag query limit must be between 1 and 100",
            ));
        }

        let query = request.query.trim();
        let pattern = format!("%{}%", escape_like(query));
        self.database.read(|connection| {
            let mut statement = connection.prepare(
                "SELECT t.name, count(bt.bookmark_id) AS bookmark_count
                 FROM tags t
                 JOIN bookmark_tags bt ON bt.tag_id = t.id
                 WHERE ?1 = '' OR t.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE
                 GROUP BY t.id, t.name
                 ORDER BY bookmark_count DESC, t.name ASC
                 LIMIT COALESCE(?3, -1)",
            )?;
            let rows = statement.query_map(params![query, pattern, request.limit], |row| {
                Ok(TagSummary {
                    name: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
        })
    }

    pub(super) fn record_access(&self, id: i64) -> AppResult<Bookmark> {
        self.database.write(|transaction| {
            let changed = transaction.execute(
                "UPDATE bookmarks
                 SET access_count = access_count + 1, accessed_at = ?1
                 WHERE id = ?2",
                params![Utc::now().timestamp_millis(), id],
            )?;
            if changed == 0 {
                return Err(AppError::bookmark_not_found(id));
            }
            let bookmark = hydrate_ordered(transaction, &[id])?
                .into_iter()
                .next()
                .ok_or_else(|| {
                    AppError::internal_error("accessed bookmark could not be reloaded")
                })?;
            Ok(bookmark)
        })
    }

    pub(super) fn set_starred(&self, id: i64, starred: bool) -> AppResult<Bookmark> {
        let starred_at = starred.then(|| Utc::now().timestamp_millis());
        self.database.write(|transaction| {
            let changed = transaction.execute(
                "UPDATE bookmarks SET starred_at = ?1 WHERE id = ?2",
                params![starred_at, id],
            )?;
            if changed == 0 {
                return Err(AppError::bookmark_not_found(id));
            }
            let bookmark = hydrate_ordered(transaction, &[id])?
                .into_iter()
                .next()
                .ok_or_else(|| {
                    AppError::internal_error("starred bookmark could not be reloaded")
                })?;
            Ok(bookmark)
        })
    }
}

pub(crate) fn hydrate_ordered(connection: &Connection, ids: &[i64]) -> AppResult<Vec<Bookmark>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = placeholders(ids.len());
    let mut statement = connection.prepare(&format!(
        "SELECT id, url, title, description, access_count,
                    created_at, updated_at, accessed_at, starred_at
             FROM bookmarks
             WHERE id IN ({placeholders})"
    ))?;
    let rows = statement.query_map(params_from_iter(ids.iter()), bookmark_from_row)?;
    let mut bookmarks = HashMap::new();
    for row in rows {
        let bookmark = row?;
        bookmarks.insert(bookmark.id, bookmark);
    }
    drop(statement);

    let mut tag_statement = connection.prepare(&format!(
        "SELECT bt.bookmark_id, t.name
             FROM bookmark_tags bt
             JOIN tags t ON t.id = bt.tag_id
             WHERE bt.bookmark_id IN ({placeholders})
             ORDER BY t.name"
    ))?;
    let tags = tag_statement.query_map(params_from_iter(ids.iter()), |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for tag in tags {
        let (bookmark_id, name) = tag?;
        if let Some(bookmark) = bookmarks.get_mut(&bookmark_id) {
            bookmark.tags.push(name);
        }
    }

    Ok(ids.iter().filter_map(|id| bookmarks.remove(id)).collect())
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

fn normalize_tags(tags: Vec<String>) -> AppResult<Vec<String>> {
    let tags = tags
        .into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if tags.iter().any(|tag| tag.contains(',')) {
        return Err(AppError::validation_error(
            "Tag names must not contain commas",
        ));
    }
    Ok(tags)
}

pub(crate) fn persist_searchable_content(
    transaction: &Transaction<'_>,
    bookmark_id: i64,
    url: &str,
    title: &str,
    description: &str,
    tags: &[String],
) -> AppResult<()> {
    replace_tags(transaction, bookmark_id, tags)?;
    upsert_fts(transaction, bookmark_id, url, title, description, tags)
}

fn replace_tags(transaction: &Transaction<'_>, bookmark_id: i64, tags: &[String]) -> AppResult<()> {
    transaction.execute(
        "DELETE FROM bookmark_tags WHERE bookmark_id = ?1",
        [bookmark_id],
    )?;
    for tag in tags {
        transaction.execute(
            "INSERT INTO tags(name) VALUES (?1)
                 ON CONFLICT(name) DO NOTHING",
            [tag],
        )?;
        transaction.execute(
            "INSERT INTO bookmark_tags(bookmark_id, tag_id)
                 SELECT ?1, id FROM tags WHERE name = ?2",
            params![bookmark_id, tag],
        )?;
    }
    Ok(())
}

fn upsert_fts(
    transaction: &Transaction<'_>,
    id: i64,
    url: &str,
    title: &str,
    description: &str,
    tags: &[String],
) -> AppResult<()> {
    transaction.execute("DELETE FROM bookmarks_fts WHERE rowid = ?1", [id])?;
    transaction.execute(
        "INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, url, title, description, tags.join(" ")],
    )?;
    Ok(())
}

pub(crate) fn remove_unused_tags(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute(
        "DELETE FROM tags
             WHERE NOT EXISTS (
                 SELECT 1 FROM bookmark_tags WHERE tag_id = tags.id
             )",
        [],
    )?;
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
    let starred_at = row
        .get::<_, Option<i64>>(8)?
        .map(timestamp_to_string)
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
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
        starred_at,
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

fn write_error(error: rusqlite::Error, url: &str) -> AppError {
    match &error {
        rusqlite::Error::SqliteFailure(details, _)
            if details.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            AppError::bookmark_url_conflict(url)
        }
        _ => error.into(),
    }
}
