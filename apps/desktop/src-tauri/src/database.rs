use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, Transaction};

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
        self.read(|connection| {
            connection
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .map_err(AppError::from)
        })
    }

    pub fn has_table(&self, table: &str) -> AppResult<bool> {
        self.read(|connection| {
            connection
                .query_row(
                    "SELECT EXISTS(
                    SELECT 1
                    FROM sqlite_master
                    WHERE type IN ('table', 'view') AND name = ?1
                )",
                    [table],
                    |row| row.get(0),
                )
                .map_err(AppError::from)
        })
    }

    pub fn assert_fts5_trigram(&self) -> AppResult<()> {
        let operation = Operation::start();
        log::debug!(
            "database_capability_check_started operation_id={} capability=fts5_trigram",
            operation.id()
        );
        self.write(|transaction| {
        transaction
            .execute(
                "INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
                 VALUES (9223372036854775807, '', '中文分词验证', '', '')",
                [],
            )
            ?;

        let matched: bool = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM bookmarks_fts
                    WHERE bookmarks_fts MATCH '中文分'
                      AND rowid = 9223372036854775807
                )",
                [],
                |row| row.get(0),
            )
            ?;

        transaction
            .execute(
                "DELETE FROM bookmarks_fts WHERE rowid = 9223372036854775807",
                [],
            )
            ?;

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
        })
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
        self.lock_connection()?
            .execute_batch(sql)
            .map_err(AppError::from)
    }

    #[doc(hidden)]
    pub fn query_i64_for_test(&self, sql: &str) -> AppResult<i64> {
        self.read(|connection| {
            connection
                .query_row(sql, [], |row| row.get(0))
                .map_err(AppError::from)
        })
    }

    pub(crate) fn read<T>(
        &self,
        operation: impl FnOnce(&Connection) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let result = operation(&transaction);
        match result {
            Ok(value) => {
                transaction.rollback()?;
                Ok(value)
            }
            Err(error) => Err(error),
        }
    }

    pub(crate) fn snapshot<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let result = operation(&transaction);
        match result {
            Ok(value) => {
                transaction.rollback()?;
                Ok(value)
            }
            Err(error) => Err(error),
        }
    }

    pub(crate) fn write<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> AppResult<T>,
    ) -> AppResult<T> {
        self.in_transaction(operation)
    }

    fn in_transaction<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let result = operation(&transaction)?;
        transaction.commit()?;
        Ok(result)
    }

    fn lock_connection(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| AppError::internal_error("database lock is poisoned"))
    }
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        database_error(error)
    }
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

#[cfg(test)]
mod interface_tests {
    use super::Database;
    use crate::error::{AppError, AppResult};

    #[test]
    fn read_returns_values_and_maps_sqlite_errors() {
        let database = Database::open_in_memory().unwrap();

        assert_eq!(
            database
                .read(|connection| {
                    connection
                        .query_row("SELECT 42", [], |row| row.get::<_, i64>(0))
                        .map_err(AppError::from)
                })
                .unwrap(),
            42
        );
        assert_eq!(
            database
                .read(|connection| {
                    connection.execute("INVALID SQL", [])?;
                    Ok(())
                })
                .unwrap_err()
                .code(),
            "database_error"
        );
    }

    #[test]
    fn write_commits_success_and_rolls_back_domain_errors() {
        let database = Database::open_in_memory().unwrap();
        database
            .write(|transaction| {
                transaction.execute("INSERT INTO tags(name) VALUES ('committed')", [])?;
                Ok(())
            })
            .unwrap();

        let error = database
            .write(|transaction| {
                transaction.execute("INSERT INTO tags(name) VALUES ('rolled-back')", [])?;
                Err::<(), _>(AppError::validation_error("stop"))
            })
            .unwrap_err();

        assert_eq!(error.code(), "validation_error");
        assert_eq!(
            database
                .read(|connection| {
                    connection
                        .query_row("SELECT count(*) FROM tags", [], |row| row.get::<_, i64>(0))
                        .map_err(AppError::from)
                })
                .unwrap(),
            1
        );
    }

    #[test]
    fn snapshot_rolls_back_without_exposing_transaction_control() {
        let database = Database::open_in_memory().unwrap();

        let value = database
            .snapshot(|transaction| {
                transaction.execute("INSERT INTO tags(name) VALUES ('temporary')", [])?;
                transaction
                    .query_row("SELECT 7", [], |row| row.get::<_, i64>(0))
                    .map_err(AppError::from)
            })
            .unwrap();

        assert_eq!(value, 7);
        assert_eq!(
            database
                .read(|connection| {
                    connection
                        .query_row("SELECT count(*) FROM tags", [], |row| row.get::<_, i64>(0))
                        .map_err(AppError::from)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn read_does_not_persist_accidental_writes() {
        let database = Database::open_in_memory().unwrap();

        database
            .read(|connection| {
                connection.execute("INSERT INTO tags(name) VALUES ('temporary')", [])?;
                Ok(())
            })
            .unwrap();

        assert_eq!(
            database
                .read(|connection| {
                    connection
                        .query_row("SELECT count(*) FROM tags", [], |row| row.get::<_, i64>(0))
                        .map_err(AppError::from)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn write_rolls_back_when_sql_execution_fails() {
        let database = Database::open_in_memory().unwrap();

        let error = database
            .write(|transaction| {
                transaction.execute("INSERT INTO tags(name) VALUES ('rolled-back')", [])?;
                transaction.execute("INVALID SQL", [])?;
                Ok(())
            })
            .unwrap_err();

        assert_eq!(error.code(), "database_error");
        assert_eq!(
            database
                .read(|connection| {
                    connection
                        .query_row("SELECT count(*) FROM tags", [], |row| row.get::<_, i64>(0))
                        .map_err(AppError::from)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn poisoned_connection_lock_returns_a_stable_error() {
        let database = Database::open_in_memory().unwrap();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _: AppResult<()> = database.read(|_| panic!("poison database lock"));
        }));

        let error = database.read(|_| Ok(())).unwrap_err();

        assert_eq!(error.code(), "internal_error");
        assert_eq!(error.message, "database lock is poisoned");
    }
}
