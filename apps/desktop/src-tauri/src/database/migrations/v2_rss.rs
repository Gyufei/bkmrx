use rusqlite::Transaction;

use crate::error::{AppError, AppResult};

pub(super) fn apply(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute_batch(SCHEMA).map_err(database_error)
}

const SCHEMA: &str = r#"
CREATE TABLE rss_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url TEXT NOT NULL,
    feed_url TEXT NOT NULL UNIQUE,
    site_url TEXT NULL,
    title TEXT NOT NULL,
    custom_title TEXT NULL,
    last_successful_fetched_at INTEGER NULL,
    last_failed_at INTEGER NULL,
    last_error TEXT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE rss_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL,
    guid TEXT NULL,
    title TEXT NOT NULL,
    link TEXT NULL,
    author TEXT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    published_at INTEGER NULL,
    fetched_at INTEGER NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(feed_id, dedupe_key)
);

CREATE INDEX idx_rss_entries_feed_sort
    ON rss_entries(feed_id, COALESCE(published_at, fetched_at) DESC, id DESC);
CREATE INDEX idx_rss_entries_unread_sort
    ON rss_entries(is_read, COALESCE(published_at, fetched_at) DESC, id DESC);
"#;

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
