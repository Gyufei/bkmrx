use url::Url;

use crate::safe_http::{self, SafeHttpError};

use super::model::{BookmarkPreview, PreviewFallbackReason};

pub fn parse_http_url(raw_url: &str) -> Result<Url, BookmarkPreview> {
    safe_http::parse_http_url(raw_url).map_err(|error| map_error(raw_url, error))
}

pub async fn resolve_public_target(
    url: &Url,
) -> Result<Vec<std::net::SocketAddr>, BookmarkPreview> {
    safe_http::resolve_public_target(url)
        .await
        .map_err(|error| map_error(url.as_str(), error))
}

fn map_error(url: &str, error: SafeHttpError) -> BookmarkPreview {
    match error {
        SafeHttpError::InvalidUrl
        | SafeHttpError::UnsupportedProtocol
        | SafeHttpError::InvalidTarget => BookmarkPreview::fallback(
            url,
            PreviewFallbackReason::UnsupportedProtocol,
            "该地址不是有效的网页链接",
        ),
        SafeHttpError::DnsFailure => {
            BookmarkPreview::fallback(url, PreviewFallbackReason::DnsFailure, "无法解析网页地址")
        }
        SafeHttpError::UnsafeTarget => BookmarkPreview::fallback(
            url,
            PreviewFallbackReason::UnsafeTarget,
            "出于安全原因，不能预览本机或私有网络地址",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_http_url;

    #[test]
    fn rejects_non_http_protocols() {
        assert!(parse_http_url("file:///tmp/test").is_err());
        assert!(parse_http_url("https://example.com").is_ok());
    }
}
