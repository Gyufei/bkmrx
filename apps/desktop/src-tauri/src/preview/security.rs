use std::net::{IpAddr, SocketAddr};

use url::Url;

use super::model::{BookmarkPreview, PreviewFallbackReason};

pub fn parse_http_url(raw_url: &str) -> Result<Url, BookmarkPreview> {
    let url = Url::parse(raw_url).map_err(|_| {
        BookmarkPreview::fallback(
            raw_url,
            PreviewFallbackReason::UnsupportedProtocol,
            "该地址不是有效的网页链接",
        )
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(BookmarkPreview::fallback(
            raw_url,
            PreviewFallbackReason::UnsupportedProtocol,
            "此类地址不能在应用内预览",
        ));
    }
    Ok(url)
}

pub async fn resolve_public_target(url: &Url) -> Result<Vec<SocketAddr>, BookmarkPreview> {
    let host = url.host_str().ok_or_else(|| unsafe_target(url))?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err(unsafe_target(url));
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| unsafe_target(url))?;
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| {
            BookmarkPreview::fallback(
                url.as_str(),
                PreviewFallbackReason::DnsFailure,
                "无法解析网页地址",
            )
        })?
        .collect::<Vec<_>>();

    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(unsafe_target(url));
    }
    Ok(addresses)
}

fn unsafe_target(url: &Url) -> BookmarkPreview {
    BookmarkPreview::fallback(
        url.as_str(),
        PreviewFallbackReason::UnsafeTarget,
        "出于安全原因，不能预览本机或私有网络地址",
    )
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_broadcast())
        }
        IpAddr::V6(ip) => {
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (ip.segments()[0] & 0xfe00) == 0xfc00
                || (ip.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_public_ip, parse_http_url};

    #[test]
    fn rejects_non_http_protocols() {
        assert!(parse_http_url("file:///tmp/test").is_err());
        assert!(parse_http_url("https://example.com").is_ok());
    }

    #[test]
    fn rejects_private_addresses() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("192.168.1.2".parse().unwrap()));
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
    }
}
