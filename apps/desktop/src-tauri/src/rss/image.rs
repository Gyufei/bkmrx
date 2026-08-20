use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use futures_util::StreamExt;
use reqwest::{header, redirect::Policy, StatusCode};

use crate::{
    error::{AppError, AppResult},
    safe_http::{parse_http_url, resolve_public_target},
};

const MAX_REDIRECTS: usize = 5;
const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const USER_AGENT: &str = concat!("bkmrx/", env!("CARGO_PKG_VERSION"), " RSS reader");
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub async fn download(url: &str, referer: Option<&str>, destination: &Path) -> AppResult<()> {
    validate_destination(destination)?;
    let referer = referer
        .and_then(|value| parse_http_url(value).ok())
        .filter(valid_public_url);
    tokio::time::timeout(
        REQUEST_TIMEOUT,
        download_inner(url, referer.as_ref(), destination),
    )
    .await
    .map_err(|_| image_error("rss_image_timeout", "The image download timed out"))?
}

async fn download_inner(
    raw_url: &str,
    referer: Option<&url::Url>,
    destination: &Path,
) -> AppResult<()> {
    let mut url = parse_http_url(raw_url).map_err(safe_http_error)?;
    if !valid_image_url(&url) {
        return Err(image_error(
            "rss_image_invalid_url",
            "Only public HTTPS image URLs without credentials are allowed",
        ));
    }

    for redirect_count in 0..=MAX_REDIRECTS {
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
        let result = write_response(response, file).await;
        if result.is_ok() {
            finalize_download(&temp_path, destination).await?;
        } else {
            let _ = tokio::fs::remove_file(&temp_path).await;
        }
        return result;
    }
    unreachable!("redirect loop always returns")
}

async fn write_response(response: reqwest::Response, mut file: tokio::fs::File) -> AppResult<()> {
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
    file.sync_all().await.map_err(file_error)
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
