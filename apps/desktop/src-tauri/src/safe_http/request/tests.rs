use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn options() -> RequestOptions {
    RequestOptions {
        timeout: Duration::from_secs(2),
        max_bytes: 4,
        https_only: false,
        headers: HeaderMap::new(),
        credential: None,
    }
}

async fn server(responses: Vec<&'static str>) -> (Network, tokio::task::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let mut requests = Vec::new();
        for response in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut received = Vec::new();
            loop {
                let mut buf = [0; 1024];
                let count = socket.read(&mut buf).await.unwrap();
                if count == 0 {
                    break;
                }
                received.extend_from_slice(&buf[..count]);
                if received.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            requests.push(String::from_utf8(received).unwrap());
            socket.write_all(response.as_bytes()).await.unwrap();
        }
        requests
    });
    (
        Network {
            endpoint: Some(endpoint),
        },
        task,
    )
}

async fn fetch(network: &Network, opts: RequestOptions) -> Result<SafeResponse, SafeHttpError> {
    let url = format!(
        "http://public.test:{}/start",
        network.endpoint.unwrap().port()
    );
    let deadline = Instant::now() + opts.timeout;
    timeout_at(deadline, request(&url, opts, deadline, network))
        .await
        .map_err(|_| SafeHttpError::Timeout)?
}

#[tokio::test]
async fn follows_relative_redirect_and_limits_streamed_body() {
    let (network, task) = server(vec![
        "HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n",
    ]).await;
    let response = fetch(&network, options()).await.unwrap();
    assert_eq!(response.final_url.path(), "/final");
    assert_eq!(response.redirects, 1);
    assert_eq!(response.bytes().await, Err(SafeHttpError::BodyTooLarge));
    assert_eq!(task.await.unwrap().len(), 2);
}

#[tokio::test]
async fn rejects_redirect_to_private_target_before_connecting() {
    let (network, task) = server(vec![
        "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    ]).await;
    assert!(matches!(
        fetch(&network, options()).await,
        Err(SafeHttpError::UnsafeTarget)
    ));
    assert_eq!(task.await.unwrap().len(), 1);
}

#[tokio::test]
async fn rejects_mixed_dns_answers() {
    let network = Network::default();
    let deadline = Instant::now() + Duration::from_secs(1);
    assert!(matches!(
        request("http://mixed.test/", options(), deadline, &network).await,
        Err(SafeHttpError::UnsafeTarget)
    ));
}

#[tokio::test]
async fn strips_credentials_on_cross_origin_redirect_and_from_final_url() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let mut requests = Vec::new();
        for hop in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = [0; 4096];
            let count = socket.read(&mut buf).await.unwrap();
            requests.push(String::from_utf8_lossy(&buf[..count]).into_owned());
            let response = if hop == 0 {
                format!("HTTP/1.1 302 Found\r\nLocation: http://other.test:{}/final?key=test-secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", endpoint.port())
            } else {
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".into()
            };
            socket.write_all(response.as_bytes()).await.unwrap();
        }
        requests
    });
    let network = Network {
        endpoint: Some(endpoint),
    };
    let mut opts = options();
    opts.credential = Some(QueryCredential {
        origin: Url::parse(&format!("http://public.test:{}", endpoint.port()))
            .unwrap()
            .origin(),
        name: "key".into(),
        value: "test-secret".into(),
    });
    opts.headers.insert(
        reqwest::header::AUTHORIZATION,
        "Bearer test-token".parse().unwrap(),
    );
    let response = fetch(&network, opts).await.unwrap();
    assert!(!response.final_url.as_str().contains("key"));
    assert_eq!(response.bytes().await.unwrap(), b"ok");
    let requests = task.await.unwrap();
    assert!(requests[0].contains("key=test-secret"));
    assert!(!requests[1].contains("test-secret"));
    assert!(!requests[1].contains("test-token"));
}

#[tokio::test]
async fn body_deadline_includes_time_since_request_started() {
    let (network, task) = server(vec![
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
    ])
    .await;
    let mut opts = options();
    opts.timeout = Duration::from_millis(100);
    let response = fetch(&network, opts).await.unwrap();
    tokio::time::sleep(Duration::from_millis(120)).await;
    assert_eq!(response.bytes().await, Err(SafeHttpError::Timeout));
    task.await.unwrap();
}

#[tokio::test]
async fn https_only_and_mapped_private_addresses_are_rejected() {
    let mut opts = options();
    opts.https_only = true;
    assert!(matches!(
        get("http://example.com", opts).await,
        Err(SafeHttpError::UnsupportedProtocol)
    ));
    assert!(matches!(
        get("http://[::ffff:127.0.0.1]/", options()).await,
        Err(SafeHttpError::UnsafeTarget)
    ));
}

#[tokio::test]
async fn accepts_exact_limit_and_stops_redirect_loops() {
    let (network, task) = server(vec![
        "HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n1234",
    ])
    .await;
    assert_eq!(
        fetch(&network, options())
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap(),
        b"1234"
    );
    task.await.unwrap();
    let (network, task) = server(vec![
        "HTTP/1.1 302 Found\r\nLocation: /loop\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        MAX_REDIRECTS + 1
    ])
    .await;
    assert!(matches!(
        fetch(&network, options()).await,
        Err(SafeHttpError::TooManyRedirects)
    ));
    assert_eq!(task.await.unwrap().len(), MAX_REDIRECTS + 1);
}

#[tokio::test]
async fn stalled_headers_respect_total_deadline() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let network = Network {
        endpoint: Some(listener.local_addr().unwrap()),
    };
    let task = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        std::future::pending::<()>().await;
    });
    let mut opts = options();
    opts.timeout = Duration::from_millis(100);
    assert!(matches!(
        fetch(&network, opts).await,
        Err(SafeHttpError::Timeout)
    ));
    task.abort();
}
