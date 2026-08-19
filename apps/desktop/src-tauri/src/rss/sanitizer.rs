use std::borrow::Cow;

use ammonia::{Builder, Url, UrlRelative};

pub fn sanitize_html(input: &str, base_url: &str) -> String {
    let Ok(base) = Url::parse(base_url) else {
        return ammonia::clean(input);
    };
    let mut builder = Builder::default();
    let image_base = base.clone();
    builder.attribute_filter(
        move |element, attribute, value| match (element, attribute) {
            ("img", "src") => image_base
                .join(value)
                .ok()
                .filter(|url| url.scheme() == "https")
                .map(|url| Cow::Owned(url.to_string())),
            ("img", "srcset") => None,
            _ => Some(Cow::Borrowed(value)),
        },
    );
    builder.url_relative(UrlRelative::RewriteWithBase(base));
    builder.clean(input).to_string()
}

pub fn plain_text_html(input: &str) -> String {
    ammonia::clean_text(input)
}

pub fn summarize_html(input: &str, max_chars: usize) -> String {
    let document = scraper::Html::parse_fragment(input);
    let text = document.root_element().text().collect::<Vec<_>>().join(" ");
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::{sanitize_html, summarize_html};

    #[test]
    fn removes_executable_content_and_rewrites_relative_urls() {
        let clean = sanitize_html(
            r#"<p onclick="alert(1)"><a href="/post">Read</a><script>alert(1)</script><img src="/a.png" onerror="alert(1)"></p>"#,
            "https://example.com/feed.xml",
        );
        assert!(!clean.contains("script"));
        assert!(!clean.contains("onclick"));
        assert!(!clean.contains("onerror"));
        assert!(clean.contains("https://example.com/post"));
        assert!(clean.contains("https://example.com/a.png"));
        let clean = sanitize_html(
            r#"<img src="http://example.com/insecure.png"><iframe src="https://example.com"></iframe><form><input></form><style>body{display:none}</style>"#,
            "https://example.com/feed.xml",
        );
        assert!(!clean.contains("insecure.png"));
        assert!(!clean.contains("iframe"));
        assert!(!clean.contains("form"));
        assert!(!clean.contains("style"));
    }

    #[test]
    fn summarizes_unicode_on_character_boundaries() {
        assert_eq!(summarize_html("<p>你好   world 😀</p>", 8), "你好 world");
    }
}
