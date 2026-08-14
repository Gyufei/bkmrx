use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrepareBookmarkPreviewRequest {
    pub bookmark_id: i64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BookmarkPreview {
    Web {
        url: String,
        final_url: String,
    },
    GithubRepository {
        url: String,
        repository: Box<GithubRepositoryPreview>,
    },
    Fallback {
        url: String,
        reason: PreviewFallbackReason,
        message: String,
        http_status: Option<u16>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GithubRepositoryPreview {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub owner_avatar_url: Option<String>,
    pub primary_language: Option<String>,
    pub stars: u64,
    pub forks: u64,
    pub topics: Vec<String>,
    pub default_branch: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewFallbackReason {
    EmbeddingDenied,
    Timeout,
    DnsFailure,
    ConnectionFailure,
    HttpError,
    UnsupportedProtocol,
    UnsupportedProviderUrl,
    ProviderRateLimited,
    ProviderNotFound,
    ProviderError,
    UnsafeTarget,
}

impl BookmarkPreview {
    pub fn fallback(
        url: impl Into<String>,
        reason: PreviewFallbackReason,
        message: impl Into<String>,
    ) -> Self {
        Self::Fallback {
            url: url.into(),
            reason,
            message: message.into(),
            http_status: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{BookmarkPreview, PreviewFallbackReason};

    #[test]
    fn serializes_tagged_preview_contract() {
        let preview = BookmarkPreview::fallback(
            "https://example.com",
            PreviewFallbackReason::EmbeddingDenied,
            "blocked",
        );

        assert_eq!(
            serde_json::to_value(preview).unwrap(),
            serde_json::json!({
                "kind": "fallback",
                "url": "https://example.com",
                "reason": "embedding_denied",
                "message": "blocked",
                "http_status": null
            })
        );
    }
}
