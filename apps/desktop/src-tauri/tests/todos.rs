use std::sync::Arc;

use bkmrx_lib::{
    database::Database,
    todos::{CreateTodo, SqliteTodoRepository, TodoQuery, TodoService, TodoStatus, UpdateTodo},
};

fn repository() -> SqliteTodoRepository {
    SqliteTodoRepository::new(Arc::new(Database::open_in_memory().unwrap()))
}

fn create(repository: &SqliteTodoRepository, title: &str, tags: &[&str]) -> i64 {
    repository
        .create(CreateTodo {
            title: title.into(),
            description: "detail".into(),
            is_high_priority: false,
            tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
        })
        .unwrap()
        .id
}

#[test]
fn creates_updates_and_physically_deletes_while_retaining_tags() {
    let repository = repository();
    let id = create(
        &repository,
        "  first task  ",
        &["Work", "work", " Personal "],
    );
    let todo = repository.get(id).unwrap().unwrap();
    assert_eq!(todo.title, "first task");
    assert_eq!(todo.tags, vec!["Personal", "Work"]);
    assert_eq!(todo.status, TodoStatus::InProgress);

    let updated = repository
        .update(
            id,
            UpdateTodo {
                title: "first task".into(),
                description: "updated".into(),
                is_high_priority: true,
                tags: vec!["Work".into()],
            },
        )
        .unwrap();
    assert!(updated.is_high_priority);

    repository.delete(id).unwrap();
    assert!(repository.get(id).unwrap().is_none());
    assert_eq!(repository.tags().unwrap().len(), 2);
    assert!(repository.tags().unwrap().iter().all(|tag| tag.count == 0));
}

#[test]
fn status_transitions_manage_completed_at() {
    let repository = repository();
    let id = create(&repository, "task", &[]);
    assert!(repository
        .set_status(id, TodoStatus::Completed)
        .unwrap()
        .completed_at
        .is_some());
    assert!(repository
        .set_status(id, TodoStatus::Suspended)
        .unwrap()
        .completed_at
        .is_none());
    assert_eq!(
        repository
            .set_status(id, TodoStatus::InProgress)
            .unwrap()
            .status,
        TodoStatus::InProgress
    );
}

#[test]
fn tag_rename_merges_relations_and_delete_keeps_todos() {
    let repository = repository();
    let first = create(&repository, "first", &["Work"]);
    let second = create(&repository, "second", &["Personal"]);
    let tags = repository.tags().unwrap();
    let work_id = tags.iter().find(|tag| tag.name == "Work").unwrap().id;
    let personal_id = tags.iter().find(|tag| tag.name == "Personal").unwrap().id;

    let merged = repository.rename_tag(personal_id, "work".into()).unwrap();
    assert_eq!(merged.id, work_id);
    assert_eq!(merged.count, 2);
    repository.delete_tag(work_id).unwrap();
    assert!(repository.get(first).unwrap().unwrap().tags.is_empty());
    assert!(repository.get(second).unwrap().unwrap().tags.is_empty());
}

#[test]
fn archive_delete_removes_tag_and_its_todos_but_keeps_others() {
    let repository = repository();
    let finished = create(&repository, "finished", &["Work"]);
    repository
        .set_status(finished, TodoStatus::Completed)
        .unwrap();
    let suspended = create(&repository, "suspended", &["Work"]);
    repository
        .set_status(suspended, TodoStatus::Suspended)
        .unwrap();
    let canceled = create(&repository, "canceled", &["Work"]);
    repository
        .set_status(canceled, TodoStatus::Canceled)
        .unwrap();
    let shared = create(&repository, "shared", &["Work", "Personal"]);
    repository.set_status(shared, TodoStatus::Canceled).unwrap();
    let kept = create(&repository, "kept", &["Personal"]);
    let tags = repository.tags().unwrap();
    let work_id = tags.iter().find(|tag| tag.name == "Work").unwrap().id;
    let personal_id = tags.iter().find(|tag| tag.name == "Personal").unwrap().id;

    repository.archive_delete_tag(work_id).unwrap();

    assert!(repository.tags().unwrap().iter().all(|tag| tag.id != work_id));
    assert!(repository.get(finished).unwrap().is_none());
    assert!(repository.get(suspended).unwrap().is_none());
    assert!(repository.get(canceled).unwrap().is_none());
    assert!(repository.get(shared).unwrap().is_none());
    let kept_todo = repository.get(kept).unwrap().unwrap();
    assert_eq!(kept_todo.tags, vec!["Personal"]);
    assert!(repository.tags().unwrap().iter().any(|tag| tag.id == personal_id));
}

#[test]
fn archive_delete_is_rejected_while_a_todo_is_in_progress() {
    let repository = repository();
    create(&repository, "active", &["Work"]);
    let done = create(&repository, "done", &["Work"]);
    repository.set_status(done, TodoStatus::Completed).unwrap();
    let work_id = repository
        .tags()
        .unwrap()
        .iter()
        .find(|tag| tag.name == "Work")
        .unwrap()
        .id;

    let error = repository.archive_delete_tag(work_id).unwrap_err();
    assert_eq!(error.code(), "todo_tag_has_active_todos");
    assert!(repository.tags().unwrap().iter().any(|tag| tag.id == work_id));
    assert_eq!(
        repository
            .query(&TodoQuery {
                status: None,
                tag_id: Some(work_id),
            })
            .unwrap()
            .total,
        2
    );
}

#[test]
fn archive_delete_returns_not_found_for_missing_tag() {
    let repository = repository();
    let error = repository.archive_delete_tag(42).unwrap_err();
    assert_eq!(error.code(), "todo_tag_not_found");
}

#[test]
fn combines_tag_and_status_filters_with_range_statistics() {
    let repository = repository();
    let completed = create(&repository, "normal", &["Work"]);
    let important = create(&repository, "important", &["Work"]);
    repository
        .update(
            important,
            UpdateTodo {
                title: "important".into(),
                description: String::new(),
                is_high_priority: true,
                tags: vec!["Work".into()],
            },
        )
        .unwrap();
    repository
        .set_status(completed, TodoStatus::Completed)
        .unwrap();
    let tag_id = repository.tags().unwrap()[0].id;

    let list = repository
        .query(&TodoQuery {
            status: Some(TodoStatus::InProgress),
            tag_id: Some(tag_id),
        })
        .unwrap();
    assert_eq!(
        list.items.iter().map(|todo| todo.id).collect::<Vec<_>>(),
        vec![important]
    );
    assert_eq!((list.total, list.completed), (2, 1));
}

#[test]
fn export_writes_markdown_for_all_statuses() {
    let repository = repository();
    create(&repository, "todo1", &["Work"]);
    let completed = create(&repository, "todo2", &["Work"]);
    repository
        .set_status(completed, TodoStatus::Completed)
        .unwrap();
    let suspended = create(&repository, "todo3", &["Work"]);
    repository
        .set_status(suspended, TodoStatus::Suspended)
        .unwrap();
    let canceled = create(&repository, "todo4", &["Work"]);
    repository
        .set_status(canceled, TodoStatus::Canceled)
        .unwrap();
    let tag_id = work_tag_id(&repository);
    let service = TodoService::new(repository);
    let directory = export_directory();
    let path = directory.join("2026-08-24-待办-工作.md");
    let written = service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap();
    assert_eq!(written, path);

    let content = std::fs::read_to_string(&path).unwrap();
    let lines = content.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 4);
    assert_eq!(lines[0], "- [ ] todo1");
    assert_eq!(lines[1], "已挂起: todo3");
    assert!(lines[2].starts_with("- [x] todo2 ✅ "));
    assert_eq!(lines[3], "已取消: ~~todo4~~");

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_empty_tag_produces_an_empty_file() {
    let repository = repository();
    let id = create(&repository, "disposable", &["Empty"]);
    repository.delete(id).unwrap();
    let tag_id = repository
        .tags()
        .unwrap()
        .into_iter()
        .find(|tag| tag.name == "Empty")
        .unwrap()
        .id;
    let service = TodoService::new(repository);
    let directory = export_directory();
    let path = directory.join("empty.md");
    service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert!(content.trim().is_empty());

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_omits_the_date_when_completed_at_is_missing() {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let repository = SqliteTodoRepository::new(Arc::clone(&database));
    let id = create(&repository, "legacy", &["Work"]);
    repository.set_status(id, TodoStatus::Completed).unwrap();
    database
        .execute_batch_for_test(&format!("UPDATE todos SET completed_at = NULL WHERE id = {id}"))
        .unwrap();
    let tag_id = work_tag_id(&repository);
    let service = TodoService::new(repository);
    let directory = export_directory();
    let path = directory.join("legacy.md");
    service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, "- [x] legacy\n");

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_collapses_newlines_in_titles() {
    let repository = repository();
    create(&repository, "line one\nline two", &["Work"]);
    let tag_id = work_tag_id(&repository);
    let service = TodoService::new(repository);
    let directory = export_directory();
    let path = directory.join("multiline.md");
    service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, "- [ ] line one line two\n");

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_orders_high_priority_first_within_status() {
    let repository = repository();
    create(&repository, "normal", &["Work"]);
    let important = create(&repository, "important", &["Work"]);
    repository
        .update(
            important,
            UpdateTodo {
                title: "important".into(),
                description: String::new(),
                is_high_priority: true,
                tags: vec!["Work".into()],
            },
        )
        .unwrap();
    let tag_id = work_tag_id(&repository);
    let service = TodoService::new(repository);
    let directory = export_directory();
    let path = directory.join("order.md");
    service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, "- [ ] important\n- [ ] normal\n");

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_leaves_no_temp_file_when_write_fails() {
    let repository = repository();
    create(&repository, "task", &["Work"]);
    let tag_id = work_tag_id(&repository);
    let service = TodoService::new(repository);
    let directory = export_directory();
    let blocked = directory.join("blocked.md");
    std::fs::create_dir_all(&blocked).unwrap();
    assert!(service
        .export_todos(blocked.to_string_lossy().into_owned(), Some(tag_id))
        .is_err());

    let leftovers = std::fs::read_dir(&directory)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
        .count();
    assert_eq!(leftovers, 0);

    std::fs::remove_dir_all(&directory).ok();
}

fn work_tag_id(repository: &SqliteTodoRepository) -> i64 {
    repository
        .tags()
        .unwrap()
        .into_iter()
        .find(|tag| tag.name == "Work")
        .unwrap()
        .id
}

fn export_directory() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "bkmrx-todo-export-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ))
}
