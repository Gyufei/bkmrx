use std::sync::Arc;

use bkmrx_lib::{
    database::Database,
    todos::{CreateTodo, SqliteTodoRepository, TodoQuery, TodoStatus, UpdateTodo},
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
