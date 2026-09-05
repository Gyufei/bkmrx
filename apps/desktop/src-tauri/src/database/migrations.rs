use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::error::{AppError, AppResult};
use crate::logging::{sanitize_error, Operation};

mod v1_baseline;

pub(super) const LATEST_SCHEMA_VERSION: i64 = 1;

type ApplyMigration = fn(&Transaction<'_>) -> AppResult<()>;

struct Migration {
    from: i64,
    to: i64,
    apply: ApplyMigration,
}

// To add a schema version:
// 1. Add a migration function containing only that version's DDL/data changes.
// 2. Append one contiguous step to MIGRATIONS.
// 3. Advance LATEST_SCHEMA_VERSION.
// The runner owns transactions and user_version updates; migration functions must not.
const MIGRATIONS: &[Migration] = &[Migration {
    from: 0,
    to: 1,
    apply: v1_baseline::apply,
}];

pub(super) fn run(connection: &mut Connection) -> AppResult<()> {
    run_pending(connection, LATEST_SCHEMA_VERSION, MIGRATIONS)
}

fn run_pending(
    connection: &mut Connection,
    latest_version: i64,
    migrations: &[Migration],
) -> AppResult<()> {
    let operation = Operation::start();
    let mut version = schema_version(connection)?;
    log::info!(
        "database_migration_started operation_id={} from_version={} to_version={}",
        operation.id(),
        version,
        latest_version
    );
    while version != latest_version {
        let migration = migrations
            .iter()
            .find(|migration| migration.from == version)
            .ok_or_else(|| AppError::unsupported_schema_version(version, latest_version))?;
        if migration.to <= version || migration.to > latest_version {
            return Err(AppError::internal_error(
                "database migration registry contains an invalid step",
            ));
        }
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Err(error) = (migration.apply)(&transaction) {
            log_migration_failure(operation, version, migration.to, &error);
            return Err(error);
        }
        transaction.pragma_update(None, "user_version", migration.to)?;
        transaction.commit()?;
        version = migration.to;
        log::info!(
            "database_migration_step_completed operation_id={} schema_version={}",
            operation.id(),
            version
        );
    }
    log::info!(
        "database_migration_completed operation_id={} schema_version={} elapsed_ms={}",
        operation.id(),
        version,
        operation.elapsed_ms()
    );
    Ok(())
}

fn schema_version(connection: &Connection) -> AppResult<i64> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(AppError::from)
}

fn log_migration_failure(operation: Operation, from: i64, to: i64, error: &AppError) {
    log::error!(
        "database_migration_failed operation_id={} from_version={} to_version={} error_code={} elapsed_ms={} error={:?}",
        operation.id(),
        from,
        to,
        error.code(),
        operation.elapsed_ms(),
        sanitize_error(&error.to_string())
    );
}

#[cfg(test)]
#[path = "migrations_tests.rs"]
mod tests;
