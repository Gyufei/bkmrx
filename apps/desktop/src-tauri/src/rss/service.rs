use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use futures_util::{future::BoxFuture, stream, FutureExt, StreamExt};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::{
    fetcher::FeedFetcher,
    model::{CreateFeed, EntryPage, EntryPageRequest, FeedPreview, RssEntry, RssFeed},
    repository::RssRepository,
};

const STALE_AFTER: Duration = Duration::from_secs(15 * 60);

pub type SharedRssService = Arc<RssService>;
type SharedRefresh = futures_util::future::Shared<BoxFuture<'static, AppResult<RssFeed>>>;
type InflightRefreshes = Arc<Mutex<HashMap<i64, SharedRefresh>>>;

#[derive(Clone)]
pub struct RssService {
    repository: RssRepository,
    fetcher: FeedFetcher,
    change_notifier: Option<Arc<dyn Fn() + Send + Sync>>,
    inflight: InflightRefreshes,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RefreshResult {
    pub refreshed: u32,
    pub failed: u32,
}

impl RssService {
    pub fn new(repository: RssRepository) -> Self {
        Self {
            repository,
            fetcher: FeedFetcher,
            change_notifier: None,
            inflight: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn with_change_notifier(mut self, notifier: Arc<dyn Fn() + Send + Sync>) -> Self {
        self.change_notifier = Some(notifier);
        self
    }

    pub async fn preview(&self, url: &str) -> AppResult<FeedPreview> {
        self.fetcher.preview(url).await
    }

    pub async fn create(&self, input: CreateFeed) -> AppResult<RssFeed> {
        let (feed_url, parsed) = self.fetcher.fetch_and_parse(&input.feed_url).await?;
        let feed = self
            .repository
            .create(&CreateFeed { feed_url, ..input }, &parsed)?;
        self.notify();
        Ok(feed)
    }

    pub fn list_feeds(&self) -> AppResult<Vec<RssFeed>> {
        self.repository.list_feeds()
    }
    pub fn list_entries(&self, request: &EntryPageRequest) -> AppResult<EntryPage> {
        self.repository.list_entries(request)
    }

    pub async fn refresh_feed(&self, id: i64) -> AppResult<RssFeed> {
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

    async fn refresh_feed_once(&self, id: i64) -> AppResult<RssFeed> {
        let feed = self
            .repository
            .get_feed(id)?
            .ok_or_else(|| feed_not_found(id))?;
        match self.fetcher.fetch_and_parse(&feed.feed_url).await {
            Ok((url, parsed)) => {
                let feed = self.repository.apply_refresh(id, &url, &parsed)?;
                self.notify();
                Ok(feed)
            }
            Err(error) => {
                self.repository.record_failure(id, &error.message)?;
                self.notify();
                Err(error)
            }
        }
    }

    pub async fn refresh_all(&self, stale_only: bool) -> AppResult<RefreshResult> {
        let now = chrono::Utc::now().timestamp();
        let feeds = self.repository.list_feeds()?.into_iter().filter(|feed| {
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
            refreshed: results.iter().filter(|result| result.is_ok()).count() as u32,
            failed: results.iter().filter(|result| result.is_err()).count() as u32,
        })
    }

    pub fn mark_entry_read(&self, id: i64, is_read: bool) -> AppResult<RssEntry> {
        let entry = self.repository.mark_entry_read(id, is_read)?;
        self.notify();
        Ok(entry)
    }

    pub fn rename_feed(&self, id: i64, custom_title: Option<&str>) -> AppResult<RssFeed> {
        let feed = self.repository.rename(id, custom_title)?;
        self.notify();
        Ok(feed)
    }

    pub fn delete_feed(&self, id: i64) -> AppResult<()> {
        self.repository.delete(id)?;
        self.notify();
        Ok(())
    }

    fn notify(&self) {
        if let Some(notifier) = &self.change_notifier {
            notifier();
        }
    }
}

fn feed_not_found(id: i64) -> AppError {
    AppError::rss_error("rss_feed_not_found", format!("Feed {id} was not found"))
}
