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
    pub starred_at: Option<String>,
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
    #[serde(default)]
    pub starred_only: bool,
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
#[serde(deny_unknown_fields)]
pub struct BookmarkExportV1 {
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub bookmarks: Vec<BookmarkTransferRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct BookmarkTransferRecord {
    pub url: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub access_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub accessed_at: Option<String>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub starred_at: Option<Option<String>>,
}

fn deserialize_present_nullable<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportPreview {
    pub file_hash: String,
    pub total: usize,
    pub create_count: usize,
    pub update_count: usize,
    pub skip_count: usize,
}
