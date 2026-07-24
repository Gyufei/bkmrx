use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub backup_dir: Option<String>,
    pub notes_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SystemInfo {
    pub app_data_dir: String,
    pub sqlite_db_path: String,
    pub schema_version: i64,
    pub search_backend: String,
    pub app_version: String,
}
