use std::{
    io::Write,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use log::LevelFilter;
use tauri::{plugin::TauriPlugin, AppHandle, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use url::Url;

use crate::error::AppResult;

const LOG_FILE_NAME: &str = "bkmrx";
const MAX_LOG_FILE_SIZE: u128 = 5 * 1024 * 1024;
const RETAINED_LOG_FILES: usize = 5;
const SENSITIVE_QUERY_KEYS: &[&str] = &[
    "key",
    "token",
    "access_token",
    "api_key",
    "secret",
    "signature",
    "auth",
];

static NEXT_OPERATION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputTarget {
    Stdout,
    LogDir,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LoggerSettings {
    application_level: LevelFilter,
    output: OutputTarget,
    max_file_size: u128,
    retained_log_files: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct Operation {
    id: u64,
    started_at: Instant,
}

impl Operation {
    pub fn start() -> Self {
        Self {
            id: NEXT_OPERATION_ID.fetch_add(1, Ordering::Relaxed),
            started_at: Instant::now(),
        }
    }

    pub fn id(self) -> u64 {
        self.id
    }

    pub fn elapsed(self) -> Duration {
        self.started_at.elapsed()
    }

    pub fn elapsed_ms(self) -> u128 {
        self.elapsed().as_millis()
    }
}

pub fn initialize<R: Runtime>(app: &AppHandle<R>) {
    match configured_logger().split(app) {
        Ok((plugin, max_level, logger)) => {
            if let Err(error) = tauri_plugin_log::attach_logger(max_level, logger) {
                write_stderr(&format!("Failed to attach application logger: {error}"));
                return;
            }
            register_plugin(app, plugin);
        }
        Err(error) => {
            write_stderr(&format!("Failed to initialize application logger: {error}"));
            initialize_stderr_fallback(app);
        }
    }
}

fn configured_logger() -> tauri_plugin_log::Builder {
    let settings = logger_settings(cfg!(debug_assertions));
    let builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .level(LevelFilter::Warn)
        .level_for("bkmrx", settings.application_level)
        .level_for("bkmrx_lib", settings.application_level)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} {:<5} [{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                message
            ))
        });

    match settings.output {
        OutputTarget::Stdout => builder.target(Target::new(TargetKind::Stdout)),
        OutputTarget::LogDir => builder
            .target(Target::new(TargetKind::LogDir {
                file_name: Some(LOG_FILE_NAME.to_owned()),
            }))
            .max_file_size(settings.max_file_size)
            .rotation_strategy(RotationStrategy::KeepSome(settings.retained_log_files)),
    }
}

fn application_level() -> LevelFilter {
    logger_settings(cfg!(debug_assertions)).application_level
}

fn logger_settings(debug: bool) -> LoggerSettings {
    if debug {
        LoggerSettings {
            application_level: LevelFilter::Debug,
            output: OutputTarget::Stdout,
            max_file_size: 0,
            retained_log_files: 0,
        }
    } else {
        LoggerSettings {
            application_level: LevelFilter::Info,
            output: OutputTarget::LogDir,
            max_file_size: MAX_LOG_FILE_SIZE,
            retained_log_files: RETAINED_LOG_FILES,
        }
    }
}

fn initialize_stderr_fallback<R: Runtime>(app: &AppHandle<R>) {
    let fallback = tauri_plugin_log::Builder::new()
        .clear_targets()
        .level(application_level())
        .target(Target::new(TargetKind::Stderr));
    match fallback.split(app) {
        Ok((plugin, max_level, logger)) => {
            if tauri_plugin_log::attach_logger(max_level, logger).is_ok() {
                register_plugin(app, plugin);
            }
        }
        Err(error) => write_stderr(&format!("Failed to initialize fallback logger: {error}")),
    }
}

fn register_plugin<R: Runtime>(app: &AppHandle<R>, plugin: TauriPlugin<R>) {
    if let Err(error) = app.plugin(plugin) {
        log::warn!(
            "log_plugin_registration_failed error={:?}",
            sanitize_error(&error.to_string())
        );
    }
}

fn write_stderr(message: &str) {
    let _ = writeln!(std::io::stderr(), "{message}");
}

pub fn redact_secret(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    if characters.is_empty() {
        return String::new();
    }
    if characters.len() <= 6 {
        return "***".to_owned();
    }
    format!(
        "{}***{}",
        characters[..3].iter().collect::<String>(),
        characters[characters.len() - 2..]
            .iter()
            .collect::<String>()
    )
}

pub fn sanitize_url(value: &str) -> String {
    let Ok(mut url) = Url::parse(value) else {
        return "<invalid-url>".to_owned();
    };
    if !url.username().is_empty() {
        let _ = url.set_username("***");
    }
    if url.password().is_some() {
        let _ = url.set_password(Some("***"));
    }
    let pairs = url
        .query_pairs()
        .map(|(key, value)| {
            let value = if is_sensitive_key(&key) {
                redact_secret(&value)
            } else {
                value.into_owned()
            };
            (key.into_owned(), value)
        })
        .collect::<Vec<_>>();
    if url.query().is_some() {
        url.query_pairs_mut().clear().extend_pairs(pairs);
    }
    url.to_string()
}

pub fn sanitize_error(value: &str) -> String {
    let mut sanitized = value.to_owned();
    for key in SENSITIVE_QUERY_KEYS {
        sanitized = redact_named_value(&sanitized, key);
    }
    sanitized
}

pub fn observe_database<T>(
    store: &str,
    action: &str,
    run: impl FnOnce() -> AppResult<T>,
) -> AppResult<T> {
    let operation = Operation::start();
    log::debug!(
        "database_operation_started operation_id={} store={} operation={}",
        operation.id(),
        store,
        action
    );
    let result = run();
    match &result {
        Ok(_) => log::info!(
            "database_operation_completed operation_id={} store={} operation={} elapsed_ms={}",
            operation.id(),
            store,
            action,
            operation.elapsed_ms()
        ),
        Err(error) => log::error!(
            "database_operation_failed operation_id={} store={} operation={} error_code={} elapsed_ms={} error={:?}",
            operation.id(),
            store,
            action,
            error.code(),
            operation.elapsed_ms(),
            sanitize_error(&error.to_string())
        ),
    }
    result
}

fn is_sensitive_key(key: &str) -> bool {
    SENSITIVE_QUERY_KEYS
        .iter()
        .any(|candidate| key.eq_ignore_ascii_case(candidate))
}

fn redact_named_value(input: &str, key: &str) -> String {
    let lowercase = input.to_ascii_lowercase();
    let needle = format!("{key}=");
    let mut cursor = 0;
    let mut output = String::with_capacity(input.len());
    while let Some(relative_start) = lowercase[cursor..].find(&needle) {
        let start = cursor + relative_start;
        let value_start = start + needle.len();
        output.push_str(&input[cursor..value_start]);
        let value_end = input[value_start..]
            .find(['&', ' ', '\t', '\r', '\n', '"', '\''])
            .map_or(input.len(), |offset| value_start + offset);
        output.push_str("***");
        cursor = value_end;
    }
    output.push_str(&input[cursor..]);
    output
}

#[cfg(test)]
mod tests {
    use log::LevelFilter;

    use super::{
        logger_settings, redact_secret, sanitize_error, sanitize_url, Operation, OutputTarget,
        MAX_LOG_FILE_SIZE, RETAINED_LOG_FILES,
    };

    #[test]
    fn selects_environment_specific_targets_and_levels() {
        let debug = logger_settings(true);
        assert_eq!(debug.application_level, LevelFilter::Debug);
        assert_eq!(debug.output, OutputTarget::Stdout);
        assert_eq!(debug.max_file_size, 0);

        let release = logger_settings(false);
        assert_eq!(release.application_level, LevelFilter::Info);
        assert_eq!(release.output, OutputTarget::LogDir);
        assert_eq!(release.max_file_size, MAX_LOG_FILE_SIZE);
        assert_eq!(release.retained_log_files, RETAINED_LOG_FILES);
    }

    #[test]
    fn redacts_secrets_without_exposing_short_values() {
        assert_eq!(redact_secret(""), "");
        assert_eq!(redact_secret("secret"), "***");
        assert_eq!(redact_secret("abcdefghij"), "abc***ij");
    }

    #[test]
    fn sanitizes_only_credential_url_fields() {
        let sanitized = sanitize_url(
            "https://user:password@example.com/feed?limit=10&access_token=abcdefghij&key=short",
        );
        assert!(sanitized.contains("limit=10"));
        assert!(sanitized.contains("access_token=abc***ij"));
        assert!(sanitized.contains("key=***"));
        assert!(!sanitized.contains("password"));
        assert!(!sanitized.contains("abcdefghij"));
        assert!(!sanitized.contains("short"));
    }

    #[test]
    fn sanitizes_credentials_embedded_in_error_text() {
        let sanitized = sanitize_error(
            "request failed: https://example.com/feed?limit=10&token=secret-value next",
        );
        assert!(sanitized.contains("limit=10"));
        assert!(sanitized.contains("token=***"));
        assert!(!sanitized.contains("secret-value"));
    }

    #[test]
    fn operation_ids_increase() {
        let first = Operation::start();
        let second = Operation::start();
        assert!(second.id() > first.id());
    }
}
