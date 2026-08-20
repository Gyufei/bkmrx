use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedFeed {
    pub title: String,
    pub site_url: Option<String>,
    pub entries: Vec<ParsedEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedEntry {
    pub dedupe_key: String,
    pub guid: Option<String>,
    pub title: String,
    pub link: Option<String>,
    pub author: Option<String>,
    pub content_html: String,
    pub summary: String,
    pub published_at: Option<i64>,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeedCandidate {
    pub title: Option<String>,
    pub feed_url: String,
    pub site_url: Option<String>,
    pub recent_entries: Vec<FeedPreviewEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeedPreviewEntry {
    pub title: String,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeedPreview {
    pub source_url: String,
    pub candidates: Vec<FeedCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RssFeed {
    pub id: i64,
    pub source_url: String,
    pub feed_url: String,
    pub site_url: Option<String>,
    pub title: String,
    pub custom_title: Option<String>,
    pub entry_count: u32,
    pub unread_count: u32,
    pub last_successful_fetched_at: Option<i64>,
    pub last_failed_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl RssFeed {
    pub fn display_title(&self) -> &str {
        self.custom_title.as_deref().unwrap_or(&self.title)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RssEntry {
    pub id: i64,
    pub feed_id: i64,
    pub feed_title: String,
    pub title: String,
    pub link: Option<String>,
    pub author: Option<String>,
    pub content_html: String,
    pub summary: String,
    pub published_at: Option<i64>,
    pub fetched_at: i64,
    pub is_read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case", tag = "mode")]
pub enum EntryQueryScope {
    All,
    Unread,
    Feed { feed_id: i64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntryPage {
    pub entries: Vec<RssEntry>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntryPageRequest {
    pub scope: EntryQueryScope,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateFeed {
    pub source_url: String,
    pub feed_url: String,
    pub custom_title: Option<String>,
}
