use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::error::{AppError, AppResult};

use super::Settings;

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn load(path: &Path) -> AppResult<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let json = std::fs::read(path).map_err(settings_io_error)?;
    let value: serde_json::Value = serde_json::from_slice(&json).map_err(|error| {
        AppError::settings_error(
            "settings_invalid",
            format!("failed to parse settings: {error}"),
        )
    })?;
    serde_json::from_value(value).map_err(|error| {
        AppError::settings_error(
            "settings_invalid",
            format!("failed to parse settings: {error}"),
        )
    })
}

pub fn save(path: &Path, settings: &Settings) -> AppResult<()> {
    validate(settings)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(settings_io_error)?;
    }
    let json = serde_json::to_vec_pretty(settings).map_err(|error| {
        AppError::settings_error(
            "settings_serialize_error",
            format!("failed to serialize settings: {error}"),
        )
    })?;
    let (mut file, temp_path) = create_temp_file(path).map_err(settings_io_error)?;
    let result = (|| -> AppResult<()> {
        file.write_all(&json).map_err(settings_io_error)?;
        file.sync_all().map_err(settings_io_error)?;
        std::fs::rename(&temp_path, path).map_err(settings_io_error)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

fn validate(settings: &Settings) -> AppResult<()> {
    let Some(raw_url) = settings.rss.rsshub_base_url.as_deref() else {
        return Ok(());
    };
    let url = url::Url::parse(raw_url).map_err(|_| invalid_rsshub_url())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid_rsshub_url());
    }
    Ok(())
}

fn invalid_rsshub_url() -> AppError {
    AppError::settings_error(
        "settings_invalid_rsshub_url",
        "RSSHub service URL must be an HTTP(S) origin without credentials, query, or fragment",
    )
}

fn create_temp_file(path: &Path) -> std::io::Result<(File, PathBuf)> {
    loop {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp_path = path.with_extension(format!("json.tmp-{}-{counter}", std::process::id()));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((file, temp_path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
}

fn settings_io_error(error: std::io::Error) -> AppError {
    AppError::settings_error("settings_io_error", error.to_string())
}
