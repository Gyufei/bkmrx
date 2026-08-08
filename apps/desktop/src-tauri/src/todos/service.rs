use std::sync::Arc;

use crate::error::AppResult;

use super::{
    CreateTodo, SqliteTodoRepository, Todo, TodoList, TodoQuery, TodoStatus, TodoTag, UpdateTodo,
};

type ChangeNotifier = Arc<dyn Fn() + Send + Sync>;

pub struct TodoService {
    repository: SqliteTodoRepository,
    notify_changed: ChangeNotifier,
}

impl TodoService {
    pub fn new(repository: SqliteTodoRepository) -> Self {
        Self {
            repository,
            notify_changed: Arc::new(|| {}),
        }
    }

    pub fn with_change_notifier(mut self, notifier: ChangeNotifier) -> Self {
        self.notify_changed = notifier;
        self
    }

    pub fn query(&self, request: TodoQuery) -> AppResult<TodoList> {
        self.repository.query(&request)
    }
    pub fn tags(&self) -> AppResult<Vec<TodoTag>> {
        self.repository.tags()
    }
    pub fn create(&self, input: CreateTodo) -> AppResult<Todo> {
        self.changed(self.repository.create(input))
    }
    pub fn update(&self, id: i64, input: UpdateTodo) -> AppResult<Todo> {
        self.changed(self.repository.update(id, input))
    }
    pub fn set_status(&self, id: i64, status: TodoStatus) -> AppResult<Todo> {
        self.changed(self.repository.set_status(id, status))
    }
    pub fn delete(&self, id: i64) -> AppResult<()> {
        self.changed(self.repository.delete(id))
    }
    pub fn rename_tag(&self, id: i64, name: String) -> AppResult<TodoTag> {
        self.changed(self.repository.rename_tag(id, name))
    }
    pub fn delete_tag(&self, id: i64) -> AppResult<()> {
        self.changed(self.repository.delete_tag(id))
    }

    fn changed<T>(&self, result: AppResult<T>) -> AppResult<T> {
        if result.is_ok() {
            (self.notify_changed)();
        }
        result
    }
}

pub type SharedTodoService = Arc<TodoService>;
