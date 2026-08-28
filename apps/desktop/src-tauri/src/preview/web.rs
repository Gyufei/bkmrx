use std::time::Duration;

use reqwest::{header, redirect::Policy, Client, Response};
use url::Url;

use crate::logging::{sanitize_error, sanitize_url, Operation};

use super::{
    model::{BookmarkPreview, PreviewFallbackReason},
    security::resolve_public_target,
};

#[derive(Clone)]
pub struct WebPreviewClient;

impl WebPreviewClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(8))
            .redirect(Policy::none())
            .build()?;
        Ok(Self)
    }

    pub async fn prepare(&self, original_url: &str, mut url: Url) -> BookmarkPreview {
        let operation = Operation::start();
        log::debug!(
            "outbound_request_started operation_id={} kind=web_preview method=GET url={:?}",
            operation.id(),
            sanitize_url(url.as_str())
        );
        let result = self.prepare_inner(original_url, &mut url, operation).await;
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

    async fn prepare_inner(
        &self,
        original_url: &str,
        url: &mut Url,
        operation: Operation,
    ) -> BookmarkPreview {
        for redirect_count in 0..=5 {
            log::debug!(
                "outbound_request_hop_started operation_id={} kind=web_preview redirect={} url={:?}",
                operation.id(),
                redirect_count,
                sanitize_url(url.as_str())
            );
            let addresses = match resolve_public_target(url).await {
                Ok(addresses) => addresses,
                Err(fallback) => return fallback,
            };
            let host = url.host_str().expect("validated URL has a host");
            let client = match Client::builder()
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(8))
                .redirect(Policy::none())
                .resolve_to_addrs(host, &addresses)
                .build()
            {
                Ok(client) => client,
                Err(_) => {
                    return BookmarkPreview::fallback(
                        original_url,
                        PreviewFallbackReason::ConnectionFailure,
                        "网页请求初始化失败",
                    )
                }
            };
            let response = match client.get(url.clone()).send().await {
                Ok(response) => response,
                Err(error) if error.is_timeout() => {
                    log::debug!(
                        "outbound_request_error operation_id={} kind=web_preview error={:?}",
                        operation.id(),
                        sanitize_error(&error.to_string())
                    );
                    return BookmarkPreview::fallback(
                        original_url,
                        PreviewFallbackReason::Timeout,
                        "网页响应超时，请稍后重试",
                    );
                }
                Err(error) if error.is_connect() => {
                    log::debug!(
                        "outbound_request_error operation_id={} kind=web_preview error={:?}",
                        operation.id(),
                        sanitize_error(&error.to_string())
                    );
                    return BookmarkPreview::fallback(
                        original_url,
                        PreviewFallbackReason::ConnectionFailure,
                        "暂时无法连接该网页",
                    );
                }
                Err(error) => {
                    log::debug!(
                        "outbound_request_error operation_id={} kind=web_preview error={:?}",
                        operation.id(),
                        sanitize_error(&error.to_string())
                    );
                    return BookmarkPreview::fallback(
                        original_url,
                        PreviewFallbackReason::ConnectionFailure,
                        "网页请求失败，请稍后重试",
                    );
                }
            };
            log::debug!(
                "outbound_request_hop_completed operation_id={} kind=web_preview redirect={} status={}",
                operation.id(),
                redirect_count,
                response.status().as_u16()
            );

            if response.status().is_redirection() {
                let Some(location) = response.headers().get(header::LOCATION) else {
                    return http_error(original_url, &response);
                };
                let Ok(location) = location.to_str() else {
                    return http_error(original_url, &response);
                };
                let Ok(next_url) = url.join(location) else {
                    return http_error(original_url, &response);
                };
                *url = next_url;
                continue;
            }

            if !response.status().is_success() {
                return http_error(original_url, &response);
            }
            if denies_embedding(&response) {
                return BookmarkPreview::fallback(
                    original_url,
                    PreviewFallbackReason::EmbeddingDenied,
                    "该网站的安全策略不允许在应用内显示",
                );
            }
            return BookmarkPreview::Web {
                url: original_url.to_string(),
                final_url: url.to_string(),
            };
        }

        BookmarkPreview::fallback(
            original_url,
            PreviewFallbackReason::HttpError,
            "网页重定向次数过多",
        )
    }
}

fn http_error(original_url: &str, response: &Response) -> BookmarkPreview {
    BookmarkPreview::Fallback {
        url: original_url.to_string(),
        reason: PreviewFallbackReason::HttpError,
        message: format!("网页返回 HTTP {}", response.status().as_u16()),
        http_status: Some(response.status().as_u16()),
    }
}

fn denies_embedding(response: &Response) -> bool {
    headers_deny_embedding(response.headers())
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
