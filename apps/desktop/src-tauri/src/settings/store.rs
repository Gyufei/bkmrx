use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::error::{AppError, AppResult};

use super::{Settings, SETTINGS_SCHEMA_VERSION};

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn load(path: &Path) -> AppResult<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let json = std::fs::read(path).map_err(settings_io_error)?;
    let mut value: serde_json::Value = serde_json::from_slice(&json).map_err(|error| {
        AppError::settings_error(
            "settings_invalid",
            format!("failed to parse settings: {error}"),
        )
    })?;
    let legacy = value
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default()
        == 0;
    if legacy && value.get("providers").is_none() {
        let niutrans = value
            .pointer("/services/niutrans")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        value["providers"] = serde_json::json!({ "niutrans": niutrans });
    }
    let mut settings: Settings = serde_json::from_value(value).map_err(|error| {
        AppError::settings_error(
            "settings_invalid",
            format!("failed to parse settings: {error}"),
        )
    })?;
    if settings.schema_version == 0 {
        let niutrans = &settings.providers.niutrans;
        let configured = niutrans
            .app_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            && niutrans
                .api_key
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty());
        settings.capabilities.translation.primary_provider = configured
            .then(|| crate::providers::ProviderId::new("niutrans").expect("static ID is valid"));
        settings.schema_version = SETTINGS_SCHEMA_VERSION;
    }
    Ok(settings)
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
    if settings.schema_version != SETTINGS_SCHEMA_VERSION {
        return Err(AppError::settings_error(
            "settings_unsupported_version",
            format!(
                "Unsupported settings schema version: {}",
                settings.schema_version
            ),
        ));
    }
    validate_translation_route(settings)?;
    let Some(raw_url) = settings.services.rsshub.base_url.as_deref() else {
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

fn validate_translation_route(settings: &Settings) -> AppResult<()> {
    let route = &settings.capabilities.translation;
    if route.primary_provider.as_ref().is_some_and(|primary| {
        route
            .fallback_providers
            .iter()
            .any(|fallback| fallback == primary)
    }) {
        return Err(AppError::settings_error(
            "settings_invalid_provider_route",
            "Primary translation provider cannot also be a fallback",
        ));
    }
    let mut unique = std::collections::HashSet::new();
    if route
        .fallback_providers
        .iter()
        .any(|provider| !unique.insert(provider))
    {
        return Err(AppError::settings_error(
            "settings_invalid_provider_route",
            "Translation fallback providers must be unique",
        ));
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
