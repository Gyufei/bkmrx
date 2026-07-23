use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Bookmark {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub access_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub accessed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagSummary {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkPageRequest {
    pub query: String,
    pub tags: Vec<String>,
    pub cursor: Option<String>,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkPage {
    pub items: Vec<Bookmark>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateBookmark {
    pub url: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateBookmark {
    pub url: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, thiserror::Error)]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn validation_error(message: impl Into<String>) -> Self {
        Self::new("validation_error", message, None)
    }

    pub fn invalid_cursor() -> Self {
        Self::new("invalid_cursor", "The pagination cursor is invalid", None)
    }

    pub fn bookmark_not_found(id: i64) -> Self {
        Self::new(
            "bookmark_not_found",
            "Bookmark not found",
            Some(serde_json::json!({ "id": id })),
        )
    }

    pub fn bookmark_url_conflict(url: impl Into<String>) -> Self {
        Self::new(
            "bookmark_url_conflict",
            "A bookmark with this URL already exists",
            Some(serde_json::json!({ "url": url.into() })),
        )
    }

    pub fn unsupported_import_format(version: u64) -> Self {
        Self::new(
            "unsupported_import_format",
            "The bookmark import format is not supported",
            Some(serde_json::json!({ "format_version": version })),
        )
    }

    pub fn import_validation_failed(message: impl Into<String>) -> Self {
        Self::new("import_validation_failed", message, None)
    }

    pub fn database_error(message: impl Into<String>) -> Self {
        Self::new("database_error", message, None)
    }

    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::new("internal_error", message, None)
    }

    pub fn unsupported_schema_version(found: i64, supported: i64) -> Self {
        Self::new(
            "unsupported_schema_version",
            "The database schema is newer than this app supports",
            Some(serde_json::json!({
                "found": found,
                "supported": supported,
            })),
        )
    }

    fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        details: Option<serde_json::Value>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details,
        }
    }
}
