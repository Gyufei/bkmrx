use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, OptionalExtension, Transaction};

use crate::{
    database::Database,
    error::{AppError, AppResult},
};

use super::{CreateTodo, Todo, TodoList, TodoQuery, TodoStatus, TodoTag, UpdateTodo};

#[derive(Debug, Clone)]
pub struct SqliteTodoRepository {
    database: Arc<Database>,
}

impl SqliteTodoRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn query(&self, request: &TodoQuery) -> AppResult<TodoList> {
        let connection = self.database.connection()?;
        let status = request.status.map(TodoStatus::as_str);
        let mut statement = connection
            .prepare(
                "SELECT DISTINCT t.id, t.title, t.description, t.status, t.is_high_priority,
                        t.created_at, t.updated_at, t.completed_at
                 FROM todos t
                 LEFT JOIN todo_tag_relations rel ON rel.todo_id = t.id
                 WHERE (?1 IS NULL OR t.status = ?1)
                   AND (?2 IS NULL OR rel.tag_id = ?2)
                 ORDER BY
                   CASE t.status
                     WHEN 'in_progress' THEN 0 WHEN 'suspended' THEN 1
                     WHEN 'completed' THEN 2 ELSE 3 END,
                   t.is_high_priority DESC,
                   CASE WHEN t.status = 'in_progress' THEN t.created_at
                        WHEN t.status = 'completed' THEN t.completed_at
                        ELSE t.updated_at END DESC,
                   t.id DESC",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map(params![status, request.tag_id], todo_from_row)
            .map_err(database_error)?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(database_error)?);
        }
        drop(statement);
        let tags_by_todo = tags_for_todos(
            &connection,
            &items.iter().map(|todo| todo.id).collect::<Vec<_>>(),
        )?;
        for todo in &mut items {
            todo.tags = tags_by_todo.get(&todo.id).cloned().unwrap_or_default();
        }
        let (total, completed) = connection
            .query_row(
                "SELECT count(DISTINCT t.id),
                        count(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)
                 FROM todos t
                 LEFT JOIN todo_tag_relations rel ON rel.todo_id = t.id
                 WHERE (?1 IS NULL OR rel.tag_id = ?1)",
                [request.tag_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(database_error)?;
        Ok(TodoList {
            items,
            total,
            completed,
        })
    }

    pub fn create(&self, input: CreateTodo) -> AppResult<Todo> {
        let title = normalize_title(&input.title)?;
        let tags = normalize_tags(input.tags)?;
        let now = Utc::now().timestamp_millis();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO todos (title, description, status, is_high_priority, created_at, updated_at)
                 VALUES (?1, ?2, 'in_progress', ?3, ?4, ?4)",
                params![title, input.description, input.is_high_priority, now],
            )
            .map_err(database_error)?;
        let id = transaction.last_insert_rowid();
        replace_tags(&transaction, id, &tags)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);
        self.get(id)?
            .ok_or_else(|| AppError::internal_error("created todo could not be reloaded"))
    }

    pub fn update(&self, id: i64, input: UpdateTodo) -> AppResult<Todo> {
        let title = normalize_title(&input.title)?;
        let tags = normalize_tags(input.tags)?;
        let now = Utc::now().timestamp_millis();
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let updated = transaction
            .execute(
                "UPDATE todos SET title = ?1, description = ?2, is_high_priority = ?3,
                    updated_at = ?4 WHERE id = ?5",
                params![title, input.description, input.is_high_priority, now, id],
            )
            .map_err(database_error)?;
        if updated == 0 {
            return Err(AppError::todo_not_found(id));
        }
        replace_tags(&transaction, id, &tags)?;
        transaction.commit().map_err(database_error)?;
        drop(connection);
        self.get(id)?.ok_or_else(|| AppError::todo_not_found(id))
    }

    pub fn set_status(&self, id: i64, status: TodoStatus) -> AppResult<Todo> {
        let now = Utc::now().timestamp_millis();
        let completed_at = (status == TodoStatus::Completed).then_some(now);
        let updated = self
            .database
            .connection()?
            .execute(
                "UPDATE todos SET status = ?1, updated_at = ?2, completed_at = ?3 WHERE id = ?4",
                params![status.as_str(), now, completed_at, id],
            )
            .map_err(database_error)?;
        if updated == 0 {
            return Err(AppError::todo_not_found(id));
        }
        self.get(id)?.ok_or_else(|| AppError::todo_not_found(id))
    }

    pub fn delete(&self, id: i64) -> AppResult<()> {
        let deleted = self
            .database
            .connection()?
            .execute("DELETE FROM todos WHERE id = ?1", [id])
            .map_err(database_error)?;
        if deleted == 0 {
            return Err(AppError::todo_not_found(id));
        }
        Ok(())
    }

    pub fn get(&self, id: i64) -> AppResult<Option<Todo>> {
        let connection = self.database.connection()?;
        let mut todo = connection.query_row(
            "SELECT id, title, description, status, is_high_priority, created_at, updated_at, completed_at
             FROM todos WHERE id = ?1", [id], todo_from_row,
        ).optional().map_err(database_error)?;
        if let Some(todo) = todo.as_mut() {
            todo.tags = tags_for_todo(&connection, id)?;
        }
        Ok(todo)
    }

    pub fn tags(&self) -> AppResult<Vec<TodoTag>> {
        let connection = self.database.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT tag.id, tag.name, count(rel.todo_id) AS todo_count
             FROM todo_tags tag
             LEFT JOIN todo_tag_relations rel ON rel.tag_id = tag.id
             GROUP BY tag.id, tag.name
             ORDER BY todo_count DESC, tag.name COLLATE NOCASE ASC",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(TodoTag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    count: row.get(2)?,
                })
            })
            .map_err(database_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
    }

    pub fn rename_tag(&self, id: i64, name: String) -> AppResult<TodoTag> {
        let name = normalize_tag(&name)?;
        let mut connection = self.database.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let old_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM todo_tags WHERE id = ?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        if !old_exists {
            return Err(AppError::todo_tag_not_found(id));
        }
        let target_id = transaction
            .query_row(
                "SELECT id FROM todo_tags WHERE name = ?1 COLLATE NOCASE",
                [&name],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(database_error)?;
        let result_id = match target_id {
            Some(target_id) if target_id != id => {
                transaction
                    .execute(
                        "INSERT OR IGNORE INTO todo_tag_relations(todo_id, tag_id)
                     SELECT todo_id, ?1 FROM todo_tag_relations WHERE tag_id = ?2",
                        params![target_id, id],
                    )
                    .map_err(database_error)?;
                transaction
                    .execute("DELETE FROM todo_tags WHERE id = ?1", [id])
                    .map_err(database_error)?;
                target_id
            }
            _ => {
                transaction
                    .execute(
                        "UPDATE todo_tags SET name = ?1 WHERE id = ?2",
                        params![name, id],
                    )
                    .map_err(database_error)?;
                id
            }
        };
        transaction.commit().map_err(database_error)?;
        drop(connection);
        self.tags()?
            .into_iter()
            .find(|tag| tag.id == result_id)
            .ok_or_else(|| AppError::internal_error("renamed tag could not be reloaded"))
    }

    pub fn delete_tag(&self, id: i64) -> AppResult<()> {
        let deleted = self
            .database
            .connection()?
            .execute("DELETE FROM todo_tags WHERE id = ?1", [id])
            .map_err(database_error)?;
        if deleted == 0 {
            return Err(AppError::todo_tag_not_found(id));
        }
        Ok(())
    }
}

fn replace_tags(transaction: &Transaction<'_>, todo_id: i64, tags: &[String]) -> AppResult<()> {
    transaction
        .execute(
            "DELETE FROM todo_tag_relations WHERE todo_id = ?1",
            [todo_id],
        )
        .map_err(database_error)?;
    for tag in tags {
        transaction
            .execute(
                "INSERT INTO todo_tags(name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
                [tag],
            )
            .map_err(database_error)?;
        let tag_id: i64 = transaction
            .query_row(
                "SELECT id FROM todo_tags WHERE name = ?1 COLLATE NOCASE",
                [tag],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO todo_tag_relations(todo_id, tag_id) VALUES (?1, ?2)",
                params![todo_id, tag_id],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn tags_for_todo(connection: &rusqlite::Connection, todo_id: i64) -> AppResult<Vec<String>> {
    let mut statement = connection
        .prepare(
            "SELECT tag.name FROM todo_tags tag JOIN todo_tag_relations rel ON rel.tag_id = tag.id
         WHERE rel.todo_id = ?1 ORDER BY tag.name COLLATE NOCASE ASC",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([todo_id], |row| row.get(0))
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn tags_for_todos(
    connection: &rusqlite::Connection,
    todo_ids: &[i64],
) -> AppResult<HashMap<i64, Vec<String>>> {
    if todo_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = std::iter::repeat_n("?", todo_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let mut statement = connection
        .prepare(&format!(
            "SELECT rel.todo_id, tag.name
             FROM todo_tag_relations rel
             JOIN todo_tags tag ON tag.id = rel.tag_id
             WHERE rel.todo_id IN ({placeholders})
             ORDER BY rel.todo_id, tag.name COLLATE NOCASE ASC"
        ))
        .map_err(database_error)?;
    let rows = statement
        .query_map(params_from_iter(todo_ids.iter()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    let mut tags = HashMap::<i64, Vec<String>>::new();
    for row in rows {
        let (todo_id, name) = row.map_err(database_error)?;
        tags.entry(todo_id).or_default().push(name);
    }
    Ok(tags)
}

fn normalize_title(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation_error("Todo title cannot be empty"));
    }
    Ok(value.to_string())
}

fn normalize_tag(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation_error("Todo tag cannot be empty"));
    }
    Ok(value.to_string())
}

fn normalize_tags(values: Vec<String>) -> AppResult<Vec<String>> {
    let mut tags = BTreeMap::<String, String>::new();
    for value in values {
        let tag = normalize_tag(&value)?;
        tags.entry(tag.to_ascii_lowercase()).or_insert(tag);
    }
    Ok(tags.into_values().collect())
}

fn todo_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
    let status_text: String = row.get(3)?;
    let status = TodoStatus::from_db(&status_text).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(3, "status".into(), rusqlite::types::Type::Text)
    })?;
    Ok(Todo {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        status,
        is_high_priority: row.get(4)?,
        tags: Vec::new(),
        created_at: timestamp(row.get(5)?)?,
        updated_at: timestamp(row.get(6)?)?,
        completed_at: row.get::<_, Option<i64>>(7)?.map(timestamp).transpose()?,
    })
}

fn timestamp(value: i64) -> rusqlite::Result<String> {
    chrono::DateTime::<Utc>::from_timestamp_millis(value)
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Secs, true))
        .ok_or_else(|| rusqlite::Error::IntegralValueOutOfRange(0, value))
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError::database_error(error.to_string())
}
