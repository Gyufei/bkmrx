use rusqlite::{params, Transaction};

use crate::error::AppResult;
use crate::identity::{TodoId, TodoTagId};

pub(super) fn apply(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute_batch(
        "ALTER TABLE todos ADD COLUMN uuid TEXT;
         ALTER TABLE todo_tags ADD COLUMN uuid TEXT;",
    )?;

    for legacy_id in collect_integer_ids(transaction, "todos")? {
        transaction.execute(
            "UPDATE todos SET uuid = ?1 WHERE id = ?2",
            params![TodoId::new(), legacy_id],
        )?;
    }
    for legacy_id in collect_integer_ids(transaction, "todo_tags")? {
        transaction.execute(
            "UPDATE todo_tags SET uuid = ?1 WHERE id = ?2",
            params![TodoTagId::new(), legacy_id],
        )?;
    }

    transaction.execute_batch(
        "CREATE UNIQUE INDEX idx_todos_uuid ON todos(uuid);
         CREATE UNIQUE INDEX idx_todo_tags_uuid ON todo_tags(uuid);

         DROP INDEX idx_todo_tag_relations_tag_todo;
         ALTER TABLE todo_tag_relations RENAME TO todo_tag_relations_legacy;
         CREATE TABLE todo_tag_relations (
             todo_id TEXT NOT NULL REFERENCES todos(uuid) ON DELETE CASCADE,
             tag_id TEXT NOT NULL REFERENCES todo_tags(uuid) ON DELETE CASCADE,
             PRIMARY KEY (todo_id, tag_id)
         );
         INSERT INTO todo_tag_relations(todo_id, tag_id)
         SELECT todo.uuid, tag.uuid
         FROM todo_tag_relations_legacy legacy
         JOIN todos todo ON todo.id = legacy.todo_id
         JOIN todo_tags tag ON tag.id = legacy.tag_id;
         DROP TABLE todo_tag_relations_legacy;
         CREATE INDEX idx_todo_tag_relations_tag_todo
             ON todo_tag_relations(tag_id, todo_id);

         CREATE INDEX idx_todos_status_uuid_sort
             ON todos(status, is_high_priority DESC, updated_at DESC, uuid DESC);",
    )?;
    Ok(())
}

fn collect_integer_ids(transaction: &Transaction<'_>, table: &str) -> AppResult<Vec<i64>> {
    let mut statement = transaction.prepare(&format!("SELECT id FROM {table} ORDER BY id"))?;
    let rows = statement.query_map([], |row| row.get(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
