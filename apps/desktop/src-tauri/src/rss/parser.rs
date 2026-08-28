use feed_rs::{
    model::{Entry, FeedType},
    parser::Builder,
};
use sha2::{Digest, Sha256};
use url::Url;

use crate::error::{AppError, AppResult};

use super::{
    model::{ParsedEntry, ParsedFeed},
    sanitizer::{plain_text_html, sanitize_html, summarize_html},
};

pub fn parse_feed(source: &[u8], feed_url: &str, fetched_at: i64) -> AppResult<ParsedFeed> {
    let feed = Builder::new()
        .base_uri(Some(feed_url))
        // Keep missing source IDs empty so our link/title hash fallback owns deduplication.
        .id_generator(|_, _, source_id| source_id.unwrap_or_default().trim().to_owned())
        .build()
        .parse(source)
        .map_err(|error| AppError::rss_error("rss_parse_failed", error.to_string()))?;
    if feed.feed_type == FeedType::JSON {
        return Err(AppError::rss_error(
            "rss_unsupported_format",
            "JSON Feed is not supported in this version",
        ));
    }

    let title = feed
        .title
        .as_ref()
        .map(|title| title.content.trim())
        .filter(|title| !title.is_empty())
        .unwrap_or("未命名订阅")
        .to_owned();
    let site_url = select_link(&feed.links).and_then(normalize_url);
    let entries = feed
        .entries
        .iter()
        .map(|entry| map_entry(entry, feed_url, fetched_at))
        .collect();

    Ok(ParsedFeed {
        title,
        site_url,
        entries,
    })
}

fn map_entry(entry: &Entry, feed_url: &str, fetched_at: i64) -> ParsedEntry {
    let link = select_link(&entry.links).and_then(normalize_url);
    let base_url = link.as_deref().unwrap_or(feed_url);
    let (raw_content, is_html) = entry
        .content
        .as_ref()
        .and_then(|content| {
            content.body.as_deref().map(|body| {
                let kind = content.content_type.as_str();
                (body, kind.contains("html") || kind.contains("xml"))
            })
        })
        .or_else(|| {
            entry.summary.as_ref().map(|summary| {
                let kind = summary.content_type.as_str();
                (summary.content.as_str(), kind.contains("html"))
            })
        })
        .unwrap_or(("", false));
    let content_html = if is_html {
        sanitize_html(raw_content, base_url)
    } else {
        plain_text_html(raw_content)
    };
    let feed_summary = entry
        .summary
        .as_ref()
        .map(|summary| summarize_html(&summary.content, 140))
        .filter(|summary| !summary.is_empty());
    let summary = feed_summary.unwrap_or_else(|| summarize_html(&content_html, 140));
    // feed-rs resolves a missing RSS <guid> to the parser base URI. Treat that
    // generated feed URL as missing so separate items fall back to their links.
    let guid = non_empty(&entry.id).filter(|guid| !same_url(guid, feed_url));
    let published_at = entry
        .published
        .or(entry.updated)
        .map(|date| date.timestamp());
    let title = entry
        .title
        .as_ref()
        .map(|title| title.content.trim())
        .filter(|title| !title.is_empty())
        .unwrap_or("无标题")
        .to_owned();
    let dedupe_key = dedupe_key(guid.as_deref(), link.as_deref(), &title, published_at);

    ParsedEntry {
        dedupe_key,
        guid,
        title,
        link,
        author: entry
            .authors
            .first()
            .and_then(|author| non_empty(&author.name)),
        content_html,
        summary,
        published_at,
        fetched_at,
    }
}

fn select_link(links: &[feed_rs::model::Link]) -> Option<&str> {
    links
        .iter()
        .find(|link| link.rel.as_deref().is_none_or(|rel| rel == "alternate"))
        .or_else(|| links.first())
        .map(|link| link.href.as_str())
}

fn normalize_url(raw: &str) -> Option<String> {
    let mut url = Url::parse(raw).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    url.set_fragment(None);
    Some(url.to_string())
}

fn same_url(left: &str, right: &str) -> bool {
    normalize_url(left) == normalize_url(right)
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn dedupe_key(
    guid: Option<&str>,
    link: Option<&str>,
    title: &str,
    published_at: Option<i64>,
) -> String {
    if let Some(guid) = guid {
        return format!("guid:{guid}");
    }
    if let Some(link) = link {
        return format!("link:{link}");
    }
    let input = format!("{title}\n{}", published_at.unwrap_or_default());
    format!("hash:{:x}", Sha256::digest(input.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::parse_feed;

    #[test]
    fn parses_rss_and_sanitizes_entry_content() {
        let rss = br#"<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Example</title><link>https://example.com</link><description>Test</description><item><guid>one</guid><title>Hello</title><link>https://example.com/post#fragment</link><content:encoded><![CDATA[<p onclick="x()">Body<script>x()</script></p>]]></content:encoded><pubDate>Tue, 19 Aug 2025 10:00:00 GMT</pubDate></item></channel></rss>"#;
        let parsed = parse_feed(rss, "https://example.com/feed.xml", 10).unwrap();

        assert_eq!(parsed.title, "Example");
        assert_eq!(parsed.site_url.as_deref(), Some("https://example.com/"));
        assert_eq!(parsed.entries[0].dedupe_key, "guid:one");
        assert_eq!(
            parsed.entries[0].link.as_deref(),
            Some("https://example.com/post")
        );
        assert!(parsed.entries[0].content_html.contains("Body"));
        assert!(!parsed.entries[0].content_html.contains("script"));
    }

    #[test]
    fn parses_atom_with_relative_links() {
        let atom = br#"<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>feed</id><title>Atom</title><updated>2025-08-19T10:00:00Z</updated><link rel="alternate" href="/"/><entry><id>entry-one</id><title>Post</title><updated>2025-08-19T10:00:00Z</updated><link rel="alternate" href="/post"/><summary type="html">Summary</summary></entry></feed>"#;
        let parsed = parse_feed(atom, "https://example.com/feed.atom", 10).unwrap();

        assert_eq!(
            parsed.entries[0].link.as_deref(),
            Some("https://example.com/post")
        );
        assert_eq!(parsed.entries[0].dedupe_key, "guid:entry-one");
    }

    #[test]
    fn rss_items_without_guids_are_deduplicated_by_link() {
        let rss = br#"<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><link>https://example.com</link><description>Test</description><item><title>One</title><link>https://example.com/one</link></item><item><title>Two</title><link>https://example.com/two</link></item></channel></rss>"#;
        let parsed = parse_feed(rss, "https://example.com/feed", 10).unwrap();

        assert_eq!(parsed.entries[0].guid, None);
        assert_eq!(parsed.entries[0].dedupe_key, "link:https://example.com/one");
        assert_eq!(parsed.entries[1].guid, None);
        assert_eq!(parsed.entries[1].dedupe_key, "link:https://example.com/two");
    }

    #[test]
    fn rejects_json_feed_in_rss_v1() {
        let json = br#"{"version":"https://jsonfeed.org/version/1.1","title":"JSON","items":[]}"#;
        let error = parse_feed(json, "https://example.com/feed.json", 10).unwrap_err();
        assert_eq!(error.code(), "rss_unsupported_format");
    }
}
