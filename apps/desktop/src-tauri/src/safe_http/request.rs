use std::time::Duration;

use reqwest::{header::HeaderMap, redirect::Policy, Response, StatusCode};
use tokio::time::{timeout_at, Instant};
use url::Url;

use super::{parse_http_url, resolve_public_target, SafeHttpError};
use crate::logging::Operation;

const MAX_REDIRECTS: usize = 5;

// Test connections use loopback after validating the simulated DNS answers.
// There is no production option to relax the public-address policy.
#[derive(Default)]
struct Network {
    #[cfg(test)]
    endpoint: Option<std::net::SocketAddr>,
}

impl Network {
    async fn addresses(&self, url: &Url) -> Result<Vec<std::net::SocketAddr>, SafeHttpError> {
        #[cfg(test)]
        if matches!(
            url.host_str(),
            Some("public.test" | "other.test" | "mixed.test")
        ) {
            let answers = if url.host_str() == Some("mixed.test") {
                vec![
                    "1.1.1.1:80".parse().unwrap(),
                    "127.0.0.1:80".parse().unwrap(),
                ]
            } else {
                vec!["1.1.1.1:80".parse().unwrap()]
            };
            super::validate_addresses(&answers)?;
            if let Some(endpoint) = self.endpoint {
                return Ok(vec![endpoint]);
            }
        }
        resolve_public_target(url).await
    }
}

/// A credential may only be attached to this exact origin. Never returned in final_url.
pub(crate) struct QueryCredential {
    pub origin: url::Origin,
    pub name: String,
    pub value: String,
}

pub(crate) struct RequestOptions {
    pub timeout: Duration,
    pub max_bytes: usize,
    pub https_only: bool,
    pub headers: HeaderMap,
    pub credential: Option<QueryCredential>,
}

/// The raw response stays private so callers cannot bypass deadline or body limits.
pub(crate) struct SafeResponse {
    response: Response,
    pub final_url: Url,
    pub redirects: usize,
    deadline: Instant,
    remaining: usize,
    failure: Option<SafeHttpError>,
}

impl SafeResponse {
    pub fn status(&self) -> StatusCode {
        self.response.status()
    }
    pub fn headers(&self) -> &HeaderMap {
        self.response.headers()
    }

    pub async fn chunk(&mut self) -> Result<Option<Vec<u8>>, SafeHttpError> {
        if let Some(error) = self.failure {
            return Err(error);
        }
        let result = self.read_chunk().await;
        if let Err(error) = &result {
            self.failure = Some(*error);
        }
        result
    }

    async fn read_chunk(&mut self) -> Result<Option<Vec<u8>>, SafeHttpError> {
        if Instant::now() >= self.deadline {
            return Err(SafeHttpError::Timeout);
        }
        let chunk = timeout_at(self.deadline, self.response.chunk())
            .await
            .map_err(|_| SafeHttpError::Timeout)?
            .map_err(request_error)?;
        match chunk {
            Some(chunk) if chunk.len() > self.remaining => Err(SafeHttpError::BodyTooLarge),
            Some(chunk) => {
                self.remaining -= chunk.len();
                Ok(Some(chunk.to_vec()))
            }
            None => Ok(None),
        }
    }

    pub async fn bytes(mut self) -> Result<Vec<u8>, SafeHttpError> {
        let mut bytes = Vec::new();
        while let Some(chunk) = self.chunk().await? {
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

pub(crate) async fn get(
    raw_url: &str,
    options: RequestOptions,
) -> Result<SafeResponse, SafeHttpError> {
    let deadline = Instant::now() + options.timeout;
    timeout_at(
        deadline,
        request(raw_url, options, deadline, &Network::default()),
    )
    .await
    .map_err(|_| SafeHttpError::Timeout)?
}

async fn request(
    raw_url: &str,
    options: RequestOptions,
    deadline: Instant,
    network: &Network,
) -> Result<SafeResponse, SafeHttpError> {
    let operation = Operation::start();
    let mut url = parse_http_url(raw_url)?;
    strip_credential(&mut url, options.credential.as_ref());
    let initial_origin = url.origin();
    for redirects in 0..=MAX_REDIRECTS {
        validate_url(&url, options.https_only)?;
        let addresses = network.addresses(&url).await?;
        let host = url.host_str().ok_or(SafeHttpError::InvalidTarget)?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .resolve_to_addrs(host, &addresses)
            .build()
            .map_err(request_error)?;
        let mut target = url.clone();
        if let Some(credential) = &options.credential {
            if target.origin() == credential.origin {
                target
                    .query_pairs_mut()
                    .append_pair(&credential.name, &credential.value);
            }
        }
        let mut headers = options.headers.clone();
        headers.remove(reqwest::header::PROXY_AUTHORIZATION);
        if url.origin() != initial_origin {
            headers.remove(reqwest::header::AUTHORIZATION);
            headers.remove(reqwest::header::COOKIE);
            headers.remove(reqwest::header::REFERER);
        }
        let response = client
            .get(target)
            .headers(headers)
            .send()
            .await
            .map_err(request_error)?;
        log::debug!(
            "safe_http_hop operation_id={} redirect={} status={}",
            operation.id(),
            redirects,
            response.status().as_u16()
        );
        if response.status().is_redirection() {
            if redirects == MAX_REDIRECTS {
                return Err(SafeHttpError::TooManyRedirects);
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or(SafeHttpError::InvalidRedirect)?;
            url = url
                .join(location)
                .map_err(|_| SafeHttpError::InvalidRedirect)?;
            strip_credential(&mut url, options.credential.as_ref());
            continue;
        }
        return Ok(SafeResponse {
            response,
            final_url: url,
            redirects,
            deadline,
            remaining: options.max_bytes,
            failure: None,
        });
    }
    unreachable!("bounded redirect loop")
}

fn validate_url(url: &Url, https_only: bool) -> Result<(), SafeHttpError> {
    parse_http_url(url.as_str())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(SafeHttpError::UnsafeTarget);
    }
    if https_only && url.scheme() != "https" {
        return Err(SafeHttpError::UnsupportedProtocol);
    }
    Ok(())
}

fn strip_credential(url: &mut Url, credential: Option<&QueryCredential>) {
    let Some(credential) = credential else {
        return;
    };
    let pairs = url
        .query_pairs()
        .filter(|(name, value)| {
            name != credential.name.as_str()
                || (url.origin() != credential.origin && value != credential.value.as_str())
        })
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
}

fn request_error(error: reqwest::Error) -> SafeHttpError {
    if error.is_timeout() {
        SafeHttpError::Timeout
    } else {
        SafeHttpError::RequestFailed
    }
}

#[cfg(test)]
mod tests;
