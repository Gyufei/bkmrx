pub mod fetcher;
mod image;
pub mod model;
pub mod parser;
pub mod repository;
pub mod sanitizer;
pub mod service;

pub use fetcher::FeedFetcher;
pub use model::*;
pub use repository::RssRepository;
pub use service::{FeedRefreshResult, RefreshResult, RssService, SharedRssService};

pub async fn download_image(
    url: &str,
    referer: Option<&str>,
    destination: &std::path::Path,
) -> crate::error::AppResult<()> {
    image::download(url, referer, destination).await
}
