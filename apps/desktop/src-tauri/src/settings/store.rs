use std::{
    fs::File,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::{AppError, AppResult};

use super::Settings;

pub fn load(path: &Path) -> AppResult<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let json = std::fs::read(path).map_err(settings_io_error)?;
    serde_json::from_slice(&json).map_err(|error| {
        AppError::settings_error("settings_invalid", format!("failed to parse settings: {error}"))
    })
}

pub fn save(path: &Path, settings: &Settings) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(settings_io_error)?;
    }
    let json = serde_json::to_vec_pretty(settings).map_err(|error| {
        AppError::settings_error(
            "settings_serialize_error",
            format!("failed to serialize settings: {error}"),
        )
    })?;
    let temp_path = temp_path(path);
    let result = (|| -> AppResult<()> {
        let mut file = File::create(&temp_path).map_err(settings_io_error)?;
        file.write_all(&json).map_err(settings_io_error)?;
        file.sync_all().map_err(settings_io_error)?;
        std::fs::rename(&temp_path, path).map_err(settings_io_error)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

fn temp_path(path: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    path.with_extension(format!("json.tmp-{}-{nonce}", std::process::id()))
}

fn settings_io_error(error: std::io::Error) -> AppError {
    AppError::settings_error("settings_io_error", error.to_string())
}
