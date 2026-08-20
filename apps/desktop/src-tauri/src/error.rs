use serde::{Deserialize, Serialize};

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

    pub fn bookmark_url_not_found(url: impl Into<String>) -> Self {
        Self::new(
            "bookmark_not_found",
            "Bookmark not found",
            Some(serde_json::json!({ "url": url.into() })),
        )
    }

    pub fn bookmark_url_conflict(url: impl Into<String>) -> Self {
        Self::new(
            "bookmark_url_conflict",
            "A bookmark with this URL already exists",
            Some(serde_json::json!({ "url": url.into() })),
        )
    }

    pub fn todo_not_found(id: i64) -> Self {
        Self::new(
            "todo_not_found",
            "Todo not found",
            Some(serde_json::json!({ "id": id })),
        )
    }

    pub fn todo_tag_not_found(id: i64) -> Self {
        Self::new(
            "todo_tag_not_found",
            "Todo tag not found",
            Some(serde_json::json!({ "id": id })),
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
            "The database schema version is not supported by this app",
            Some(serde_json::json!({
                "found": found,
                "supported": supported,
            })),
        )
    }

    pub fn note_error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, message, None)
    }

    pub fn settings_error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, message, None)
    }

    pub fn rss_error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, message, None)
    }

    pub fn rss_feed_conflict(id: i64) -> Self {
        Self::new(
            "rss_feed_conflict",
            "This RSS subscription already exists",
            Some(serde_json::json!({ "id": id })),
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

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn keeps_wire_contract() {
        assert_eq!(
            serde_json::to_value(AppError::bookmark_not_found(7)).unwrap(),
            serde_json::json!({
                "code": "bookmark_not_found",
                "message": "Bookmark not found",
                "details": { "id": 7 }
            })
        );
    }
}
