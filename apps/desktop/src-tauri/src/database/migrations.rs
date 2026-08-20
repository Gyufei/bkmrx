use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::bookmarks::{AppError, AppResult};

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
    let mut version = schema_version(connection)?;
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
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        (migration.apply)(&transaction)?;
        transaction
            .pragma_update(None, "user_version", migration.to)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        version = migration.to;
    }
    Ok(())
}

fn schema_version(connection: &Connection) -> AppResult<i64> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_error)
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}

#[cfg(test)]
#[path = "migrations_tests.rs"]
mod tests;
