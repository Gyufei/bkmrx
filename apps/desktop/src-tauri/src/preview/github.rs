use std::time::Duration;

use reqwest::{header, Client, StatusCode};
use serde::Deserialize;
use url::Url;

use crate::logging::{sanitize_error, sanitize_url, Operation};

use super::model::{BookmarkPreview, GithubRepositoryPreview, PreviewFallbackReason};

const RESERVED_PATHS: &[&str] = &[
    "about",
    "apps",
    "collections",
    "contact",
    "customer-stories",
    "enterprise",
    "events",
    "explore",
    "features",
    "issues",
    "login",
    "marketplace",
    "new",
    "notifications",
    "organizations",
    "orgs",
    "pricing",
    "pulls",
    "search",
    "security",
    "settings",
    "site",
    "sponsors",
    "topics",
    "trending",
];

#[derive(Clone)]
pub struct GithubClient {
    client: Client,
    api_base: String,
    token: Option<String>,
}

impl GithubClient {
    pub fn new(token: Option<String>) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(8))
                .build()?,
            api_base: "https://api.github.com".to_string(),
            token,
        })
    }

    #[cfg(test)]
    fn with_api_base(token: Option<String>, api_base: String) -> Result<Self, reqwest::Error> {
        let mut client = Self::new(token)?;
        client.api_base = api_base;
        Ok(client)
    }

    pub async fn repository(
        &self,
        original_url: &str,
        owner: &str,
        repository: &str,
    ) -> BookmarkPreview {
        let url = format!("{}/repos/{}/{}", self.api_base, owner, repository);
        let operation = Operation::start();
        log::debug!(
            "outbound_request_started operation_id={} kind=github_preview method=GET repository={:?} url={:?}",
            operation.id(),
            format!("{owner}/{repository}"),
            sanitize_url(&url)
        );
        let mut request = self
            .client
            .get(url)
            .header(header::USER_AGENT, "bkmrx-desktop")
            .header(header::ACCEPT, "application/vnd.github+json");
        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(error) if error.is_timeout() => {
                log::warn!(
                    "outbound_request_failed operation_id={} kind=github_preview error_code=timeout elapsed_ms={} error={:?}",
                    operation.id(),
                    operation.elapsed_ms(),
                    sanitize_error(&error.to_string())
                );
                return BookmarkPreview::fallback(
                    original_url,
                    PreviewFallbackReason::Timeout,
                    "获取 GitHub 仓库信息超时",
                );
            }
            Err(error) => {
                log::warn!(
                    "outbound_request_failed operation_id={} kind=github_preview error_code=request_failed elapsed_ms={} error={:?}",
                    operation.id(),
                    operation.elapsed_ms(),
                    sanitize_error(&error.to_string())
                );
                return BookmarkPreview::fallback(
                    original_url,
                    PreviewFallbackReason::ProviderError,
                    "暂时无法获取 GitHub 仓库信息",
                );
            }
        };

        let status = response.status();
        log::info!(
            "outbound_request_completed operation_id={} kind=github_preview repository={:?} status={} elapsed_ms={}",
            operation.id(),
            format!("{owner}/{repository}"),
            status.as_u16(),
            operation.elapsed_ms()
        );
        if status == StatusCode::NOT_FOUND {
            return BookmarkPreview::fallback(
                original_url,
                PreviewFallbackReason::ProviderNotFound,
                "未找到该 GitHub 仓库，仓库可能不存在或不可公开访问",
            );
        }
        if status == StatusCode::FORBIDDEN || status == StatusCode::TOO_MANY_REQUESTS {
            return BookmarkPreview::fallback(
                original_url,
                PreviewFallbackReason::ProviderRateLimited,
                "GitHub 信息请求过于频繁，请稍后重试",
            );
        }
        if !status.is_success() {
            return BookmarkPreview::fallback(
                original_url,
                PreviewFallbackReason::ProviderError,
                "GitHub 暂时无法返回仓库信息",
            );
        }

        match response.json::<GithubRepositoryResponse>().await {
            Ok(repository) => BookmarkPreview::GithubRepository {
                url: original_url.to_string(),
                repository: Box::new(repository.into_preview()),
            },
            Err(_) => BookmarkPreview::fallback(
                original_url,
                PreviewFallbackReason::ProviderError,
                "GitHub 返回了无法识别的仓库信息",
            ),
        }
    }
}

pub fn parse_repository(url: &Url) -> Option<(String, String)> {
    if !url.host_str()?.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let segments = url
        .path_segments()?
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.len() < 2 || RESERVED_PATHS.contains(&segments[0].to_ascii_lowercase().as_str()) {
        return None;
    }
    let repository = segments[1].strip_suffix(".git").unwrap_or(segments[1]);
    if repository.is_empty() {
        return None;
    }
    Some((segments[0].to_string(), repository.to_string()))
}

pub fn is_github(url: &Url) -> bool {
    url.host_str()
        .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
}

#[derive(Deserialize)]
struct GithubRepositoryResponse {
    owner: GithubOwner,
    name: String,
    full_name: String,
    description: Option<String>,
    html_url: String,
    language: Option<String>,
    stargazers_count: u64,
    forks_count: u64,
    #[serde(default)]
    topics: Vec<String>,
    default_branch: String,
    updated_at: String,
}

impl GithubRepositoryResponse {
    fn into_preview(self) -> GithubRepositoryPreview {
        GithubRepositoryPreview {
            owner: self.owner.login,
            name: self.name,
            full_name: self.full_name,
            description: self.description,
            html_url: self.html_url,
            owner_avatar_url: Some(self.owner.avatar_url),
            primary_language: self.language,
            stars: self.stargazers_count,
            forks: self.forks_count,
            topics: self.topics,
            default_branch: self.default_branch,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Deserialize)]
struct GithubOwner {
    login: String,
    avatar_url: String,
}

#[cfg(test)]
mod tests {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use url::Url;

    use crate::preview::model::BookmarkPreview;

    use super::{parse_repository, GithubClient};

    #[test]
    fn parses_repository_roots_and_subpaths() {
        assert_eq!(
            parse_repository(
                &Url::parse("https://github.com/openai/openai-python/issues").unwrap()
            ),
            Some(("openai".to_string(), "openai-python".to_string()))
        );
        assert_eq!(
            parse_repository(&Url::parse("https://github.com/openai/openai-python.git").unwrap()),
            Some(("openai".to_string(), "openai-python".to_string()))
        );
    }

    #[test]
    fn rejects_reserved_paths_and_non_github_hosts() {
        assert_eq!(
            parse_repository(&Url::parse("https://github.com/settings/profile").unwrap()),
            None
        );
        assert_eq!(
            parse_repository(&Url::parse("https://example.com/openai/openai-python").unwrap()),
            None
        );
    }

    #[tokio::test]
    async fn client_encapsulates_authentication_and_response_mapping() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 4096];
            let read = stream.read(&mut request).await.unwrap();
            let request = String::from_utf8_lossy(&request[..read]).to_ascii_lowercase();
            assert!(request.contains("authorization: bearer future-key"));
            assert!(request.contains("user-agent: bkmrx-desktop"));

            let body = serde_json::json!({
                "owner": { "login": "openai", "avatar_url": "https://example.com/avatar.png" },
                "name": "openai-python",
                "full_name": "openai/openai-python",
                "description": "Official Python library",
                "html_url": "https://github.com/openai/openai-python",
                "language": "Python",
                "stargazers_count": 100,
                "forks_count": 20,
                "topics": ["openai"],
                "default_branch": "main",
                "updated_at": "2026-08-14T00:00:00Z"
            })
            .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let client = GithubClient::with_api_base(
            Some("future-key".to_string()),
            format!("http://{address}"),
        )
        .unwrap();

        let preview = client
            .repository(
                "https://github.com/openai/openai-python",
                "openai",
                "openai-python",
            )
            .await;

        server.await.unwrap();
        match preview {
            BookmarkPreview::GithubRepository { repository, .. } => {
                assert_eq!(repository.full_name, "openai/openai-python");
                assert_eq!(repository.stars, 100);
            }
            preview => panic!("unexpected preview: {preview:?}"),
        }
    }
}
