use crate::error::{AppError, AppResult};

use super::{run_pending, Connection, Migration, Transaction};

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

#[test]
fn bookmark_uuid_migration_preserves_entities_relations_and_search_content() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .pragma_update(None, "foreign_keys", true)
        .unwrap();
    let transaction = connection.transaction().unwrap();
    super::v1_baseline::apply(&transaction).unwrap();
    transaction
        .execute_batch(
            "INSERT INTO bookmarks
             (id, url, title, description, access_count, created_at, updated_at)
             VALUES (7, 'https://example.com', 'Example', 'Searchable', 0, 1, 1);
             INSERT INTO tags(id, name) VALUES (9, 'tool');
             INSERT INTO bookmark_tags(bookmark_id, tag_id) VALUES (7, 9);
             INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
             VALUES (7, 'https://example.com', 'Example', 'Searchable', 'tool');",
        )
        .unwrap();

    super::v2_bookmark_uuid::apply(&transaction).unwrap();
    transaction.commit().unwrap();

    let (bookmark_id, tag_id): (String, String) = connection
        .query_row("SELECT bookmark_id, tag_id FROM bookmark_tags", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap();
    assert_eq!(
        bookmark_id
            .parse::<crate::identity::BookmarkId>()
            .unwrap()
            .to_string(),
        bookmark_id
    );
    assert_eq!(
        tag_id
            .parse::<crate::identity::BookmarkTagId>()
            .unwrap()
            .to_string(),
        tag_id
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM bookmarks_fts WHERE bookmarks_fts MATCH 'Search'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        1
    );
}

#[test]
fn todo_uuid_migration_preserves_entities_and_relations() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .pragma_update(None, "foreign_keys", true)
        .unwrap();
    let transaction = connection.transaction().unwrap();
    super::v1_baseline::apply(&transaction).unwrap();
    super::v2_bookmark_uuid::apply(&transaction).unwrap();
    transaction
        .execute_batch(
            "INSERT INTO todos
             (id, title, description, status, is_high_priority, created_at, updated_at)
             VALUES (11, 'Task', 'Detail', 'in_progress', 0, 1, 1);
             INSERT INTO todo_tags(id, name) VALUES (13, 'Work');
             INSERT INTO todo_tag_relations(todo_id, tag_id) VALUES (11, 13);",
        )
        .unwrap();

    super::v3_todo_uuid::apply(&transaction).unwrap();
    transaction.commit().unwrap();

    let (todo_id, tag_id): (String, String) = connection
        .query_row(
            "SELECT todo_id, tag_id FROM todo_tag_relations",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        todo_id
            .parse::<crate::identity::TodoId>()
            .unwrap()
            .to_string(),
        todo_id
    );
    assert_eq!(
        tag_id
            .parse::<crate::identity::TodoTagId>()
            .unwrap()
            .to_string(),
        tag_id
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM todos todo
                 JOIN todo_tag_relations rel ON rel.todo_id = todo.uuid
                 JOIN todo_tags tag ON tag.uuid = rel.tag_id
                 WHERE todo.title = 'Task' AND tag.name = 'Work'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        1
    );
}
