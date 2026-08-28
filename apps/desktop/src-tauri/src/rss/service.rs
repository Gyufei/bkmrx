use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use futures_util::{future::BoxFuture, stream, FutureExt, StreamExt};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    logging::observe_database,
};

use super::{
    fetcher::{is_official_rsshub_url, FeedFetcher},
    model::{CreateFeed, EntryPage, EntryPageRequest, FeedPreview, RssEntry, RssFeed},
    repository::RssRepository,
};

const STALE_AFTER: Duration = Duration::from_secs(15 * 60);

pub type SharedRssService = Arc<RssService>;
type SharedRefresh = futures_util::future::Shared<BoxFuture<'static, AppResult<FeedRefreshResult>>>;
type InflightRefreshes = Arc<Mutex<HashMap<i64, SharedRefresh>>>;

#[derive(Clone)]
pub struct RssService {
    repository: RssRepository,
    fetcher: FeedFetcher,
    inflight: InflightRefreshes,
    settings_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RefreshResult {
    pub refreshed: u32,
    pub added: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeedRefreshResult {
    pub feed: RssFeed,
    pub added: u32,
}

impl RssService {
    pub fn new(repository: RssRepository) -> Self {
        Self {
            repository,
            fetcher: FeedFetcher,
            inflight: Arc::new(Mutex::new(HashMap::new())),
            settings_path: None,
        }
    }

    pub fn with_settings_path(mut self, settings_path: PathBuf) -> Self {
        self.settings_path = Some(settings_path);
        self
    }

    fn rss_settings(&self) -> AppResult<crate::settings::RssHubSettings> {
        self.settings_path
            .as_deref()
            .map(crate::settings::load)
            .transpose()
            .map(|settings| settings.unwrap_or_default().services.rsshub)
    }

    pub async fn preview(&self, url: &str) -> AppResult<FeedPreview> {
        self.fetcher.preview(url, &self.rss_settings()?).await
    }

    pub async fn create(&self, input: CreateFeed) -> AppResult<RssFeed> {
        let settings = self.rss_settings()?;
        let (feed_url, parsed) = self
            .fetcher
            .fetch_and_parse(&input.feed_url, &settings)
            .await?;
        let feed = observe_database("rss", "create_feed", || {
            self.repository
                .create(&CreateFeed { feed_url, ..input }, &parsed)
        })?;
        Ok(feed)
    }

    pub fn list_feeds(&self) -> AppResult<Vec<RssFeed>> {
        observe_database("rss", "list_feeds", || self.repository.list_feeds())
    }
    pub fn list_entries(&self, request: &EntryPageRequest) -> AppResult<EntryPage> {
        observe_database("rss", "list_entries", || {
            self.repository.list_entries(request)
        })
    }

    pub async fn refresh_feed(&self, id: i64) -> AppResult<FeedRefreshResult> {
        let future = {
            let mut inflight = self
                .inflight
                .lock()
                .map_err(|_| AppError::internal_error("RSS refresh lock is poisoned"))?;
            if let Some(future) = inflight.get(&id) {
                future.clone()
            } else {
                let service = self.clone();
                let future = async move {
                    let result = service.refresh_feed_once(id).await;
                    if let Ok(mut inflight) = service.inflight.lock() {
                        inflight.remove(&id);
                    }
                    result
                }
                .boxed()
                .shared();
                inflight.insert(id, future.clone());
                future
            }
        };
        future.await
    }

    async fn refresh_feed_once(&self, id: i64) -> AppResult<FeedRefreshResult> {
        let feed = observe_database("rss", "get_feed", || self.repository.get_feed(id))?
            .ok_or_else(|| feed_not_found(id))?;
        let settings = self.rss_settings()?;
        let source_is_rsshub = url::Url::parse(&feed.source_url)
            .ok()
            .is_some_and(|url| is_official_rsshub_url(&url));
        let refresh_url = if source_is_rsshub {
            &feed.source_url
        } else {
            &feed.feed_url
        };
        match self.fetcher.fetch_and_parse(refresh_url, &settings).await {
            Ok((url, parsed)) => {
                let (feed, added) = observe_database("rss", "apply_refresh", || {
                    self.repository.apply_refresh(id, &url, &parsed)
                })?;
                Ok(FeedRefreshResult { feed, added })
            }
            Err(error) => {
                if let Err(record_error) = observe_database("rss", "record_refresh_failure", || {
                    self.repository.record_failure(id, &error.message)
                }) {
                    if record_error.code != "rss_feed_not_found" {
                        return Err(record_error);
                    }
                }
                Err(error)
            }
        }
    }

    pub async fn refresh_all(&self, stale_only: bool) -> AppResult<RefreshResult> {
        let now = chrono::Utc::now().timestamp();
        let feeds = observe_database("rss", "list_feeds_for_refresh", || {
            self.repository.list_feeds()
        })?
        .into_iter()
        .filter(|feed| {
            !stale_only
                || feed
                    .last_successful_fetched_at
                    .is_none_or(|at| now.saturating_sub(at) >= STALE_AFTER.as_secs() as i64)
        });
        let results =
            stream::iter(feeds.map(|feed| async move { self.refresh_feed(feed.id).await }))
                .buffer_unordered(4)
                .collect::<Vec<_>>()
                .await;
        Ok(RefreshResult {
            refreshed: results.len() as u32,
            added: results
                .iter()
                .filter_map(|result| result.as_ref().ok())
                .map(|result| result.added)
                .sum(),
            failed: results.iter().filter(|result| result.is_err()).count() as u32,
        })
    }

    pub fn mark_entry_read(&self, id: i64, is_read: bool) -> AppResult<RssEntry> {
        let entry = observe_database("rss", "mark_entry_read", || {
            self.repository.mark_entry_read(id, is_read)
        })?;
        Ok(entry)
    }

    pub fn rename_feed(&self, id: i64, custom_title: Option<&str>) -> AppResult<RssFeed> {
        let feed = observe_database("rss", "rename_feed", || {
            self.repository.rename(id, custom_title)
        })?;
        Ok(feed)
    }

    pub fn delete_feed(&self, id: i64) -> AppResult<()> {
        observe_database("rss", "delete_feed", || self.repository.delete(id))?;
        Ok(())
    }
}

fn feed_not_found(id: i64) -> AppError {
    AppError::rss_error("rss_feed_not_found", format!("Feed {id} was not found"))
}
