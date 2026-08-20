use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Settings {
    pub common: CommonSettings,
    pub bookmark: BookmarkSettings,
    pub note: NoteSettings,
    pub rss: RssSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct CommonSettings {}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct BookmarkSettings {
    pub backup_dir: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct NoteSettings {
    pub notes_dir: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct RssSettings {
    pub rsshub_base_url: Option<String>,
    pub rsshub_access_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SystemInfo {
    pub app_data_dir: String,
    pub sqlite_db_path: String,
    pub schema_version: i64,
    pub search_backend: String,
    pub app_version: String,
}
