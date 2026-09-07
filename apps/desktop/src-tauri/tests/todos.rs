use std::sync::Arc;

#[test]
fn mutations_notify_once_after_commit_and_reads_and_exports_do_not_notify() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let database = Arc::new(Database::open_in_memory().unwrap());
    let notifications = Arc::new(AtomicUsize::new(0));
    let observed = Arc::clone(&notifications);
    let read_store = TodoStore::new(Arc::clone(&database));
    let store = TodoStore::new(database).with_change_notifier(Arc::new(move || {
        // A reentrant read proves notification runs after the database lock is released.
        read_store
            .query(TodoQuery {
                status: None,
                tag_id: None,
            })
            .unwrap();
        observed.fetch_add(1, Ordering::SeqCst);
    }));
    let id = create(&store, "task", &["Work"]);
    let tag = store.tags().unwrap()[0].id;
    assert_eq!(notifications.load(Ordering::SeqCst), 1);
    assert!(store.archive_delete_tag(tag).is_err());
    assert!(store.delete(-1).is_err());
    assert_eq!(notifications.load(Ordering::SeqCst), 1);
    store
        .update(
            id,
            UpdateTodo {
                title: "edited".into(),
                description: String::new(),
                is_high_priority: true,
                tags: vec!["Work".into()],
            },
        )
        .unwrap();
    store.set_status(id, TodoStatus::Completed).unwrap();
    store.rename_tag(tag, "Renamed".into()).unwrap();
    assert_eq!(notifications.load(Ordering::SeqCst), 4);
    let directory = tempfile::tempdir().unwrap();
    store
        .export_todos(directory.path().join("todos.md"), Some(tag))
        .unwrap();
    assert!(store.export_todos(directory.path(), Some(tag)).is_err());
    assert_eq!(notifications.load(Ordering::SeqCst), 4);
    store.archive_delete_tag(tag).unwrap();
    assert_eq!(notifications.load(Ordering::SeqCst), 5);
    assert!(find(&store, id).is_none());
    let next = create(&store, "next", &["Other"]);
    let other = store.tags().unwrap()[0].id;
    store.delete_tag(other).unwrap();
    store.delete(next).unwrap();
    assert_eq!(notifications.load(Ordering::SeqCst), 8);
}

#[test]
fn failed_result_hydration_rolls_back_the_mutation_and_emits_no_event() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let database = Arc::new(Database::open_in_memory().unwrap());
    let notifications = Arc::new(AtomicUsize::new(0));
    let observed = Arc::clone(&notifications);
    let store = TodoStore::new(Arc::clone(&database)).with_change_notifier(Arc::new(move || {
        observed.fetch_add(1, Ordering::SeqCst);
    }));
    let id = create(&store, "original", &["Work"]);
    database
        .execute_batch_for_test(
            "CREATE TRIGGER corrupt_todo_timestamp AFTER UPDATE ON todos
         BEGIN UPDATE todos SET updated_at = 9223372036854775807 WHERE id = NEW.id; END;",
        )
        .unwrap();
    assert!(store
        .update(
            id,
            UpdateTodo {
                title: "changed".into(),
                description: String::new(),
                is_high_priority: false,
                tags: vec!["New".into()]
            }
        )
        .is_err());
    assert!(store.set_status(id, TodoStatus::Completed).is_err());
    let todo = find(&store, id).unwrap();
    assert_eq!(todo.title, "original");
    assert_eq!(todo.tags, vec!["Work"]);
    assert_eq!(todo.status, TodoStatus::InProgress);
    assert_eq!(notifications.load(Ordering::SeqCst), 1);
    database
        .execute_batch_for_test(
            "CREATE TRIGGER corrupt_new_todo AFTER INSERT ON todos
         BEGIN UPDATE todos SET updated_at = 9223372036854775807 WHERE id = NEW.id; END;",
        )
        .unwrap();
    assert!(store
        .create(CreateTodo {
            title: "invalid".into(),
            description: String::new(),
            is_high_priority: false,
            tags: vec!["New".into()]
        })
        .is_err());
    assert_eq!(
        store
            .query(TodoQuery {
                status: None,
                tag_id: None
            })
            .unwrap()
            .total,
        1
    );
    assert_eq!(store.tags().unwrap().len(), 1);
    assert_eq!(notifications.load(Ordering::SeqCst), 1);
}

use bkmrx_lib::{
    database::Database,
    todos::{CreateTodo, TodoQuery, TodoStatus, TodoStore, UpdateTodo},
};

fn store() -> TodoStore {
    TodoStore::new(Arc::new(Database::open_in_memory().unwrap()))
}

fn create(store: &TodoStore, title: &str, tags: &[&str]) -> i64 {
    store
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
    let store = store();
    let id = create(&store, "  first task  ", &["Work", "work", " Personal "]);
    let todo = find(&store, id).unwrap();
    assert_eq!(todo.title, "first task");
    assert_eq!(todo.tags, vec!["Personal", "Work"]);
    assert_eq!(todo.status, TodoStatus::InProgress);

    let updated = store
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

    store.delete(id).unwrap();
    assert!(find(&store, id).is_none());
    assert_eq!(store.tags().unwrap().len(), 2);
    assert!(store.tags().unwrap().iter().all(|tag| tag.count == 0));
}

#[test]
fn status_transitions_manage_completed_at() {
    let store = store();
    let id = create(&store, "task", &[]);
    assert!(store
        .set_status(id, TodoStatus::Completed)
        .unwrap()
        .completed_at
        .is_some());
    assert!(store
        .set_status(id, TodoStatus::Suspended)
        .unwrap()
        .completed_at
        .is_none());
    assert_eq!(
        store.set_status(id, TodoStatus::InProgress).unwrap().status,
        TodoStatus::InProgress
    );
}

#[test]
fn tag_rename_merges_relations_and_delete_keeps_todos() {
    let store = store();
    let first = create(&store, "first", &["Work"]);
    let second = create(&store, "second", &["Personal"]);
    let tags = store.tags().unwrap();
    let work_id = tags.iter().find(|tag| tag.name == "Work").unwrap().id;
    let personal_id = tags.iter().find(|tag| tag.name == "Personal").unwrap().id;

    let merged = store.rename_tag(personal_id, "work".into()).unwrap();
    assert_eq!(merged.id, work_id);
    assert_eq!(merged.count, 2);
    store.delete_tag(work_id).unwrap();
    assert!(find(&store, first).unwrap().tags.is_empty());
    assert!(find(&store, second).unwrap().tags.is_empty());
}

#[test]
fn archive_delete_removes_tag_and_its_todos_but_keeps_others() {
    let store = store();
    let finished = create(&store, "finished", &["Work"]);
    store.set_status(finished, TodoStatus::Completed).unwrap();
    let suspended = create(&store, "suspended", &["Work"]);
    store.set_status(suspended, TodoStatus::Suspended).unwrap();
    let canceled = create(&store, "canceled", &["Work"]);
    store.set_status(canceled, TodoStatus::Canceled).unwrap();
    let shared = create(&store, "shared", &["Work", "Personal"]);
    store.set_status(shared, TodoStatus::Canceled).unwrap();
    let kept = create(&store, "kept", &["Personal"]);
    let tags = store.tags().unwrap();
    let work_id = tags.iter().find(|tag| tag.name == "Work").unwrap().id;
    let personal_id = tags.iter().find(|tag| tag.name == "Personal").unwrap().id;

    store.archive_delete_tag(work_id).unwrap();

    assert!(store.tags().unwrap().iter().all(|tag| tag.id != work_id));
    assert!(find(&store, finished).is_none());
    assert!(find(&store, suspended).is_none());
    assert!(find(&store, canceled).is_none());
    assert!(find(&store, shared).is_none());
    let kept_todo = find(&store, kept).unwrap();
    assert_eq!(kept_todo.tags, vec!["Personal"]);
    assert!(store
        .tags()
        .unwrap()
        .iter()
        .any(|tag| tag.id == personal_id));
}

#[test]
fn archive_delete_is_rejected_while_a_todo_is_in_progress() {
    let store = store();
    create(&store, "active", &["Work"]);
    let done = create(&store, "done", &["Work"]);
    store.set_status(done, TodoStatus::Completed).unwrap();
    let work_id = store
        .tags()
        .unwrap()
        .iter()
        .find(|tag| tag.name == "Work")
        .unwrap()
        .id;

    let error = store.archive_delete_tag(work_id).unwrap_err();
    assert_eq!(error.code(), "todo_tag_has_active_todos");
    assert!(store.tags().unwrap().iter().any(|tag| tag.id == work_id));
    assert_eq!(
        store
            .query(TodoQuery {
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
    let store = store();
    let error = store.archive_delete_tag(42).unwrap_err();
    assert_eq!(error.code(), "todo_tag_not_found");
}

#[test]
fn combines_tag_and_status_filters_with_range_statistics() {
    let store = store();
    let completed = create(&store, "normal", &["Work"]);
    let important = create(&store, "important", &["Work"]);
    store
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
    store.set_status(completed, TodoStatus::Completed).unwrap();
    let tag_id = store.tags().unwrap()[0].id;

    let list = store
        .query(TodoQuery {
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
    let store = store();
    create(&store, "todo1", &["Work"]);
    let completed = create(&store, "todo2", &["Work"]);
    store.set_status(completed, TodoStatus::Completed).unwrap();
    let suspended = create(&store, "todo3", &["Work"]);
    store.set_status(suspended, TodoStatus::Suspended).unwrap();
    let canceled = create(&store, "todo4", &["Work"]);
    store.set_status(canceled, TodoStatus::Canceled).unwrap();
    let tag_id = work_tag_id(&store);
    let service = store;
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
fn export_empty_tag_is_rejected_without_creating_a_file() {
    let store = store();
    let id = create(&store, "disposable", &["Empty"]);
    store.delete(id).unwrap();
    let tag_id = store
        .tags()
        .unwrap()
        .into_iter()
        .find(|tag| tag.name == "Empty")
        .unwrap()
        .id;
    let service = store;
    let directory = export_directory();
    let path = directory.join("empty.md");
    let error = service
        .export_todos(path.to_string_lossy().into_owned(), Some(tag_id))
        .unwrap_err();

    assert_eq!(error.code(), "todo_export_empty");
    assert!(!path.exists());

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn export_omits_the_date_when_completed_at_is_missing() {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let store = TodoStore::new(Arc::clone(&database));
    let id = create(&store, "legacy", &["Work"]);
    store.set_status(id, TodoStatus::Completed).unwrap();
    database
        .execute_batch_for_test(&format!(
            "UPDATE todos SET completed_at = NULL WHERE id = {id}"
        ))
        .unwrap();
    let tag_id = work_tag_id(&store);
    let service = store;
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
    let store = store();
    create(&store, "line one\nline two", &["Work"]);
    let tag_id = work_tag_id(&store);
    let service = store;
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
    let store = store();
    create(&store, "normal", &["Work"]);
    let important = create(&store, "important", &["Work"]);
    store
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
    let tag_id = work_tag_id(&store);
    let service = store;
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
    let store = store();
    create(&store, "task", &["Work"]);
    let tag_id = work_tag_id(&store);
    let service = store;
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

fn work_tag_id(store: &TodoStore) -> i64 {
    store
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

fn find(store: &TodoStore, id: i64) -> Option<bkmrx_lib::todos::Todo> {
    store
        .query(TodoQuery {
            status: None,
            tag_id: None,
        })
        .unwrap()
        .items
        .into_iter()
        .find(|todo| todo.id == id)
}
