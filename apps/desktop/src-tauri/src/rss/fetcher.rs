use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{header, redirect::Policy, StatusCode};
use scraper::{Html, Selector};
use url::Url;

use crate::{
    error::{AppError, AppResult},
    safe_http::{parse_http_url, resolve_public_target},
};

use super::{
    model::{FeedCandidate, FeedPreview, ParsedFeed},
    parser::parse_feed,
};

const MAX_REDIRECTS: usize = 5;
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str = concat!("bkmrx/", env!("CARGO_PKG_VERSION"), " RSS reader");

#[derive(Debug, Clone, Default)]
pub struct FeedFetcher;

impl FeedFetcher {
    pub async fn preview(&self, raw_url: &str) -> AppResult<FeedPreview> {
        let source_url = parse_http_url(raw_url)
            .map_err(safe_http_error)?
            .to_string();
        let fetched = self.fetch(&source_url).await?;
        if parse_feed(
            &fetched.body,
            fetched.url.as_str(),
            chrono::Utc::now().timestamp(),
        )
        .is_ok()
        {
            return Ok(FeedPreview {
                source_url,
                candidates: vec![FeedCandidate {
                    title: None,
                    feed_url: fetched.url.to_string(),
                }],
            });
        }

        let candidates = discover_feed_links(&fetched.body, &fetched.url);
        if candidates.is_empty() {
            return Err(AppError::rss_error(
                "rss_feed_not_found",
                "No RSS or Atom feed was found at this address",
            ));
        }
        Ok(FeedPreview {
            source_url,
            candidates,
        })
    }

    pub async fn fetch_and_parse(&self, feed_url: &str) -> AppResult<(String, ParsedFeed)> {
        let fetched = self.fetch(feed_url).await?;
        let parsed = parse_feed(
            &fetched.body,
            fetched.url.as_str(),
            chrono::Utc::now().timestamp(),
        )?;
        Ok((fetched.url.to_string(), parsed))
    }

    async fn fetch(&self, raw_url: &str) -> AppResult<FetchedBody> {
        tokio::time::timeout(REQUEST_TIMEOUT, self.fetch_inner(raw_url))
            .await
            .map_err(|_| AppError::rss_error("rss_request_timeout", "The feed request timed out"))?
    }

    async fn fetch_inner(&self, raw_url: &str) -> AppResult<FetchedBody> {
        let mut url = parse_http_url(raw_url).map_err(safe_http_error)?;
        for redirect_count in 0..=MAX_REDIRECTS {
            let addresses = resolve_public_target(&url).await.map_err(safe_http_error)?;
            let host = url.host_str().ok_or_else(|| {
                AppError::rss_error("rss_invalid_url", "The feed URL has no host")
            })?;
            let client = reqwest::Client::builder()
                .redirect(Policy::none())
                .user_agent(USER_AGENT)
                .resolve(host, addresses[0])
                .build()
                .map_err(request_error)?;
            let response = client
                .get(url.clone())
                .header(header::ACCEPT, "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.1")
                .send()
                .await
                .map_err(request_error)?;

            if response.status().is_redirection() {
                if redirect_count == MAX_REDIRECTS {
                    return Err(AppError::rss_error(
                        "rss_too_many_redirects",
                        "The feed redirected too many times",
                    ));
                }
                let location = response
                    .headers()
                    .get(header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| {
                        AppError::rss_error(
                            "rss_invalid_redirect",
                            "The feed returned an invalid redirect",
                        )
                    })?;
                url = url.join(location).map_err(|_| {
                    AppError::rss_error(
                        "rss_invalid_redirect",
                        "The feed returned an invalid redirect",
                    )
                })?;
                parse_http_url(url.as_str()).map_err(safe_http_error)?;
                continue;
            }

            if response.status() != StatusCode::OK {
                return Err(AppError::rss_error(
                    "rss_http_error",
                    format!("The feed request returned HTTP {}", response.status()),
                ));
            }
            let mut body = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(request_error)?;
                if body.len().saturating_add(chunk.len()) > MAX_BODY_BYTES {
                    return Err(AppError::rss_error(
                        "rss_response_too_large",
                        "The feed response exceeds 5 MB",
                    ));
                }
                body.extend_from_slice(&chunk);
            }
            return Ok(FetchedBody { url, body });
        }
        unreachable!("redirect loop always returns")
    }
}

struct FetchedBody {
    url: Url,
    body: Vec<u8>,
}

fn discover_feed_links(body: &[u8], base_url: &Url) -> Vec<FeedCandidate> {
    let html = String::from_utf8_lossy(body);
    let document = Html::parse_document(&html);
    let selector = Selector::parse("link[rel][href]").expect("static selector is valid");
    let mut candidates = Vec::new();
    for element in document.select(&selector) {
        let value = element.value();
        let is_alternate = value.attr("rel").is_some_and(|rel| {
            rel.split_ascii_whitespace()
                .any(|item| item.eq_ignore_ascii_case("alternate"))
        });
        let is_feed = value.attr("type").is_some_and(|kind| {
            matches!(
                kind.split(';')
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase()
                    .as_str(),
                "application/rss+xml" | "application/atom+xml"
            )
        });
        if !is_alternate || !is_feed {
            continue;
        }
        let Some(feed_url) = value.attr("href").and_then(|href| base_url.join(href).ok()) else {
            continue;
        };
        if !matches!(feed_url.scheme(), "http" | "https") {
            continue;
        }
        let feed_url = feed_url.to_string();
        if candidates
            .iter()
            .any(|item: &FeedCandidate| item.feed_url == feed_url)
        {
            continue;
        }
        candidates.push(FeedCandidate {
            title: value
                .attr("title")
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
            feed_url,
        });
    }
    candidates
}

fn safe_http_error(error: crate::safe_http::SafeHttpError) -> AppError {
    AppError::rss_error("rss_unsafe_url", error.to_string())
}

fn request_error(error: reqwest::Error) -> AppError {
    AppError::rss_error("rss_request_failed", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::discover_feed_links;
    use url::Url;

    #[test]
    fn discovers_atom_and_rss_links_without_duplicates() {
        let html = br#"<html><head>
            <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
            <link rel="alternate stylesheet" type="application/atom+xml; charset=utf-8" href="atom.xml">
            <link rel="stylesheet" type="application/rss+xml" href="ignored.xml">
            <link rel="alternate" type="application/rss+xml" href="/feed.xml">
        </head></html>"#;
        let links = discover_feed_links(html, &Url::parse("https://example.com/blog/").unwrap());
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].feed_url, "https://example.com/feed.xml");
        assert_eq!(links[1].feed_url, "https://example.com/blog/atom.xml");
    }
}
