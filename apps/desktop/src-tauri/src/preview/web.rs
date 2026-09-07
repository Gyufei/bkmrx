use std::time::Duration;

use reqwest::header;
use url::Url;

use crate::logging::{sanitize_url, Operation};

use super::model::{BookmarkPreview, PreviewFallbackReason};

#[derive(Clone)]
pub struct WebPreviewClient;

impl WebPreviewClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self)
    }

    pub async fn prepare(&self, original_url: &str, url: Url) -> BookmarkPreview {
        let operation = Operation::start();
        log::debug!(
            "outbound_request_started operation_id={} kind=web_preview method=GET url={:?}",
            operation.id(),
            sanitize_url(url.as_str())
        );
        let result = self.prepare_inner(original_url, &url).await;
        match &result {
            BookmarkPreview::Web { final_url, .. } => log::info!(
                "outbound_request_completed operation_id={} kind=web_preview host={:?} status=success elapsed_ms={}",
                operation.id(),
                Url::parse(final_url)
                    .ok()
                    .and_then(|url| url.host_str().map(str::to_owned))
                    .unwrap_or_else(|| "unknown".to_owned()),
                operation.elapsed_ms()
            ),
            BookmarkPreview::Fallback {
                reason,
                http_status,
                ..
            } => log::warn!(
                "outbound_request_failed operation_id={} kind=web_preview reason={:?} status={:?} elapsed_ms={}",
                operation.id(),
                reason,
                http_status,
                operation.elapsed_ms()
            ),
            BookmarkPreview::GithubRepository { .. } => {}
        }
        result
    }

    async fn prepare_inner(&self, original_url: &str, url: &Url) -> BookmarkPreview {
        let response = match crate::safe_http::get(
            url.as_str(),
            crate::safe_http::RequestOptions {
                timeout: Duration::from_secs(8),
                max_bytes: 0,
                https_only: false,
                headers: header::HeaderMap::new(),
                credential: None,
            },
        )
        .await
        {
            Ok(response) => response,
            Err(error) => return super::security::map_error(original_url, error),
        };
        if !response.status().is_success() {
            return BookmarkPreview::Fallback {
                url: original_url.into(),
                reason: PreviewFallbackReason::HttpError,
                message: format!("网页返回 HTTP {}", response.status().as_u16()),
                http_status: Some(response.status().as_u16()),
            };
        }
        if headers_deny_embedding(response.headers()) {
            return BookmarkPreview::fallback(
                original_url,
                PreviewFallbackReason::EmbeddingDenied,
                "该网站的安全策略不允许在应用内显示",
            );
        }
        BookmarkPreview::Web {
            url: original_url.into(),
            final_url: response.final_url.to_string(),
        }
    }
}

fn headers_deny_embedding(headers: &header::HeaderMap) -> bool {
    let x_frame_options = headers
        .get_all(header::HeaderName::from_static("x-frame-options"))
        .iter()
        .filter_map(|value| value.to_str().ok())
        .any(|value| {
            value.split(',').any(|token| {
                matches!(
                    token.trim().to_ascii_lowercase().as_str(),
                    "deny" | "sameorigin"
                )
            })
        });
    x_frame_options
        || headers
            .get_all(header::CONTENT_SECURITY_POLICY)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .any(csp_denies_embedding)
}

fn csp_denies_embedding(policy: &str) -> bool {
    let Some(directive) = policy.split(';').find(|directive| {
        directive
            .split_whitespace()
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case("frame-ancestors"))
    }) else {
        return false;
    };
    let sources = directive.split_whitespace().skip(1).collect::<Vec<_>>();
    sources.is_empty()
        || sources
            .iter()
            .any(|source| source.eq_ignore_ascii_case("'none'"))
        || !sources.contains(&"*")
}

#[cfg(test)]
mod tests {
    use reqwest::header::{HeaderMap, HeaderValue, CONTENT_SECURITY_POLICY};

    use super::{csp_denies_embedding, headers_deny_embedding};

    #[test]
    fn recognizes_frame_ancestor_policies() {
        assert!(csp_denies_embedding(
            "default-src 'self'; frame-ancestors 'none'"
        ));
        assert!(csp_denies_embedding(
            "frame-ancestors 'self' https://example.com"
        ));
        assert!(!csp_denies_embedding("default-src 'none'"));
        assert!(!csp_denies_embedding("frame-ancestors *"));
    }

    #[test]
    fn recognizes_x_frame_options() {
        let mut headers = HeaderMap::new();
        headers.insert("x-frame-options", HeaderValue::from_static("SAMEORIGIN"));
        assert!(headers_deny_embedding(&headers));

        headers.remove("x-frame-options");
        headers.insert(
            CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'self'"),
        );
        assert!(!headers_deny_embedding(&headers));
    }
}
