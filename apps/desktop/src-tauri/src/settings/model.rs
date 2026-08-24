use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Settings {
    pub common: CommonSettings,
    pub services: ServiceSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct CommonSettings {
    pub paths: PathSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct PathSettings {
    pub bookmark_export_dir: Option<String>,
    pub todo_export_dir: Option<String>,
    pub notes_dir: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ServiceSettings {
    pub rsshub: RssHubSettings,
    pub niutrans: NiuTransSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct RssHubSettings {
    pub base_url: Option<String>,
    pub access_key: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct NiuTransSettings {
    pub app_id: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SystemInfo {
    pub app_data_dir: String,
    pub sqlite_db_path: String,
    pub schema_version: i64,
    pub search_backend: String,
    pub app_version: String,
}
