use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::bookmarks::{AppError, AppResult};

const SUPPORTED_SCHEMA_VERSION: i64 = 3;

const CREATE_V2_SCHEMA: &str = r#"
BEGIN IMMEDIATE;

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

PRAGMA user_version = 2;
COMMIT;
"#;

const ADD_TODO_SCHEMA: &str = r#"
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
"#;

const MIGRATE_V2_TO_V3: &str = r#"
BEGIN IMMEDIATE;
"#;

const FINISH_V3_SCHEMA: &str = r#"
PRAGMA user_version = 3;
COMMIT;
"#;

const MIGRATE_V1_TO_V2: &str = r#"
BEGIN IMMEDIATE;
ALTER TABLE bookmarks ADD COLUMN starred_at INTEGER NULL;
CREATE INDEX idx_bookmarks_starred
    ON bookmarks(starred_at DESC, id DESC)
    WHERE starred_at IS NOT NULL;
PRAGMA user_version = 2;
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
        match database.schema_version()? {
            0 => {
                let connection = database.connection()?;
                connection
                    .execute_batch(CREATE_V2_SCHEMA)
                    .map_err(database_error)?;
                connection
                    .execute_batch("BEGIN IMMEDIATE;")
                    .map_err(database_error)?;
                connection
                    .execute_batch(ADD_TODO_SCHEMA)
                    .map_err(database_error)?;
                connection
                    .execute_batch(FINISH_V3_SCHEMA)
                    .map_err(database_error)?;
            }
            1 => {
                let connection = database.connection()?;
                connection
                    .execute_batch(MIGRATE_V1_TO_V2)
                    .map_err(database_error)?;
                connection
                    .execute_batch(MIGRATE_V2_TO_V3)
                    .map_err(database_error)?;
                connection
                    .execute_batch(ADD_TODO_SCHEMA)
                    .map_err(database_error)?;
                connection
                    .execute_batch(FINISH_V3_SCHEMA)
                    .map_err(database_error)?;
            }
            2 => {
                let connection = database.connection()?;
                connection
                    .execute_batch(MIGRATE_V2_TO_V3)
                    .map_err(database_error)?;
                connection
                    .execute_batch(ADD_TODO_SCHEMA)
                    .map_err(database_error)?;
                connection
                    .execute_batch(FINISH_V3_SCHEMA)
                    .map_err(database_error)?;
            }
            _ => {}
        }
        Ok(database)
    }

    #[doc(hidden)]
    pub fn execute_batch_for_test(&self, sql: &str) -> AppResult<()> {
        self.connection()?
            .execute_batch(sql)
            .map_err(database_error)
    }

    #[doc(hidden)]
    pub fn query_i64_for_test(&self, sql: &str) -> AppResult<i64> {
        self.connection()?
            .query_row(sql, [], |row| row.get(0))
            .map_err(database_error)
    }

    pub(crate) fn connection(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| AppError::internal_error("database lock is poisoned"))
    }
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
