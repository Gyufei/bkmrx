use rusqlite::{Connection, TransactionBehavior};

use crate::error::{AppError, AppResult};
use crate::logging::Operation;

use super::schema;

pub(super) const LATEST_SCHEMA_VERSION: i64 = 8;

pub(super) fn initialize(connection: &mut Connection) -> AppResult<()> {
    let operation = Operation::start();
    let version = schema_version(connection)?;
    log::info!(
        "database_schema_initialization_started operation_id={} found_version={} supported_version={}",
        operation.id(),
        version,
        LATEST_SCHEMA_VERSION
    );
    match version {
        LATEST_SCHEMA_VERSION => {}
        7 => {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            transaction.execute_batch(
                "CREATE TABLE calendar_events (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0), event_date TEXT NOT NULL CHECK(event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), event_type TEXT NOT NULL DEFAULT 'other' CHECK(event_type IN ('work','personal','anniversary','other')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
                 CREATE INDEX idx_calendar_events_date ON calendar_events(event_date,id);",
            )?;
            transaction.pragma_update(None, "user_version", LATEST_SCHEMA_VERSION)?;
            transaction.commit()?;
        }
        0 => {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            schema::create(&transaction)?;
            transaction.pragma_update(None, "user_version", LATEST_SCHEMA_VERSION)?;
            transaction.commit()?;
            log::info!(
                "database_schema_created operation_id={} schema_version={}",
                operation.id(),
                LATEST_SCHEMA_VERSION
            );
        }
        _ => {
            return Err(AppError::unsupported_schema_version(
                version,
                LATEST_SCHEMA_VERSION,
            ))
        }
    }
    log::info!(
        "database_schema_initialization_completed operation_id={} schema_version={} elapsed_ms={}",
        operation.id(),
        LATEST_SCHEMA_VERSION,
        operation.elapsed_ms()
    );
    Ok(())
}

fn schema_version(connection: &Connection) -> AppResult<i64> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(AppError::from)
}
