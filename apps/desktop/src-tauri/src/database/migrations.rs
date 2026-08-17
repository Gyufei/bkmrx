use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::bookmarks::{AppError, AppResult};

mod v3_baseline;

pub(super) const LATEST_SCHEMA_VERSION: i64 = 3;

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
    to: 3,
    apply: v3_baseline::apply,
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
mod tests {
    use super::{run_pending, AppError, AppResult, Connection, Migration, Transaction};

    fn create_v1(transaction: &Transaction<'_>) -> AppResult<()> {
        transaction
            .execute_batch("CREATE TABLE first(id INTEGER PRIMARY KEY);")
            .map_err(|error| AppError::database_error(error.to_string()))
    }

    fn create_v2(transaction: &Transaction<'_>) -> AppResult<()> {
        transaction
            .execute_batch("CREATE TABLE second(id INTEGER PRIMARY KEY);")
            .map_err(|error| AppError::database_error(error.to_string()))
    }

    fn fail_v2(transaction: &Transaction<'_>) -> AppResult<()> {
        transaction
            .execute_batch("CREATE TABLE must_roll_back(id INTEGER PRIMARY KEY);")
            .map_err(|error| AppError::database_error(error.to_string()))?;
        Err(AppError::database_error("forced migration failure"))
    }

    #[test]
    fn applies_registered_steps_and_updates_version() {
        let mut connection = Connection::open_in_memory().unwrap();
        let migrations = [
            Migration {
                from: 0,
                to: 1,
                apply: create_v1,
            },
            Migration {
                from: 1,
                to: 2,
                apply: create_v2,
            },
        ];

        run_pending(&mut connection, 2, &migrations).unwrap();

        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(table_count(&connection, "first"), 1);
        assert_eq!(table_count(&connection, "second"), 1);
    }

    #[test]
    fn rolls_back_failed_step_and_keeps_previous_version() {
        let mut connection = Connection::open_in_memory().unwrap();
        let migrations = [
            Migration {
                from: 0,
                to: 1,
                apply: create_v1,
            },
            Migration {
                from: 1,
                to: 2,
                apply: fail_v2,
            },
        ];

        let error = run_pending(&mut connection, 2, &migrations).unwrap_err();

        assert_eq!(error.code(), "database_error");
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(table_count(&connection, "first"), 1);
        assert_eq!(table_count(&connection, "must_roll_back"), 0);
    }

    #[test]
    fn rejects_version_without_registered_path() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();

        let error = run_pending(&mut connection, 3, &[]).unwrap_err();

        assert_eq!(error.code(), "unsupported_schema_version");
    }

    #[test]
    fn rejects_non_advancing_registered_step() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
        let migrations = [Migration {
            from: 1,
            to: 1,
            apply: create_v2,
        }];

        let error = run_pending(&mut connection, 2, &migrations).unwrap_err();

        assert_eq!(error.code(), "internal_error");
        assert_eq!(table_count(&connection, "second"), 0);
    }

    fn table_count(connection: &Connection, table: &str) -> i64 {
        connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .unwrap()
    }
}
