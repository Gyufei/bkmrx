use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use reqwest::{header, StatusCode};

use crate::{
    error::{AppError, AppResult},
    logging::{sanitize_error, sanitize_url, Operation},
    safe_http::{get, parse_http_url, RequestOptions, SafeHttpError, SafeResponse},
};

const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const USER_AGENT: &str = concat!("bkmrx/", env!("CARGO_PKG_VERSION"), " RSS reader");
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub async fn download(url: &str, referer: Option<&str>, destination: &Path) -> AppResult<()> {
    validate_destination(destination)?;
    let operation = Operation::start();
    log::debug!(
        "outbound_request_started operation_id={} kind=rss_image method=GET url={:?}",
        operation.id(),
        sanitize_url(url)
    );
    let referer = referer
        .and_then(|value| parse_http_url(value).ok())
        .filter(valid_public_url);
    let result = download_inner(url, referer.as_ref(), destination).await;
    match &result {
        Ok(bytes) => log::info!(
            "outbound_request_completed operation_id={} kind=rss_image bytes={} elapsed_ms={}",
            operation.id(),
            bytes,
            operation.elapsed_ms()
        ),
        Err(error) => log::warn!(
            "outbound_request_failed operation_id={} kind=rss_image error_code={} elapsed_ms={} error={:?}",
            operation.id(),
            error.code(),
            operation.elapsed_ms(),
            sanitize_error(&error.to_string())
        ),
    }
    result.map(|_| ())
}

async fn download_inner(
    raw_url: &str,
    referer: Option<&url::Url>,
    destination: &Path,
) -> AppResult<usize> {
    let url = parse_http_url(raw_url).map_err(safe_http_error)?;
    if !valid_image_url(&url) {
        return Err(image_error(
            "rss_image_invalid_url",
            "Only HTTPS image URLs without credentials are allowed",
        ));
    }
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::USER_AGENT,
        header::HeaderValue::from_static(USER_AGENT),
    );
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static(
            "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8",
        ),
    );
    if let Some(referer) = referer {
        if let Ok(value) = header::HeaderValue::from_str(referer.as_str()) {
            headers.insert(header::REFERER, value);
        }
    }
    let response = get(
        raw_url,
        RequestOptions {
            timeout: REQUEST_TIMEOUT,
            max_bytes: MAX_IMAGE_BYTES,
            https_only: true,
            headers,
            credential: None,
        },
    )
    .await
    .map_err(safe_http_error)?;
    if response.status() != StatusCode::OK {
        return Err(image_error(
            "rss_image_http_error",
            format!("The image request returned HTTP {}", response.status()),
        ));
    }
    let is_image = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("image/"));
    if !is_image {
        return Err(image_error(
            "rss_image_invalid_content_type",
            "The server response is not an image",
        ));
    }
    let (file, temp_path) = create_temp_file(destination).await?;
    let result = match write_response(response, file).await {
        Ok(written) => finalize_download(&temp_path, destination)
            .await
            .map(|_| written),
        Err(error) => Err(error),
    };
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temp_path).await;
    }
    result
}

async fn write_response(mut response: SafeResponse, mut file: tokio::fs::File) -> AppResult<usize> {
    let mut written = 0;
    while let Some(chunk) = response.chunk().await.map_err(safe_http_error)? {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(file_error)?;
        written += chunk.len();
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(file_error)?;
    file.sync_all().await.map_err(file_error)?;
    Ok(written)
}

async fn create_temp_file(destination: &Path) -> AppResult<(tokio::fs::File, PathBuf)> {
    loop {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp_path = destination.with_extension(format!(
            "bkmrx-download-{}-{counter}.tmp",
            std::process::id()
        ));
        match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .await
        {
            Ok(file) => return Ok((file, temp_path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(file_error(error)),
        }
    }
}

async fn finalize_download(temp_path: &Path, destination: &Path) -> AppResult<()> {
    match tokio::fs::rename(temp_path, destination).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            tokio::fs::remove_file(destination)
                .await
                .map_err(file_error)?;
            tokio::fs::rename(temp_path, destination)
                .await
                .map_err(file_error)
        }
        Err(error) => Err(file_error(error)),
    }
}

fn validate_destination(path: &Path) -> AppResult<()> {
    if !path.is_absolute()
        || path.file_name().is_none()
        || path.parent().is_none_or(|p| !p.exists())
    {
        return Err(image_error(
            "rss_image_invalid_destination",
            "The selected destination is invalid",
        ));
    }
    Ok(())
}

fn valid_image_url(url: &url::Url) -> bool {
    url.scheme() == "https" && valid_public_url(url)
}

fn valid_public_url(url: &url::Url) -> bool {
    url.username().is_empty()
        && url.password().is_none()
        && matches!(url.scheme(), "http" | "https")
}

fn safe_http_error(error: SafeHttpError) -> AppError {
    let code = match error {
        SafeHttpError::Timeout => "rss_image_timeout",
        SafeHttpError::BodyTooLarge => "rss_image_too_large",
        SafeHttpError::TooManyRedirects => "rss_image_too_many_redirects",
        SafeHttpError::InvalidRedirect => "rss_image_invalid_redirect",
        SafeHttpError::RequestFailed => "rss_image_request_failed",
        _ => "rss_image_unsafe_url",
    };
    image_error(code, error.to_string())
}

fn file_error(error: std::io::Error) -> AppError {
    image_error("rss_image_write_failed", error.to_string())
}

fn image_error(code: impl Into<String>, message: impl Into<String>) -> AppError {
    AppError::rss_error(code, message)
}
