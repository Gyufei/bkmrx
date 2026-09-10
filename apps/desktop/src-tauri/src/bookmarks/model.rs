use serde::{Deserialize, Serialize};

use crate::identity::BookmarkId;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Bookmark {
    pub id: BookmarkId,
    pub url: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub access_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub accessed_at: Option<String>,
    pub starred_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagSummary {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagQueryRequest {
    #[serde(default)]
    pub query: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum BookmarkPageRequest {
    Browse {
        #[serde(default)]
        starred: bool,
        cursor: Option<String>,
        page_size: u32,
    },
    Search {
        #[serde(default)]
        query: String,
        #[serde(default)]
        tags: Vec<String>,
        cursor: Option<String>,
        page_size: u32,
    },
    Random {
        limit: u32,
    },
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkInitializationStatus {
    pub can_initialize: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BookmarkInitializationResult {
    pub bookmark_count: usize,
    pub navigation_category_count: usize,
}
