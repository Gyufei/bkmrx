use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::logging::{sanitize_error, Operation};

mod migrations;

#[derive(Debug)]
pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> AppResult<Self> {
        let operation = Operation::start();
        log::info!(
            "database_open_started operation_id={} store=main",
            operation.id()
        );
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                let error = AppError::database_error(format!(
                    "failed to create database directory: {error}"
                ));
                log_database_failure("open", operation, &error);
                error
            })?;
        }

        let connection = Connection::open(path).map_err(|error| {
            let error = database_error(error);
            log_database_failure("open", operation, &error);
            error
        })?;
        let database = Self::initialize(connection).inspect_err(|error| {
            log_database_failure("initialize", operation, error);
        })?;
        log::info!(
            "database_open_completed operation_id={} store=main elapsed_ms={}",
            operation.id(),
            operation.elapsed_ms()
        );
        Ok(database)
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
        let operation = Operation::start();
        log::debug!(
            "database_capability_check_started operation_id={} capability=fts5_trigram",
            operation.id()
        );
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
            let error = AppError::database_error(
                "bundled SQLite does not provide a working FTS5 trigram tokenizer",
            );
            log_database_failure("capability_check", operation, &error);
            return Err(error);
        }
        log::info!(
            "database_capability_check_completed operation_id={} capability=fts5_trigram elapsed_ms={}",
            operation.id(),
            operation.elapsed_ms()
        );
        Ok(())
    }

    fn initialize(mut connection: Connection) -> AppResult<Self> {
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA busy_timeout = 5000;",
            )
            .map_err(database_error)?;

        migrations::run(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
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

fn log_database_failure(action: &str, operation: Operation, error: &AppError) {
    log::error!(
        "database_operation_failed operation_id={} store=main operation={} error_code={} elapsed_ms={} error={:?}",
        operation.id(),
        action,
        error.code(),
        operation.elapsed_ms(),
        sanitize_error(&error.to_string())
    );
}
