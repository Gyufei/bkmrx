use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::bookmarks::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub backup_dir: Option<String>,
    pub notes_dir: Option<String>,
}

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SystemInfo {
    pub app_data_dir: String,
    pub sqlite_db_path: String,
    pub schema_version: i64,
    pub search_backend: String,
    pub app_version: String,
}

pub fn load(path: &Path) -> AppResult<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let json = std::fs::read(path).map_err(file_error)?;
    serde_json::from_slice(&json)
        .map_err(|error| AppError::internal_error(format!("failed to parse settings: {error}")))
}

pub fn save(path: &Path, settings: &Settings) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(file_error)?;
    }
    let json = serde_json::to_vec_pretty(settings).map_err(|error| {
        AppError::internal_error(format!("failed to serialize settings: {error}"))
    })?;
    std::fs::write(path, json).map_err(file_error)
}

fn file_error(error: std::io::Error) -> AppError {
    AppError::internal_error(error.to_string())
}
