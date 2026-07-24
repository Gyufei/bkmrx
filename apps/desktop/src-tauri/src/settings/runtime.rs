use std::path::{Path, PathBuf};

use super::SystemInfo;

#[derive(Debug, Clone)]
pub struct RuntimePaths {
    app_data_dir: PathBuf,
    sqlite_db_path: PathBuf,
    settings_path: PathBuf,
    schema_version: i64,
}

impl RuntimePaths {
    pub fn new(app_data_dir: PathBuf, schema_version: i64) -> Self {
        Self {
            sqlite_db_path: app_data_dir.join("bookmarks.db"),
            settings_path: app_data_dir.join("settings.json"),
            app_data_dir,
            schema_version,
        }
    }

    pub fn settings_path(&self) -> &Path {
        &self.settings_path
    }

    pub fn system_info(&self) -> SystemInfo {
        SystemInfo {
            app_data_dir: self.app_data_dir.to_string_lossy().into_owned(),
            sqlite_db_path: self.sqlite_db_path.to_string_lossy().into_owned(),
            schema_version: self.schema_version,
            search_backend: "sqlite_fts5_trigram".to_owned(),
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
        }
    }
}
