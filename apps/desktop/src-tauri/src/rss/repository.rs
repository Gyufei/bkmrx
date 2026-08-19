use std::sync::Arc;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use rusqlite::{params, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};

use crate::{
    database::Database,
    error::{AppError, AppResult},
};

use super::model::{
    CreateFeed, EntryPage, EntryPageRequest, EntryQueryScope, ParsedEntry, ParsedFeed, RssEntry,
    RssFeed,
};

const PAGE_SIZE: usize = 30;

#[derive(Debug, Clone)]
pub struct RssRepository {
    database: Arc<Database>,
}

impl RssRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn list_feeds(&self) -> AppResult<Vec<RssFeed>> {
        let connection = self.database.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT f.id, f.source_url, f.feed_url, f.site_url, f.title, f.custom_title,
                    (SELECT count(*) FROM rss_entries e WHERE e.feed_id = f.id),
                    (SELECT count(*) FROM rss_entries e WHERE e.feed_id = f.id AND e.is_read = 0),
                    f.last_successful_fetched_at, f.last_failed_at, f.last_error,
                    f.created_at, f.updated_at
             FROM rss_feeds f
             ORDER BY COALESCE(f.custom_title, f.title) COLLATE NOCASE, f.id",
            )
            .map_err(database_error)?;
        let feeds = statement
            .query_map([], feed_from_row)
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        Ok(feeds)
    }

    pub fn get_feed(&self, id: i64) -> AppResult<Option<RssFeed>> {
        Ok(self.list_feeds()?.into_iter().find(|feed| feed.id == id))
    }

    pub fn create(&self, input: &CreateFeed, parsed: &ParsedFeed) -> AppResult<RssFeed> {
        let now = Utc::now().timestamp();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO rss_feeds (
                source_url, feed_url, site_url, title, last_successful_fetched_at,
                created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)",
                params![
                    input.source_url,
                    input.feed_url,
                    parsed.site_url,
                    parsed.title,
                    now
                ],
            )
            .map_err(|error| feed_write_error(error, &input.feed_url))?;
        let id = transaction.last_insert_rowid();
        upsert_entries(&transaction, id, &parsed.entries, now)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);
        self.get_feed(id)?
            .ok_or_else(|| AppError::internal_error("created feed could not be reloaded"))
    }

    pub fn apply_refresh(
        &self,
        id: i64,
        feed_url: &str,
        parsed: &ParsedFeed,
    ) -> AppResult<RssFeed> {
        let now = Utc::now().timestamp();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let changed = transaction
            .execute(
                "UPDATE rss_feeds SET feed_url = ?1, site_url = ?2, title = ?3,
                    last_successful_fetched_at = ?4, last_failed_at = NULL,
                    last_error = NULL, updated_at = ?4
             WHERE id = ?5",
                params![feed_url, parsed.site_url, parsed.title, now, id],
            )
            .map_err(|error| feed_write_error(error, feed_url))?;
        if changed == 0 {
            return Err(feed_not_found(id));
        }
        upsert_entries(&transaction, id, &parsed.entries, now)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);
        self.get_feed(id)?
            .ok_or_else(|| AppError::internal_error("refreshed feed could not be reloaded"))
    }

    pub fn record_failure(&self, id: i64, message: &str) -> AppResult<()> {
        let changed = self.database.connection()?.execute(
            "UPDATE rss_feeds SET last_failed_at = ?1, last_error = ?2, updated_at = ?1 WHERE id = ?3",
            params![Utc::now().timestamp(), message, id],
        ).map_err(database_error)?;
        if changed == 0 {
            return Err(feed_not_found(id));
        }
        Ok(())
    }

    pub fn rename(&self, id: i64, custom_title: Option<&str>) -> AppResult<RssFeed> {
        let title = custom_title
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let changed = self
            .database
            .connection()?
            .execute(
                "UPDATE rss_feeds SET custom_title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, Utc::now().timestamp(), id],
            )
            .map_err(database_error)?;
        if changed == 0 {
            return Err(feed_not_found(id));
        }
        self.get_feed(id)?
            .ok_or_else(|| AppError::internal_error("renamed feed could not be reloaded"))
    }

    pub fn delete(&self, id: i64) -> AppResult<()> {
        let changed = self
            .database
            .connection()?
            .execute("DELETE FROM rss_feeds WHERE id = ?1", [id])
            .map_err(database_error)?;
        if changed == 0 {
            return Err(feed_not_found(id));
        }
        Ok(())
    }

    pub fn mark_entry_read(&self, id: i64, is_read: bool) -> AppResult<RssEntry> {
        let changed = self
            .database
            .connection()?
            .execute(
                "UPDATE rss_entries SET is_read = ?1, updated_at = ?2 WHERE id = ?3",
                params![is_read, Utc::now().timestamp(), id],
            )
            .map_err(database_error)?;
        if changed == 0 {
            return Err(entry_not_found(id));
        }
        self.get_entry(id)?
            .ok_or_else(|| AppError::internal_error("updated entry could not be reloaded"))
    }

    pub fn list_entries(&self, request: &EntryPageRequest) -> AppResult<EntryPage> {
        let cursor = request.cursor.as_deref().map(decode_cursor).transpose()?;
        if cursor
            .as_ref()
            .is_some_and(|cursor| cursor.scope != request.scope)
        {
            return Err(AppError::invalid_cursor());
        }
        let (after_sort, after_id) = cursor
            .map(|cursor| (Some(cursor.sort_at), Some(cursor.id)))
            .unwrap_or((None, None));
        let connection = self.database.connection()?;
        let base = "SELECT e.id, e.feed_id, COALESCE(f.custom_title, f.title), e.title, e.link,
                    e.author, e.content_html, e.summary, e.published_at, e.fetched_at, e.is_read
             FROM rss_entries e JOIN rss_feeds f ON f.id = e.feed_id";
        let suffix = "AND (?1 IS NULL OR COALESCE(e.published_at, e.fetched_at) < ?1
                        OR (COALESCE(e.published_at, e.fetched_at) = ?1 AND e.id < ?2))
             ORDER BY COALESCE(e.published_at, e.fetched_at) DESC, e.id DESC LIMIT ?3";
        let sql = match request.scope {
            EntryQueryScope::All => format!("{base} WHERE 1 = 1 {suffix}"),
            EntryQueryScope::Unread => format!("{base} WHERE e.is_read = 0 {suffix}"),
            EntryQueryScope::Feed { .. } => format!("{base} WHERE e.feed_id = ?4 {suffix}"),
        };
        let mut statement = connection.prepare(&sql).map_err(database_error)?;
        let limit = (PAGE_SIZE + 1) as i64;
        let mut entries = match request.scope {
            EntryQueryScope::Feed { feed_id } => statement.query_map(
                params![after_sort, after_id, limit, feed_id],
                entry_from_row,
            ),
            _ => statement.query_map(params![after_sort, after_id, limit], entry_from_row),
        }
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
        let has_more = entries.len() > PAGE_SIZE;
        entries.truncate(PAGE_SIZE);
        let next_cursor = if has_more {
            entries
                .last()
                .map(|entry| {
                    encode_cursor(&Cursor {
                        sort_at: entry.published_at.unwrap_or(entry.fetched_at),
                        id: entry.id,
                        scope: request.scope.clone(),
                    })
                })
                .transpose()?
        } else {
            None
        };
        Ok(EntryPage {
            entries,
            next_cursor,
        })
    }

    fn get_entry(&self, id: i64) -> AppResult<Option<RssEntry>> {
        self.database
            .connection()?
            .query_row(
                "SELECT e.id, e.feed_id, COALESCE(f.custom_title, f.title), e.title, e.link,
                    e.author, e.content_html, e.summary, e.published_at, e.fetched_at, e.is_read
             FROM rss_entries e JOIN rss_feeds f ON f.id = e.feed_id WHERE e.id = ?1",
                [id],
                entry_from_row,
            )
            .optional()
            .map_err(database_error)
    }
}

fn upsert_entries(
    transaction: &Transaction<'_>,
    feed_id: i64,
    entries: &[ParsedEntry],
    now: i64,
) -> AppResult<()> {
    let mut statement = transaction
        .prepare(
            "INSERT INTO rss_entries (
            feed_id, dedupe_key, guid, title, link, author, content_html, summary,
            published_at, fetched_at, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
         ON CONFLICT(feed_id, dedupe_key) DO UPDATE SET
            guid = excluded.guid, title = excluded.title, link = excluded.link,
            author = excluded.author, content_html = excluded.content_html,
            summary = excluded.summary, published_at = excluded.published_at,
            fetched_at = excluded.fetched_at, updated_at = excluded.updated_at",
        )
        .map_err(database_error)?;
    for entry in entries {
        statement
            .execute(params![
                feed_id,
                entry.dedupe_key,
                entry.guid,
                entry.title,
                entry.link,
                entry.author,
                entry.content_html,
                entry.summary,
                entry.published_at,
                entry.fetched_at,
                now
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn feed_from_row(row: &Row<'_>) -> rusqlite::Result<RssFeed> {
    Ok(RssFeed {
        id: row.get(0)?,
        source_url: row.get(1)?,
        feed_url: row.get(2)?,
        site_url: row.get(3)?,
        title: row.get(4)?,
        custom_title: row.get(5)?,
        entry_count: row.get(6)?,
        unread_count: row.get(7)?,
        last_successful_fetched_at: row.get(8)?,
        last_failed_at: row.get(9)?,
        last_error: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn entry_from_row(row: &Row<'_>) -> rusqlite::Result<RssEntry> {
    Ok(RssEntry {
        id: row.get(0)?,
        feed_id: row.get(1)?,
        feed_title: row.get(2)?,
        title: row.get(3)?,
        link: row.get(4)?,
        author: row.get(5)?,
        content_html: row.get(6)?,
        summary: row.get(7)?,
        published_at: row.get(8)?,
        fetched_at: row.get(9)?,
        is_read: row.get(10)?,
    })
}

#[derive(Serialize, Deserialize)]
struct Cursor {
    sort_at: i64,
    id: i64,
    scope: EntryQueryScope,
}

fn encode_cursor(cursor: &Cursor) -> AppResult<String> {
    serde_json::to_vec(cursor)
        .map(|value| URL_SAFE_NO_PAD.encode(value))
        .map_err(|_| AppError::invalid_cursor())
}

fn decode_cursor(value: &str) -> AppResult<Cursor> {
    URL_SAFE_NO_PAD
        .decode(value)
        .ok()
        .and_then(|value| serde_json::from_slice(&value).ok())
        .ok_or_else(AppError::invalid_cursor)
}

fn feed_not_found(id: i64) -> AppError {
    AppError::rss_error("rss_feed_not_found", format!("Feed {id} was not found"))
}
fn entry_not_found(id: i64) -> AppError {
    AppError::rss_error("rss_entry_not_found", format!("Entry {id} was not found"))
}
fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
fn feed_write_error(error: rusqlite::Error, feed_url: &str) -> AppError {
    if matches!(error, rusqlite::Error::SqliteFailure(ref inner, _) if inner.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE)
    {
        AppError::rss_error(
            "rss_feed_conflict",
            format!("A subscription for {feed_url} already exists"),
        )
    } else {
        database_error(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use std::sync::Arc;

    fn parsed(title: &str, fetched_at: i64) -> ParsedFeed {
        ParsedFeed {
            title: "Feed".into(),
            site_url: None,
            entries: vec![ParsedEntry {
                dedupe_key: "guid:1".into(),
                guid: Some("1".into()),
                title: title.into(),
                link: None,
                author: None,
                content_html: "body".into(),
                summary: "body".into(),
                published_at: Some(100),
                fetched_at,
            }],
        }
    }

    #[test]
    fn refresh_preserves_read_state_and_cursor_scope() {
        let repository = RssRepository::new(Arc::new(Database::open_in_memory().unwrap()));
        let input = CreateFeed {
            source_url: "https://example.com".into(),
            feed_url: "https://example.com/feed".into(),
        };
        let feed = repository.create(&input, &parsed("first", 1)).unwrap();
        assert_eq!(feed.entry_count, 1);
        assert_eq!(feed.unread_count, 1);
        let page = repository
            .list_entries(&EntryPageRequest {
                scope: EntryQueryScope::All,
                cursor: None,
            })
            .unwrap();
        repository
            .mark_entry_read(page.entries[0].id, true)
            .unwrap();
        repository
            .apply_refresh(feed.id, &input.feed_url, &parsed("updated", 2))
            .unwrap();
        let page = repository
            .list_entries(&EntryPageRequest {
                scope: EntryQueryScope::All,
                cursor: None,
            })
            .unwrap();
        assert!(page.entries[0].is_read);
        assert_eq!(page.entries[0].title, "updated");
        let refreshed_feed = repository.get_feed(feed.id).unwrap().unwrap();
        assert_eq!(refreshed_feed.entry_count, 1);
        assert_eq!(refreshed_feed.unread_count, 0);
    }
}
