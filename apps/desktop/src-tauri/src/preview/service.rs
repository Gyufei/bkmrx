use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use super::{
    github::{is_github, parse_repository, GithubClient},
    model::{BookmarkPreview, PrepareBookmarkPreviewRequest, PreviewFallbackReason},
    security::parse_http_url,
    web::WebPreviewClient,
};

const CACHE_CAPACITY: usize = 256;

pub struct PreviewService {
    github: GithubClient,
    web: WebPreviewClient,
    cache: Mutex<HashMap<String, CachedPreview>>,
}

impl PreviewService {
    pub fn new(github_token: Option<String>) -> Result<Self, reqwest::Error> {
        Ok(Self {
            github: GithubClient::new(github_token)?,
            web: WebPreviewClient::new()?,
            cache: Mutex::new(HashMap::new()),
        })
    }

    pub async fn prepare(
        &self,
        request: PrepareBookmarkPreviewRequest,
        force_refresh: bool,
    ) -> BookmarkPreview {
        let url = match parse_http_url(&request.url) {
            Ok(url) => url,
            Err(fallback) => return fallback,
        };
        let cache_key = url.to_string();
        if !force_refresh {
            if let Some(preview) = self.cached(&cache_key) {
                return preview;
            }
        }

        let preview = if let Some((owner, repository)) = parse_repository(&url) {
            self.github
                .repository(&request.url, &owner, &repository)
                .await
        } else if is_github(&url) {
            BookmarkPreview::fallback(
                &request.url,
                PreviewFallbackReason::UnsupportedProviderUrl,
                "该 GitHub 页面暂不支持摘要预览",
            )
        } else {
            self.web.prepare(&request.url, url).await
        };
        self.store(cache_key, preview.clone());
        preview
    }

    fn cached(&self, key: &str) -> Option<BookmarkPreview> {
        let mut cache = self.cache.lock().unwrap_or_else(|error| error.into_inner());
        match cache.get(key) {
            Some(entry) if entry.expires_at > Instant::now() => Some(entry.preview.clone()),
            Some(_) => {
                cache.remove(key);
                None
            }
            None => None,
        }
    }

    fn store(&self, key: String, preview: BookmarkPreview) {
        let mut cache = self.cache.lock().unwrap_or_else(|error| error.into_inner());
        if cache.len() >= CACHE_CAPACITY {
            cache.retain(|_, entry| entry.expires_at > Instant::now());
            if cache.len() >= CACHE_CAPACITY {
                if let Some(key) = cache.keys().next().cloned() {
                    cache.remove(&key);
                }
            }
        }
        let ttl = match preview {
            BookmarkPreview::GithubRepository { .. } => Duration::from_secs(15 * 60),
            BookmarkPreview::Web { .. } => Duration::from_secs(5 * 60),
            BookmarkPreview::Fallback { .. } => Duration::from_secs(30),
        };
        cache.insert(
            key,
            CachedPreview {
                preview,
                expires_at: Instant::now() + ttl,
            },
        );
    }
}

struct CachedPreview {
    preview: BookmarkPreview,
    expires_at: Instant,
}

pub type SharedPreviewService = std::sync::Arc<PreviewService>;
