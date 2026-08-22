use rusqlite::Transaction;

use crate::error::{AppError, AppResult};

pub(super) fn apply(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute_batch(SCHEMA).map_err(database_error)
}

const SCHEMA: &str = r#"
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    accessed_at INTEGER NULL,
    starred_at INTEGER NULL
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE bookmark_tags (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX idx_bookmark_tags_tag_bookmark
    ON bookmark_tags(tag_id, bookmark_id);

CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
    url,
    title,
    description,
    tags,
    tokenize = 'trigram'
);

CREATE INDEX idx_bookmarks_starred
    ON bookmarks(starred_at DESC, id DESC)
    WHERE starred_at IS NOT NULL;

CREATE INDEX idx_bookmarks_updated
    ON bookmarks(updated_at DESC, id DESC);

CREATE TABLE todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'suspended', 'canceled')),
    is_high_priority INTEGER NOT NULL DEFAULT 0 CHECK (is_high_priority IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER NULL
);

CREATE TABLE todo_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE TABLE todo_tag_relations (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES todo_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX idx_todos_status_sort
    ON todos(status, is_high_priority DESC, updated_at DESC, id DESC);
CREATE INDEX idx_todo_tag_relations_tag_todo
    ON todo_tag_relations(tag_id, todo_id);

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
