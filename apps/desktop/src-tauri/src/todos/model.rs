use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    InProgress,
    Completed,
    Suspended,
    Canceled,
}

impl TodoStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Suspended => "suspended",
            Self::Canceled => "canceled",
        }
    }

    pub(crate) fn from_db(value: &str) -> Option<Self> {
        match value {
            "in_progress" => Some(Self::InProgress),
            "completed" => Some(Self::Completed),
            "suspended" => Some(Self::Suspended),
            "canceled" => Some(Self::Canceled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: TodoStatus,
    pub is_high_priority: bool,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TodoTag {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TodoQuery {
    pub status: Option<TodoStatus>,
    pub tag_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TodoList {
    pub items: Vec<Todo>,
    pub total: i64,
    pub completed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateTodo {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_high_priority: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateTodo {
    pub title: String,
    pub description: String,
    pub is_high_priority: bool,
    pub tags: Vec<String>,
}
