use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::bookmarks::{AppError, AppResult};

const SUPPORTED_SCHEMA_VERSION: i64 = 1;

const CREATE_V1_SCHEMA: &str = r#"
BEGIN IMMEDIATE;

CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    accessed_at INTEGER NULL
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

PRAGMA user_version = 1;
COMMIT;
"#;

#[derive(Debug)]
pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> AppResult<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                AppError::database_error(format!("failed to create database directory: {error}"))
            })?;
        }

        let connection = Connection::open(path).map_err(database_error)?;
        Self::initialize(connection)
    }

    pub fn open_in_memory() -> AppResult<Self> {
        let connection = Connection::open_in_memory().map_err(database_error)?;
        Self::initialize(connection)
    }

    pub fn schema_version(&self) -> AppResult<i64> {
        self.connection()?
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(database_error)
    }

    pub fn verify_supported_version(&self) -> AppResult<()> {
        let version = self.schema_version()?;
        if version > SUPPORTED_SCHEMA_VERSION {
            return Err(AppError::unsupported_schema_version(
                version,
                SUPPORTED_SCHEMA_VERSION,
            ));
        }
        Ok(())
    }

    pub fn has_table(&self, table: &str) -> AppResult<bool> {
        self.connection()?
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM sqlite_master
                    WHERE type IN ('table', 'view') AND name = ?1
                )",
                [table],
                |row| row.get(0),
            )
            .map_err(database_error)
    }

    pub fn assert_fts5_trigram(&self) -> AppResult<()> {
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
                 VALUES (9223372036854775807, '', '中文分词验证', '', '')",
                [],
            )
            .map_err(database_error)?;

        let matched: bool = connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM bookmarks_fts
                    WHERE bookmarks_fts MATCH '中文分'
                      AND rowid = 9223372036854775807
                )",
                [],
                |row| row.get(0),
            )
            .map_err(database_error)?;

        connection
            .execute(
                "DELETE FROM bookmarks_fts WHERE rowid = 9223372036854775807",
                [],
            )
            .map_err(database_error)?;

        if !matched {
            return Err(AppError::database_error(
                "bundled SQLite does not provide a working FTS5 trigram tokenizer",
            ));
        }
        Ok(())
    }

    #[doc(hidden)]
    pub fn set_user_version_for_test(&self, version: i64) -> AppResult<()> {
        self.connection()?
            .pragma_update(None, "user_version", version)
            .map_err(database_error)
    }

    fn initialize(connection: Connection) -> AppResult<Self> {
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA busy_timeout = 5000;",
            )
            .map_err(database_error)?;

        let database = Self {
            connection: Mutex::new(connection),
        };
        database.verify_supported_version()?;
        if database.schema_version()? == 0 {
            database
                .connection()?
                .execute_batch(CREATE_V1_SCHEMA)
                .map_err(database_error)?;
        }
        Ok(database)
    }

    fn connection(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| AppError::internal_error("database lock is poisoned"))
    }
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
