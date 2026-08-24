use std::path::{Path, PathBuf};

use chrono::{DateTime, Local};

use crate::error::AppResult;

use super::{Todo, TodoStatus};

pub(crate) fn export_todos(items: Vec<Todo>, destination: &Path) -> AppResult<PathBuf> {
    let content = markdown_for_todos(items);
    crate::fsutil::write_atomically(destination, content.as_bytes())?;
    Ok(destination.to_owned())
}

fn markdown_for_todos(items: Vec<Todo>) -> String {
    let lines = items.iter().map(markdown_line).collect::<Vec<_>>();
    lines.join("\n") + "\n"
}

fn markdown_line(todo: &Todo) -> String {
    let title = todo.title.replace(['\r', '\n'], " ");
    match todo.status {
        TodoStatus::InProgress => format!("- [ ] {title}"),
        TodoStatus::Completed => match completed_date(todo) {
            Some(date) => format!("- [x] {title} ✅ {date}"),
            None => format!("- [x] {title}"),
        },
        TodoStatus::Suspended => format!("已挂起: {title}"),
        TodoStatus::Canceled => format!("已取消: ~~{title}~~"),
    }
}

fn completed_date(todo: &Todo) -> Option<String> {
    let value = todo.completed_at.as_deref()?;
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Local).format("%Y-%m-%d").to_string())
}
