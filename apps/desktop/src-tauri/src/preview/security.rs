use url::Url;

use crate::safe_http::{self, SafeHttpError};

use super::model::{BookmarkPreview, PreviewFallbackReason};

pub fn parse_http_url(raw_url: &str) -> Result<Url, BookmarkPreview> {
    safe_http::parse_http_url(raw_url).map_err(|error| map_error(raw_url, error))
}

pub(super) fn map_error(url: &str, error: SafeHttpError) -> BookmarkPreview {
    match error {
        SafeHttpError::Timeout => BookmarkPreview::fallback(
            url,
            PreviewFallbackReason::Timeout,
            "网页响应超时，请稍后重试",
        ),
        SafeHttpError::RequestFailed => BookmarkPreview::fallback(
            url,
            PreviewFallbackReason::ConnectionFailure,
            "暂时无法连接该网页",
        ),
        SafeHttpError::TooManyRedirects
        | SafeHttpError::InvalidRedirect
        | SafeHttpError::BodyTooLarge => {
            BookmarkPreview::fallback(url, PreviewFallbackReason::HttpError, error.to_string())
        }
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
