use std::net::{IpAddr, SocketAddr};

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SafeHttpError {
    #[error("the URL is invalid")]
    InvalidUrl,
    #[error("only HTTP and HTTPS URLs are allowed")]
    UnsupportedProtocol,
    #[error("the URL has no valid host or port")]
    InvalidTarget,
    #[error("the host could not be resolved")]
    DnsFailure,
    #[error("the target resolves to a non-public address")]
    UnsafeTarget,
}

pub fn parse_http_url(raw_url: &str) -> Result<Url, SafeHttpError> {
    let url = Url::parse(raw_url).map_err(|_| SafeHttpError::InvalidUrl)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(SafeHttpError::UnsupportedProtocol);
    }
    if url.host_str().is_none() {
        return Err(SafeHttpError::InvalidTarget);
    }
    Ok(url)
}

pub async fn resolve_public_target(url: &Url) -> Result<Vec<SocketAddr>, SafeHttpError> {
    let host = url.host_str().ok_or(SafeHttpError::InvalidTarget)?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err(SafeHttpError::UnsafeTarget);
    }

    let port = url
        .port_or_known_default()
        .ok_or(SafeHttpError::InvalidTarget)?;
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| SafeHttpError::DnsFailure)?
        .collect::<Vec<_>>();

    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(SafeHttpError::UnsafeTarget);
    }
    Ok(addresses)
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
    use super::{is_public_ip, parse_http_url, SafeHttpError};

    #[test]
    fn accepts_only_http_urls_with_hosts() {
        assert!(parse_http_url("https://example.com/feed.xml").is_ok());
        assert_eq!(
            parse_http_url("file:///tmp/feed.xml"),
            Err(SafeHttpError::UnsupportedProtocol)
        );
        assert_eq!(parse_http_url("not a url"), Err(SafeHttpError::InvalidUrl));
    }

    #[test]
    fn classifies_non_public_addresses() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "192.168.1.2",
            "169.254.1.1",
            "::1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(!is_public_ip(address.parse().unwrap()), "{address}");
        }
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }
}
