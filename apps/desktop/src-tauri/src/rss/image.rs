use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use futures_util::StreamExt;
use reqwest::{header, redirect::Policy, StatusCode};

use crate::{
    error::{AppError, AppResult},
    logging::{sanitize_error, sanitize_url, Operation},
    safe_http::{parse_http_url, resolve_public_target},
};

const MAX_REDIRECTS: usize = 5;
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
    let result = match tokio::time::timeout(
        REQUEST_TIMEOUT,
        download_inner(url, referer.as_ref(), destination, operation),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(image_error(
            "rss_image_timeout",
            "The image download timed out",
        )),
    };
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
    operation: Operation,
) -> AppResult<usize> {
    let mut url = parse_http_url(raw_url).map_err(safe_http_error)?;
    if !valid_image_url(&url) {
        return Err(image_error(
            "rss_image_invalid_url",
            "Only public HTTPS image URLs without credentials are allowed",
        ));
    }

    for redirect_count in 0..=MAX_REDIRECTS {
        log::debug!(
            "outbound_request_hop_started operation_id={} kind=rss_image redirect={} url={:?}",
            operation.id(),
            redirect_count,
            sanitize_url(url.as_str())
        );
        let addresses = resolve_public_target(&url).await.map_err(safe_http_error)?;
        let host = url
            .host_str()
            .ok_or_else(|| image_error("rss_image_invalid_url", "The image URL has no host"))?;
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .user_agent(USER_AGENT)
            .resolve(host, addresses[0])
            .build()
            .map_err(request_error)?;
        let mut request = client.get(url.clone()).header(
            header::ACCEPT,
            "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8",
        );
        if let Some(referer) = referer {
            request = request.header(header::REFERER, referer.as_str());
        }
        let response = request.send().await.map_err(request_error)?;
        log::debug!(
            "outbound_request_hop_completed operation_id={} kind=rss_image redirect={} status={}",
            operation.id(),
            redirect_count,
            response.status().as_u16()
        );

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err(image_error(
                    "rss_image_too_many_redirects",
                    "The image redirected too many times",
                ));
            }
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    image_error(
                        "rss_image_invalid_redirect",
                        "The image returned an invalid redirect",
                    )
                })?;
            url = url.join(location).map_err(|_| {
                image_error(
                    "rss_image_invalid_redirect",
                    "The image returned an invalid redirect",
                )
            })?;
            if !valid_image_url(&url) {
                return Err(image_error(
                    "rss_image_invalid_redirect",
                    "The image redirected to an unsafe URL",
                ));
            }
            continue;
        }
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
        match write_response(response, file).await {
            Ok(written) => {
                finalize_download(&temp_path, destination).await?;
                return Ok(written);
            }
            Err(error) => {
                let _ = tokio::fs::remove_file(&temp_path).await;
                return Err(error);
            }
        }
    }
    unreachable!("redirect loop always returns")
}

async fn write_response(
    response: reqwest::Response,
    mut file: tokio::fs::File,
) -> AppResult<usize> {
    let mut written = 0usize;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(request_error)?;
        written = written.saturating_add(chunk.len());
        if written > MAX_IMAGE_BYTES {
            return Err(image_error(
                "rss_image_too_large",
                "The image exceeds 25 MB",
            ));
        }
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(file_error)?;
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

fn safe_http_error(error: crate::safe_http::SafeHttpError) -> AppError {
    image_error("rss_image_unsafe_url", error.to_string())
}

fn request_error(error: reqwest::Error) -> AppError {
    image_error("rss_image_request_failed", error.to_string())
}

fn file_error(error: std::io::Error) -> AppError {
    image_error("rss_image_write_failed", error.to_string())
}

fn image_error(code: impl Into<String>, message: impl Into<String>) -> AppError {
    AppError::rss_error(code, message)
}
